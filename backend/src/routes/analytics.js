const router = require('express').Router();
const User = require('../models/User');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Test = require('../models/Test');
const Enrollment = require('../models/Enrollment');
const Attempt = require('../models/Attempt');
const RolePlayProgress = require('../models/RolePlayProgress');
const RolePlayAttempt = require('../models/RolePlayAttempt');
const LessonProgress = require('../models/LessonProgress');
const { authenticate, authorize } = require('../middleware/auth');
const { getModuleCompletionSnapshot } = require('../services/courseProgressService');

const idString = (value) => (value?._id || value)?.toString?.() || null;

const buildCourseModuleMap = (modules) => modules.reduce((acc, mod) => {
  const courseId = idString(mod.course_id);
  if (!courseId) return acc;
  if (!acc[courseId]) acc[courseId] = [];
  acc[courseId].push(mod);
  return acc;
}, {});

const deriveEnrollmentProgress = (enrollment, modulesByCourse, snapshot) => {
  const base = enrollment.toObject ? enrollment.toObject() : { ...enrollment };
  const courseId = idString(base.course_id);
  const courseModules = courseId ? (modulesByCourse[courseId] || []) : [];
  const totalModules = courseModules.length;

  const completedModules = courseModules.filter((mod) => {
    const moduleId = idString(mod);
    const total = snapshot.totalByModule[moduleId] || 0;
    return total > 0 && (snapshot.completedByModule[moduleId] || 0) >= total;
  }).length;

  const totals = courseModules.reduce((acc, mod) => {
    const moduleId = idString(mod);
    acc.totalLessons += snapshot.totalByModule[moduleId] || 0;
    acc.completedLessons += snapshot.completedByModule[moduleId] || 0;
    return acc;
  }, { totalLessons: 0, completedLessons: 0 });

  const hasLessonProgress = totals.totalLessons > 0;
  const progress = hasLessonProgress
    ? Math.round((totals.completedLessons / totals.totalLessons) * 100)
    : (base.progress || 0);
  const moduleProgress = totalModules > 0
    ? Math.round((completedModules / totalModules) * 100)
    : progress;
  const status = hasLessonProgress
    ? (totals.completedLessons === totals.totalLessons ? 'completed' : totals.completedLessons > 0 ? 'in_progress' : 'not_started')
    : (base.status || 'not_started');

  return {
    ...base,
    progress,
    module_progress: moduleProgress,
    status,
    module_count: totalModules,
    completed_modules: completedModules,
    lesson_count: totals.totalLessons,
    completed_lessons: totals.completedLessons,
  };
};

const enrichEnrollmentsWithProgress = async (traineeId, enrollments) => {
  const courseIds = [...new Set(enrollments.map(e => idString(e.course_id)).filter(Boolean))];
  if (!courseIds.length) return enrollments.map(e => (e.toObject ? e.toObject() : e));

  const modules = await Module.find({ course_id: { $in: courseIds }, is_published: true })
    .select('_id course_id')
    .lean();
  const snapshot = await getModuleCompletionSnapshot({
    traineeId,
    moduleIds: modules.map(mod => mod._id),
  });
  const modulesByCourse = buildCourseModuleMap(modules);

  return enrollments.map(e => deriveEnrollmentProgress(e, modulesByCourse, snapshot));
};

