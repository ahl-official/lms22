const router = require('express').Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Test = require('../models/Test');
const Enrollment = require('../models/Enrollment');
const Attempt = require('../models/Attempt');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/analytics/overview
router.get('/overview', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const trainerFilter = req.user.role === 'trainer' ? { created_by: req.user._id } : {};
    const trainerCourseIds = req.user.role === 'trainer'
      ? (await Course.find({ created_by: req.user._id }).select('_id')).map(c => c._id)
      : null;

    const enrollFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};
    const attemptFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};

    const [
      totalUsers, trainees, trainers,
      totalCourses, publishedCourses, voiceCourses,
      totalEnrollments, completedEnrollments,
      totalAttempts, voiceAttempts, passedAttempts,
    ] = await Promise.all([
      User.countDocuments({ is_active: true }),
      User.countDocuments({ role: 'trainee', is_active: true }),
      User.countDocuments({ role: 'trainer', is_active: true }),
      Course.countDocuments(trainerFilter),
      Course.countDocuments({ ...trainerFilter, is_published: true }),
      Course.countDocuments({ ...trainerFilter, requires_voice_test: true }),
      Enrollment.countDocuments(enrollFilter),
      Enrollment.countDocuments({ ...enrollFilter, status: 'completed' }),
      Attempt.countDocuments(attemptFilter),
      Attempt.countDocuments({ ...attemptFilter, test_type: 'voice' }),
      Attempt.countDocuments({ ...attemptFilter, score: { $gte: 60 } }),
    ]);

    const topCourses = await Course.aggregate([
      { $match: trainerFilter },
      { $lookup: { from: 'enrollments', localField: '_id', foreignField: 'course_id', as: 'enrollments' } },
      { $lookup: { from: 'attempts', localField: '_id', foreignField: 'course_id', as: 'attempts' } },
      {
        $project: {
          title: 1, requires_voice_test: 1,
          enrolled_count: { $size: '$enrollments' },
          completed_count: {
            $size: { $filter: { input: '$enrollments', as: 'e', cond: { $eq: ['$$e.status', 'completed'] } } },
          },
          avg_score: { $avg: '$attempts.score' },
          pass_rate: {
            $cond: [
              { $gt: [{ $size: '$attempts' }, 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $size: { $filter: { input: '$attempts', as: 'a', cond: { $gte: ['$$a.score', 60] } } } },
                      { $size: '$attempts' },
                    ]
                  },
                  100,
                ],
              },
              null,
            ],
          },
        },
      },
      { $sort: { enrolled_count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      stats: {
        total_users: totalUsers,
        trainees, trainers,
        active_trainees: trainees,
        total_courses: totalCourses,
        published_courses: publishedCourses,
        voice_courses: voiceCourses,
        total_enrollments: totalEnrollments,
        completed_enrollments: completedEnrollments,
        total_attempts: totalAttempts,
        voice_attempts: voiceAttempts,
        avg_pass_rate: totalAttempts > 0 ? Math.round((passedAttempts / totalAttempts) * 100) : 0,
      },
      top_courses: topCourses,
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/trainee/:traineeId
router.get('/trainee/:traineeId', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { traineeId } = req.params;
    const [enrollments, recentAttempts] = await Promise.all([
      Enrollment.find({ trainee_id: traineeId })
        .populate('course_id', 'title requires_voice_test')
        .sort({ createdAt: -1 }),
      Attempt.find({ trainee_id: traineeId })
        .populate('course_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(10),
    ]);

    const completed = enrollments.filter(e => e.status === 'completed').length;
    const voiceAttemptCount = recentAttempts.filter(a => a.test_type === 'voice').length;

    res.json({
      success: true,
      enrollments: enrollments.map(e => ({
        ...e.toObject(),
        course_title: e.course_id?.title,
        requires_voice_test: e.course_id?.requires_voice_test,
      })),
      completed_count: completed,
      voice_attempt_count: voiceAttemptCount,
      recent_attempts: recentAttempts.map(a => ({
        ...a.toObject(),
        course_title: a.course_id?.title,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/analytics/voice-trends (30-day daily avg)
router.get('/voice-trends', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trends = await Attempt.aggregate([
      { $match: { test_type: 'voice', submitted_at: { $gte: since }, score: { $ne: null } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$submitted_at' } },
          avg_score: { $avg: '$score' },
          attempt_count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $project: { date: '$_id', avg_score: { $round: ['$avg_score', 1] }, attempt_count: 1, _id: 0 } },
    ]);
    res.json({ success: true, trends });
  } catch (err) { next(err); }
});

// GET /api/analytics/modules/course/:courseId
router.get('/modules/course/:courseId', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const modules = await Module.find({ course_id: req.params.courseId }).sort({ order: 1 });

    const result = await Promise.all(modules.map(async (mod) => {
      const tests = await Test.find({ module_id: mod._id }).select('_id passing_score');
      const testIds = tests.map(t => t._id);

      if (!testIds.length) {
        return { ...mod.toObject(), attempt_count: 0, avg_score: null, pass_rate: null, trainee_count: 0 };
      }

      const attempts = await Attempt.find({
        test_id: { $in: testIds },
        status: 'scored',
        score: { $ne: null },
      }).select('trainee_id test_id score submitted_at');

      const attempt_count = attempts.length;
      const avg_score = attempt_count > 0
        ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempt_count)
        : null;

      const passed = attempts.filter(a => {
        const test = tests.find(t => t._id.equals(a.test_id));
        return a.score >= (test?.passing_score || 60);
      });
      const pass_rate = attempt_count > 0 ? Math.round((passed.length / attempt_count) * 100) : null;
      const trainee_count = new Set(attempts.map(a => a.trainee_id.toString())).size;

      return { ...mod.toObject(), attempt_count, avg_score, pass_rate, trainee_count };
    }));

    res.json({ success: true, modules: result });
  } catch (err) { next(err); }
});

// GET /api/analytics/modules/:moduleId/trainees
router.get('/modules/:moduleId/trainees', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const tests = await Test.find({ module_id: req.params.moduleId }).select('_id title passing_score test_type');
    const testIds = tests.map(t => t._id);

    if (!testIds.length) return res.json({ success: true, trainees: [] });

    const attempts = await Attempt.find({ test_id: { $in: testIds }, status: 'scored' })
      .populate('trainee_id', 'name email')
      .sort({ submitted_at: -1 });

    const traineeMap = new Map();

    for (const attempt of attempts) {
      const tid = attempt.trainee_id?._id?.toString();
      if (!tid) continue;

      if (!traineeMap.has(tid)) {
        traineeMap.set(tid, {
          trainee_id: tid,
          name: attempt.trainee_id.name,
          email: attempt.trainee_id.email,
          attempts: [],
          best_score: null,
          latest_attempt: null,
          passed: false,
        });
      }

      const entry = traineeMap.get(tid);
      const test = tests.find(t => t._id.equals(attempt.test_id));

      entry.attempts.push({
        attempt_id: attempt._id,
        test_title: test?.title || 'Unknown test',
        test_type: attempt.test_type,
        score: attempt.score,
        passing_score: test?.passing_score || 60,
        passed: attempt.score >= (test?.passing_score || 60),
        submitted_at: attempt.submitted_at,
        ai_feedback: attempt.ai_feedback || null,
      });

      if (entry.best_score === null || attempt.score > entry.best_score) entry.best_score = attempt.score;
      if (!entry.latest_attempt || attempt.submitted_at > entry.latest_attempt) entry.latest_attempt = attempt.submitted_at;
      if (attempt.score >= (test?.passing_score || 60)) entry.passed = true;
    }

    const trainees = Array.from(traineeMap.values()).sort((a, b) => {
      if (b.best_score !== a.best_score) return (b.best_score || 0) - (a.best_score || 0);
      return a.name.localeCompare(b.name);
    });

    res.json({ success: true, trainees, tests });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics/admin/student-progress
// Admin-only: all trainees with enrollments, scores, activity, status.
// Query params: search, category_id, status (in_progress|completed|struggling|not_started)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/student-progress', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { search, category_id, status } = req.query;

    // ── Build user filter ────────────────────────────────────────────────────
    const userFilter = {
      is_active: { $ne: false },
      $or: [{ role: 'trainee' }, { roles: 'trainee' }],
    };

    if (category_id && search) {
      userFilter.$and = [
        { $or: [{ category_ids: category_id }, { category_id }] },
        { $or: [{ name: { $regex: search, $options: 'i' } }, { email: { $regex: search, $options: 'i' } }] },
      ];
      delete userFilter.$or;
    } else if (category_id) {
      userFilter.$or = [{ category_ids: category_id }, { category_id }];
    } else if (search) {
      userFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // ── Fetch trainees ───────────────────────────────────────────────────────
    const trainees = await User.find(userFilter)
      .select('name email category_id last_login_at createdAt')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false })
      .sort({ last_login_at: -1 })
      .limit(300)
      .lean();

    if (!trainees.length) {
      return res.json({
        success: true,
        students: [],
        stats: {
          total: 0, active_count: 0, in_progress_count: 0,
          completed_count: 0, struggling_count: 0, not_started_count: 0,
          avg_score: null, avg_completion: 0,
        },
      });
    }

    const traineeIds = trainees.map(t => t._id);
    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // ── Fetch enrollments + attempts in parallel ─────────────────────────────
    const [enrollments, attempts] = await Promise.all([
      Enrollment.find({ trainee_id: { $in: traineeIds } })
        .populate('course_id', 'title')
        .lean(),
      Attempt.find({ trainee_id: { $in: traineeIds }, status: 'scored', submitted_at: { $gte: since90 } })
        .select('trainee_id course_id score submitted_at test_type passing_score')
        .lean(),
    ]);

    // ── Build lookup maps ────────────────────────────────────────────────────
    const enrollByTrainee = {};
    for (const e of enrollments) {
      const tid = e.trainee_id.toString();
      if (!enrollByTrainee[tid]) enrollByTrainee[tid] = [];
      enrollByTrainee[tid].push(e);
    }

    const attemptByTrainee = {};
    for (const a of attempts) {
      const tid = a.trainee_id.toString();
      if (!attemptByTrainee[tid]) attemptByTrainee[tid] = [];
      attemptByTrainee[tid].push(a);
    }

    // ── Build student summaries ──────────────────────────────────────────────
    const students = trainees.map(trainee => {
      const tid = trainee._id.toString();
      const traineeEnrols = enrollByTrainee[tid] || [];
      const traineeAttempts = attemptByTrainee[tid] || [];

      const totalCourses = traineeEnrols.length;
      const completedCourses = traineeEnrols.filter(e => e.status === 'completed').length;
      const avgProgress = totalCourses > 0
        ? Math.round(traineeEnrols.reduce((s, e) => s + (e.progress || 0), 0) / totalCourses)
        : 0;

      const scores = traineeAttempts.map(a => a.score).filter(s => s != null);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;

      // Most recent activity: last login or last attempt, whichever is newer
      const latestAttemptDate = traineeAttempts.length > 0
        ? new Date(Math.max(...traineeAttempts.map(a => new Date(a.submitted_at))))
        : null;
      const lastActiveAt = [trainee.last_login_at, latestAttemptDate]
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null;

      // Classify status
      let computedStatus = 'not_started';
      if (totalCourses > 0) {
        if (completedCourses === totalCourses) computedStatus = 'completed';
        else if (avgProgress > 0) computedStatus = 'in_progress';
      }
      // "Struggling" = in progress, has made ≥2 attempts, avg score still below 50
      if (computedStatus === 'in_progress' && scores.length >= 2 && avgScore !== null && avgScore < 50) {
        computedStatus = 'struggling';
      }

      // Per-course breakdown
      const courses = traineeEnrols.map(e => {
        const cid = (e.course_id?._id || e.course_id)?.toString();
        const courseAttempts = traineeAttempts.filter(a => a.course_id?.toString() === cid);
        const courseScores = courseAttempts.map(a => a.score).filter(s => s != null);
        const sorted = [...courseAttempts].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

        return {
          course_id: cid,
          course_title: e.course_id?.title || 'Unknown course',
          progress: e.progress || 0,
          status: e.status || 'not_started',
          best_score: e.best_score ?? null,
          avg_score: courseScores.length > 0
            ? Math.round(courseScores.reduce((s, v) => s + v, 0) / courseScores.length)
            : null,
          attempt_count: courseAttempts.length,
          last_attempt_at: sorted[0]?.submitted_at || null,
          last_attempt_type: sorted[0]?.test_type || null,
          passed: courseScores.some((s, i) => s >= (courseAttempts[i]?.passing_score || 60)),
        };
      }).sort((a, b) => (b.progress || 0) - (a.progress || 0));

      return {
        _id: trainee._id,
        name: trainee.name,
        email: trainee.email,
        category: trainee.category_id || null,
        last_active_at: lastActiveAt,
        joined_at: trainee.createdAt,
        summary: {
          total_courses: totalCourses,
          completed_courses: completedCourses,
          avg_progress: avgProgress,
          avg_score: avgScore,
          attempt_count: traineeAttempts.length,
          status: computedStatus,
        },
        courses,
      };
    });

    // Apply status filter after computing statuses
    const filtered = status ? students.filter(s => s.summary.status === status) : students;

    // ── Aggregate stats ──────────────────────────────────────────────────────
    const allScores = filtered.flatMap(s => s.courses.map(c => c.avg_score).filter(v => v != null));
    const withCourses = filtered.filter(s => s.summary.total_courses > 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stats = {
      total: filtered.length,
      active_count: filtered.filter(s => s.last_active_at && new Date(s.last_active_at) >= thirtyDaysAgo).length,
      in_progress_count: filtered.filter(s => s.summary.status === 'in_progress').length,
      completed_count: filtered.filter(s => s.summary.status === 'completed').length,
      struggling_count: filtered.filter(s => s.summary.status === 'struggling').length,
      not_started_count: filtered.filter(s => s.summary.status === 'not_started').length,
      avg_score: allScores.length > 0
        ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length)
        : null,
      avg_completion: withCourses.length > 0
        ? Math.round(withCourses.reduce((s, t) => s + t.summary.avg_progress, 0) / withCourses.length)
        : 0,
    };

    res.json({ success: true, students: filtered, stats });
  } catch (err) { next(err); }
});

module.exports = router;