// GET /api/analytics/overview
router.get('/overview', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const trainerFilter = req.user.role === 'trainer' ? { created_by: req.user._id } : {};
    const trainerCourseIds = req.user.role === 'trainer'
      ? (await Course.find({ created_by: req.user._id }).select('_id')).map(c => c._id)
      : null;

    const enrollFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};
    const attemptFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};
    const rolePlayFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};
    const enrolledTraineeIds = trainerCourseIds
      ? await Enrollment.distinct('trainee_id', enrollFilter)
      : null;
    const traineeUserFilter = trainerCourseIds
      ? { _id: { $in: enrolledTraineeIds }, role: 'trainee', is_active: true }
      : { role: 'trainee', is_active: true };
    const trainerUserFilter = req.user.role === 'trainer'
      ? { _id: req.user._id, is_active: true }
      : { role: 'trainer', is_active: true };
    const totalUserFilter = req.user.role === 'trainer'
      ? { _id: { $in: [...enrolledTraineeIds, req.user._id] }, is_active: true }
      : { is_active: true };

    const [
      totalUsers, trainees, trainers,
      totalCourses, publishedCourses, voiceCourses,
      totalEnrollments, completedEnrollments,
      totalAttempts, voiceAttempts, passedAttempts,
      rolePlayProgresses, rolePlayLocks,
    ] = await Promise.all([
      User.countDocuments(totalUserFilter),
      User.countDocuments(traineeUserFilter),
      User.countDocuments(trainerUserFilter),
      Course.countDocuments(trainerFilter),
      Course.countDocuments({ ...trainerFilter, is_published: true }),
      Course.countDocuments({ ...trainerFilter, requires_voice_test: true }),
      Enrollment.countDocuments(enrollFilter),
      Enrollment.countDocuments({ ...enrollFilter, status: 'completed' }),
      Attempt.countDocuments(attemptFilter),
      Attempt.countDocuments({ ...attemptFilter, test_type: 'voice' }),
      Attempt.countDocuments({ ...attemptFilter, score: { $gte: 60 } }),
      RolePlayProgress.find(rolePlayFilter).select('attempts_used best_score').lean(),
      RolePlayProgress.countDocuments({
        ...rolePlayFilter,
        passed: { $ne: true },
        unlocked_by_trainer: { $ne: true },
        attempts_used: { $gte: 10 },
      }),
    ]);

    const rolePlayAttempts = rolePlayProgresses.reduce((sum, p) => sum + (p.attempts_used || 0), 0);
    const rolePlayScores = rolePlayProgresses.map(p => p.best_score).filter(s => s != null && s > 0);

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
        roleplay_attempts: rolePlayAttempts,
        roleplay_locks: rolePlayLocks,
        avg_roleplay_score: rolePlayScores.length > 0
          ? Math.round(rolePlayScores.reduce((s, v) => s + v, 0) / rolePlayScores.length)
          : null,
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

    const enrichedEnrollments = await enrichEnrollmentsWithProgress(traineeId, enrollments);
    const completed = enrichedEnrollments.filter(e => e.status === 'completed').length;
    const voiceAttemptCount = recentAttempts.filter(a => a.test_type === 'voice').length;

    res.json({
      success: true,
      enrollments: enrichedEnrollments.map(e => ({
        ...e,
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
    const trainerCourseIds = req.user.role === 'trainer'
      ? (await Course.find({ created_by: req.user._id }).select('_id')).map(c => c._id)
      : null;
    const match = {
      test_type: 'voice',
      submitted_at: { $gte: since },
      score: { $ne: null },
      ...(trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {}),
    };
    const trends = await Attempt.aggregate([
      { $match: match },
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
    // ── Fetch enrollments + attempts in parallel ─────────────────────────────
    const [enrollments, attempts, rolePlays, rolePlayAttempts, lessonProgressItems] = await Promise.all([
      Enrollment.find({ trainee_id: { $in: traineeIds } })
        .populate('course_id', 'title')
        .lean(),
      Attempt.find({ trainee_id: { $in: traineeIds }, status: 'scored' })
        .select('trainee_id course_id test_id score submitted_at test_type passing_score ai_feedback')
        .populate('course_id', 'title')
        .populate('test_id', 'title test_type lesson_id')
        .lean(),
      RolePlayProgress.find({ trainee_id: { $in: traineeIds } })
        .select('trainee_id course_id lesson_id attempts_used best_score last_score passed unlocked_by_trainer last_attempt_at last_scenario_type last_question_count')
        .populate('lesson_id', 'title')
        .lean(),
      RolePlayAttempt.find({ trainee_id: { $in: traineeIds } })
        .select('trainee_id course_id module_id lesson_id attempt_number scenario_type score grade passed question_count submitted_at summary conversation')
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(1500)
        .lean(),
      LessonProgress.find({ trainee_id: { $in: traineeIds } })
        .select('trainee_id course_id module_id lesson_id status score watch_percent completed_at updatedAt')
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ updatedAt: -1 })
        .limit(1500)
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

    const rolePlayByTrainee = {};
    for (const rp of rolePlays) {
      const tid = rp.trainee_id.toString();
      if (!rolePlayByTrainee[tid]) rolePlayByTrainee[tid] = [];
      rolePlayByTrainee[tid].push(rp);
    }

    const rolePlayAttemptByTrainee = {};
    for (const item of rolePlayAttempts) {
      const tid = item.trainee_id.toString();
      if (!rolePlayAttemptByTrainee[tid]) rolePlayAttemptByTrainee[tid] = [];
      rolePlayAttemptByTrainee[tid].push(item);
    }

    const lessonProgressByTrainee = {};
    for (const item of lessonProgressItems) {
      const tid = item.trainee_id.toString();
      if (!lessonProgressByTrainee[tid]) lessonProgressByTrainee[tid] = [];
      lessonProgressByTrainee[tid].push(item);
    }

    // ── Build student summaries ──────────────────────────────────────────────
    const students = await Promise.all(trainees.map(async (trainee) => {
      const tid = trainee._id.toString();
      const traineeEnrols = await enrichEnrollmentsWithProgress(tid, enrollByTrainee[tid] || []);
      const traineeAttempts = attemptByTrainee[tid] || [];
      const traineeRolePlays = rolePlayByTrainee[tid] || [];
      const traineeRolePlayAttempts = rolePlayAttemptByTrainee[tid] || [];
      const traineeLessonProgress = lessonProgressByTrainee[tid] || [];

      const totalCourses = traineeEnrols.length;
      const completedCourses = traineeEnrols.filter(e => e.status === 'completed').length;
      const avgProgress = totalCourses > 0
        ? Math.round(traineeEnrols.reduce((s, e) => s + (e.progress || 0), 0) / totalCourses)
        : 0;

      const scores = traineeAttempts.map(a => a.score).filter(s => s != null);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
        : null;
      const rolePlayScores = traineeRolePlays.map(rp => rp.best_score).filter(s => s != null && s > 0);
      const avgRolePlayScore = rolePlayScores.length > 0
        ? Math.round(rolePlayScores.reduce((s, v) => s + v, 0) / rolePlayScores.length)
        : null;
      const rolePlayAttemptCount = traineeRolePlays.reduce((sum, rp) => sum + (rp.attempts_used || 0), 0);
      const rolePlayLockedCount = traineeRolePlays.filter(rp =>
        !rp.passed && !rp.unlocked_by_trainer && (rp.attempts_used || 0) >= 10
      ).length;

      // Most recent activity: last login or last attempt, whichever is newer
      const latestAttemptDate = traineeAttempts.length > 0
        ? new Date(Math.max(...traineeAttempts.map(a => new Date(a.submitted_at))))
        : null;
      const latestRolePlayDate = traineeRolePlays.filter(rp => rp.last_attempt_at).length > 0
        ? new Date(Math.max(...traineeRolePlays.filter(rp => rp.last_attempt_at).map(rp => new Date(rp.last_attempt_at))))
        : null;
      const lastActiveAt = [trainee.last_login_at, latestAttemptDate, latestRolePlayDate]
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
      if (rolePlayLockedCount > 0) computedStatus = 'struggling';

      // Per-course breakdown
      const courses = traineeEnrols.map(e => {
        const cid = (e.course_id?._id || e.course_id)?.toString();
        const courseAttempts = traineeAttempts.filter(a => (a.course_id?._id || a.course_id)?.toString() === cid);
        const courseRolePlays = traineeRolePlays.filter(rp => rp.course_id?.toString() === cid);
        const courseScores = courseAttempts.map(a => a.score).filter(s => s != null);
        const sorted = [...courseAttempts].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
        const sortedRolePlays = [...courseRolePlays].sort((a, b) => new Date(b.last_attempt_at || 0) - new Date(a.last_attempt_at || 0));
        const roleBestScores = courseRolePlays.map(rp => rp.best_score).filter(s => s != null && s > 0);
        const roleAttemptCount = courseRolePlays.reduce((sum, rp) => sum + (rp.attempts_used || 0), 0);
        const lockedRolePlays = courseRolePlays.filter(rp =>
          !rp.passed && !rp.unlocked_by_trainer && (rp.attempts_used || 0) >= 10
        );

        return {
          course_id: cid,
          course_title: e.course_id?.title || 'Unknown course',
          progress: e.progress || 0,
          module_progress: e.module_progress || 0,
          module_count: e.module_count || 0,
          completed_modules: e.completed_modules || 0,
          lesson_count: e.lesson_count || 0,
          completed_lessons: e.completed_lessons || 0,
          status: e.status || 'not_started',
          best_score: e.best_score ?? null,
          avg_score: courseScores.length > 0
            ? Math.round(courseScores.reduce((s, v) => s + v, 0) / courseScores.length)
            : null,
          attempt_count: courseAttempts.length,
          last_attempt_at: sorted[0]?.submitted_at || null,
          last_attempt_type: sorted[0]?.test_type || null,
          passed: courseScores.some((s, i) => s >= (courseAttempts[i]?.passing_score || 60)),
          assessment: {
            attempt_count: courseAttempts.length,
            best_score: courseScores.length > 0 ? Math.max(...courseScores) : null,
            avg_score: courseScores.length > 0
              ? Math.round(courseScores.reduce((s, v) => s + v, 0) / courseScores.length)
              : null,
            last_attempt_at: sorted[0]?.submitted_at || null,
          },
          roleplay: {
            attempt_count: roleAttemptCount,
            best_score: roleBestScores.length > 0 ? Math.max(...roleBestScores) : null,
            avg_score: roleBestScores.length > 0
              ? Math.round(roleBestScores.reduce((s, v) => s + v, 0) / roleBestScores.length)
              : null,
            passed_count: courseRolePlays.filter(rp => rp.passed || rp.unlocked_by_trainer).length,
            locked_count: lockedRolePlays.length,
            last_attempt_at: sortedRolePlays[0]?.last_attempt_at || null,
            last_scenario_type: sortedRolePlays[0]?.last_scenario_type || null,
            last_lesson_title: sortedRolePlays[0]?.lesson_id?.title || null,
          },
        };
      }).sort((a, b) => (b.progress || 0) - (a.progress || 0));

      const roleplayHistory = traineeRolePlayAttempts.map(item => ({
        id: item._id,
        type: 'roleplay',
        title: item.lesson_id?.title || 'Roleplay',
        course_id: item.course_id?._id || item.course_id,
        course_title: item.course_id?.title || 'Unknown course',
        module_title: item.module_id?.title || null,
        lesson_title: item.lesson_id?.title || null,
        score: item.score,
        grade: item.grade,
        passed: !!item.passed,
        question_count: item.question_count || 0,
        scenario_type: item.scenario_type || null,
        feedback: item.summary?.summary || null,
        responses: (item.conversation || []).filter(t => t.role === 'user').map(t => ({
          answer: t.content,
          coaching: t.coaching || null,
        })),
        date: item.submitted_at || item.createdAt,
      }));

      const assessmentHistory = traineeAttempts.map(item => ({
        id: item._id,
        type: 'assessment',
        title: item.test_id?.title || 'Assessment',
        course_id: item.course_id?._id || item.course_id,
        course_title: item.course_id?.title || 'Unknown course',
        test_type: item.test_type,
        score: item.score,
        passing_score: item.passing_score || 60,
        passed: item.score != null ? item.score >= (item.passing_score || 60) : false,
        feedback: item.ai_feedback || null,
        date: item.submitted_at,
      }));

      const lessonHistory = traineeLessonProgress.map(item => ({
        id: item._id,
        type: 'lesson',
        title: item.lesson_id?.title || 'Lesson',
        course_id: item.course_id?._id || item.course_id,
        course_title: item.course_id?.title || 'Unknown course',
        module_title: item.module_id?.title || null,
        lesson_title: item.lesson_id?.title || null,
        status: item.status,
        score: item.score,
        watch_percent: item.watch_percent || 0,
        date: item.completed_at || item.updatedAt,
      }));

      const timeline = [...roleplayHistory, ...assessmentHistory, ...lessonHistory]
        .filter(item => item.date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 30);

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
          avg_roleplay_score: avgRolePlayScore,
          attempt_count: traineeAttempts.length,
          roleplay_attempt_count: rolePlayAttemptCount,
          roleplay_locked_count: rolePlayLockedCount,
          status: computedStatus,
        },
        courses,
        history: {
          roleplays: roleplayHistory.slice(0, 30),
          assessments: assessmentHistory.slice(0, 30),
          lessons: lessonHistory.slice(0, 30),
          timeline,
        },
      };
    }));

    // Apply status filter after computing statuses
    const filtered = status ? students.filter(s => s.summary.status === status) : students;

    // ── Aggregate stats ──────────────────────────────────────────────────────
    const allScores = filtered.flatMap(s => s.courses.map(c => c.assessment?.avg_score).filter(v => v != null));
    const allRolePlayScores = filtered.flatMap(s => s.courses.map(c => c.roleplay?.avg_score).filter(v => v != null));
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
      avg_roleplay_score: allRolePlayScores.length > 0
        ? Math.round(allRolePlayScores.reduce((s, v) => s + v, 0) / allRolePlayScores.length)
        : null,
      roleplay_attempts: filtered.reduce((sum, s) => sum + (s.summary.roleplay_attempt_count || 0), 0),
      roleplay_locked_count: filtered.reduce((sum, s) => sum + (s.summary.roleplay_locked_count || 0), 0),
      assessment_attempts: filtered.reduce((sum, s) => sum + (s.summary.attempt_count || 0), 0),
      avg_completion: withCourses.length > 0
        ? Math.round(withCourses.reduce((s, t) => s + t.summary.avg_progress, 0) / withCourses.length)
        : 0,
    };

    res.json({ success: true, students: filtered, stats });
  } catch (err) { next(err); }
});

// GET /api/analytics/history
// Recent roleplay, assessment, and lesson activity for admin/trainer dashboards.
router.get('/history', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 30));
    const trainerCourseIds = req.user.role === 'trainer'
      ? (await Course.find({ created_by: req.user._id }).select('_id')).map(c => c._id)
      : null;

    const courseFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};

    const [roleplays, assessments, lessons] = await Promise.all([
      RolePlayAttempt.find(courseFilter)
        .select('trainee_id course_id module_id lesson_id scenario_type score grade passed question_count submitted_at summary conversation')
        .populate('trainee_id', 'name email phone')
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(limit)
        .lean(),
      Attempt.find({ ...courseFilter, status: 'scored' })
        .select('trainee_id course_id test_id test_type score passing_score submitted_at ai_feedback')
        .populate('trainee_id', 'name email phone')
        .populate('course_id', 'title')
        .populate('test_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(limit)
        .lean(),
      LessonProgress.find(courseFilter)
        .select('trainee_id course_id module_id lesson_id status score watch_percent completed_at updatedAt')
        .populate('trainee_id', 'name email phone')
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    const history = [
      ...roleplays.map(item => ({
        id: item._id,
        type: 'roleplay',
        trainee_id: item.trainee_id?._id,
        trainee_name: item.trainee_id?.name || 'Unknown trainee',
        trainee_email: item.trainee_id?.email || '',
        trainee_phone: item.trainee_id?.phone || '',
        course_title: item.course_id?.title || 'Unknown course',
        module_title: item.module_id?.title || null,
        lesson_title: item.lesson_id?.title || null,
        title: item.lesson_id?.title || 'Roleplay',
        score: item.score,
        grade: item.grade,
        passed: !!item.passed,
        question_count: item.question_count || 0,
        feedback: item.summary?.summary || null,
        responses: (item.conversation || []).filter(t => t.role === 'user').map(t => t.content).slice(0, 3),
        date: item.submitted_at || item.createdAt,
      })),
      ...assessments.map(item => ({
        id: item._id,
        type: 'assessment',
        trainee_id: item.trainee_id?._id,
        trainee_name: item.trainee_id?.name || 'Unknown trainee',
        trainee_email: item.trainee_id?.email || '',
        trainee_phone: item.trainee_id?.phone || '',
        course_title: item.course_id?.title || 'Unknown course',
        title: item.test_id?.title || 'Assessment',
        test_type: item.test_type,
        score: item.score,
        passing_score: item.passing_score || 60,
        passed: item.score != null ? item.score >= (item.passing_score || 60) : false,
        feedback: item.ai_feedback || null,
        date: item.submitted_at,
      })),
      ...lessons.map(item => ({
        id: item._id,
        type: 'lesson',
        trainee_id: item.trainee_id?._id,
        trainee_name: item.trainee_id?.name || 'Unknown trainee',
        trainee_email: item.trainee_id?.email || '',
        trainee_phone: item.trainee_id?.phone || '',
        course_title: item.course_id?.title || 'Unknown course',
        module_title: item.module_id?.title || null,
        lesson_title: item.lesson_id?.title || null,
        title: item.lesson_id?.title || 'Lesson',
        status: item.status,
        score: item.score,
        watch_percent: item.watch_percent || 0,
        date: item.completed_at || item.updatedAt,
      })),
    ]
      .filter(item => item.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    res.json({ success: true, history });
  } catch (err) { next(err); }
});

const roleplayPairs = (attempt) => {
  const pairs = [];
  let currentQuestion = attempt.scenario?.opening_line || '';

  for (const turn of attempt.conversation || []) {
    if (turn.role === 'character') {
      currentQuestion = turn.content || currentQuestion;
    } else if (turn.role === 'user') {
      pairs.push({
        question: currentQuestion || 'Customer question',
        answer: turn.content || '',
        score: turn.coaching?.score ?? null,
        feedback: turn.coaching?.tip || turn.coaching?.spoken_feedback || turn.coaching?.what_worked || null,
      });
      currentQuestion = '';
    }
  }

  return pairs;
};

const assessmentPairs = (attempt) => {
  if (Array.isArray(attempt.questions_snapshot) && attempt.questions_snapshot.length) {
    return attempt.questions_snapshot.map((question, index) => {
      const points = Number(question.points);
      const earnedPoints = Number(question.earned_points);
      let score = question.answer_score ?? question.score ?? null;

      if (score == null && Number.isFinite(points) && points > 0 && Number.isFinite(earnedPoints)) {
        score = Math.round((earnedPoints / points) * 100) / 10;
      }
      if (score == null && typeof question.is_correct === 'boolean') {
        score = question.is_correct ? 10 : 0;
      }

      return {
        question: question.question || question.prompt || `Question ${index + 1}`,
        answer: question.user_answer ?? '',
        score,
        is_correct: question.is_correct ?? null,
        feedback: question.feedback || null,
        feedback_tier: question.feedback_tier || null,
        correct_answer: question.correct_answer || null,
        earned_points: question.earned_points ?? null,
        points: question.points ?? null,
      };
    });
  }

  if (attempt.voice_transcript) {
    const pairs = [];
    const regex = /Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\n\nQ:|$)/g;
    let match;
    while ((match = regex.exec(attempt.voice_transcript)) !== null) {
      pairs.push({
        question: (match[1] || '').trim(),
        answer: (match[2] || '').trim(),
      });
    }
    if (pairs.length) return pairs;
  }

  const questions = attempt.test_id?.questions || [];
  const answers = attempt.answers || {};

  return questions.map((question, index) => ({
    question: question.question || question.prompt || `Question ${index + 1}`,
    answer: question.user_answer ?? answers[index] ?? answers[String(index)] ?? answers[question._id] ?? '',
    correct_answer: question.correct_answer || null,
  }));
};

// GET /api/analytics/student-history
// Student-first drill-down for admin/trainer: trainee -> Roleplaying/Assessment -> Q&A.
router.get('/student-history', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const trainerCourseIds = req.user.role === 'trainer'
      ? (await Course.find({ created_by: req.user._id }).select('_id')).map(c => c._id)
      : null;
    const courseFilter = trainerCourseIds ? { course_id: { $in: trainerCourseIds } } : {};

    const traineeFilter = {
      is_active: { $ne: false },
      $or: [{ role: 'trainee' }, { roles: 'trainee' }],
    };

    if (trainerCourseIds) {
      const traineeIds = await Enrollment.distinct('trainee_id', { course_id: { $in: trainerCourseIds } });
      traineeFilter._id = { $in: traineeIds };
    }

    const [trainees, roleplays, assessments] = await Promise.all([
      User.find(traineeFilter)
        .select('name email phone')
        .sort({ name: 1 })
        .limit(500)
        .lean(),
      RolePlayAttempt.find(courseFilter)
        .select('trainee_id course_id module_id lesson_id scenario_type scenario conversation summary score grade passed question_count submitted_at')
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(3000)
        .lean(),
      Attempt.find({ ...courseFilter, status: 'scored' })
        .select('trainee_id course_id test_id test_type answers questions_snapshot voice_transcript score passing_score submitted_at ai_feedback')
        .populate('course_id', 'title')
        .populate({
          path: 'test_id',
          select: 'title test_type questions module_id lesson_id',
          populate: [
            { path: 'module_id', select: 'title order' },
            { path: 'lesson_id', select: 'title' },
          ],
        })
        .sort({ submitted_at: -1 })
        .limit(3000)
        .lean(),
    ]);

    const roleplaysByTrainee = {};
    for (const attempt of roleplays) {
      const tid = attempt.trainee_id?.toString();
      if (!tid) continue;
      if (!roleplaysByTrainee[tid]) roleplaysByTrainee[tid] = [];
      roleplaysByTrainee[tid].push({
        id: attempt._id,
        title: attempt.lesson_id?.title || 'Roleplay',
        course_title: attempt.course_id?.title || 'Unknown course',
        module_title: attempt.module_id?.title || null,
        lesson_title: attempt.lesson_id?.title || null,
        scenario_type: attempt.scenario_type || null,
        score: attempt.score,
        grade: attempt.grade,
        passed: !!attempt.passed,
        question_count: attempt.question_count || 0,
        summary: attempt.summary?.summary || null,
        date: attempt.submitted_at || attempt.createdAt,
        qa: roleplayPairs(attempt),
      });
    }

    const assessmentsByTrainee = {};
    for (const attempt of assessments) {
      const tid = attempt.trainee_id?.toString();
      if (!tid) continue;
      if (!assessmentsByTrainee[tid]) assessmentsByTrainee[tid] = [];
      assessmentsByTrainee[tid].push({
        id: attempt._id,
        title: attempt.test_id?.title || 'Assessment',
        course_title: attempt.course_id?.title || 'Unknown course',
        module_title: attempt.test_id?.module_id?.title || null,
        lesson_title: attempt.test_id?.lesson_id?.title || null,
        test_type: attempt.test_type,
        score: attempt.score,
        passing_score: attempt.passing_score || 60,
        passed: attempt.score != null ? attempt.score >= (attempt.passing_score || 60) : false,
        feedback: attempt.ai_feedback || null,
        date: attempt.submitted_at,
        qa: assessmentPairs(attempt),
      });
    }

    const students = trainees.map(trainee => {
      const tid = trainee._id.toString();
      return {
        _id: trainee._id,
        name: trainee.name,
        email: trainee.email,
        phone: trainee.phone || '',
        roleplays: roleplaysByTrainee[tid] || [],
        assessments: assessmentsByTrainee[tid] || [],
      };
    });

    res.json({ success: true, students });
  } catch (err) { next(err); }
});

module.exports = router;
