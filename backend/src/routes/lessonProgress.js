// REPLACE backend/src/routes/lessonProgress.js
// LessonProgress model is now populated — this replaces the existing route.

const router = require('express').Router();
const LessonProgress = require('../models/LessonProgress');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const Enrollment = require('../models/Enrollment');
const { authenticate, authorize } = require('../middleware/auth');

// ── POST /api/lesson-progress/complete ────────────────────────────────────────
router.post('/complete', authenticate, authorize('trainee'), async (req, res, next) => {
  try {
    const { lesson_id, module_id, course_id, score } = req.body;
    if (!lesson_id || !module_id || !course_id)
      return res.status(400).json({ success: false, message: 'lesson_id, module_id, course_id required' });

    // Upsert — idempotent
    const progress = await LessonProgress.findOneAndUpdate(
      { trainee_id: req.user._id, lesson_id },
      {
        $set: {
          trainee_id: req.user._id,
          lesson_id,
          module_id,
          course_id,
          status: 'completed',
          score: score ?? null,
          completed_at: new Date(),
          watch_percent: 100,
        },
        $setOnInsert: { started_at: new Date() },
      },
      { upsert: true, new: true }
    );

    // Check if ALL published lessons in this module are now complete
    const [totalLessons, completedLessons] = await Promise.all([
      Lesson.countDocuments({ module_id, is_published: true }),
      LessonProgress.countDocuments({ trainee_id: req.user._id, module_id, status: 'completed' }),
    ]);

    const module_completed = totalLessons > 0 && completedLessons >= totalLessons;

    // Recalculate overall enrollment progress
    if (module_completed) {
      const modules = await Module.find({ course_id, is_published: true }).sort({ order: 1 });
      let completedModuleCount = 0;

      for (const mod of modules) {
        const [tot, comp] = await Promise.all([
          Lesson.countDocuments({ module_id: mod._id, is_published: true }),
          LessonProgress.countDocuments({
            trainee_id: req.user._id,
            module_id: mod._id,
            status: 'completed',
          }),
        ]);
        if (tot > 0 && comp >= tot) completedModuleCount++;
      }

      const progressPct =
        modules.length > 0 ? Math.round((completedModuleCount / modules.length) * 100) : 0;

      const enrollment = await Enrollment.findOne({ trainee_id: req.user._id, course_id });
      if (enrollment) {
        enrollment.progress = progressPct;
        if (progressPct === 100) {
          enrollment.status = 'completed';
          enrollment.completed_at = enrollment.completed_at || new Date();
        } else if (progressPct > 0) {
          enrollment.status = 'in_progress';
        }
        await enrollment.save();
      }
    }

    res.json({
      success: true,
      progress,
      module_completed,
      total_lessons: totalLessons,
      completed_lessons: completedLessons,
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/lesson-progress/watch ────────────────────────────────────────────
// Called periodically as trainee watches a video (non-blocking)
router.put('/watch', authenticate, authorize('trainee'), async (req, res, next) => {
  try {
    const { lesson_id, module_id, course_id, watch_percent } = req.body;
    if (!lesson_id) return res.status(400).json({ success: false, message: 'lesson_id required' });

    await LessonProgress.findOneAndUpdate(
      { trainee_id: req.user._id, lesson_id },
      {
        $set: { watch_percent: Math.min(100, watch_percent || 0), course_id, module_id },
        $setOnInsert: {
          trainee_id: req.user._id,
          lesson_id,
          module_id,
          course_id,
          status: 'in_progress',
          started_at: new Date(),
        },
      },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/lesson-progress/course/:courseId ──────────────────────────────────
router.get('/course/:courseId', authenticate, authorize('trainee'), async (req, res, next) => {
  try {
    const items = await LessonProgress.find({
      trainee_id: req.user._id,
      course_id: req.params.courseId,
    }).select('lesson_id module_id status score completed_at watch_percent');

    res.json({ success: true, progress: items });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/lesson-progress/trainee/:traineeId/course/:courseId ──────────────
router.get('/trainee/:traineeId/course/:courseId', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const items = await LessonProgress.find({
      trainee_id: req.params.traineeId,
      course_id: req.params.courseId,
    })
      .populate('lesson_id', 'title duration_minutes')
      .populate('module_id', 'title order')
      .select('lesson_id module_id status score completed_at watch_percent');

    const byModule = {};
    for (const item of items) {
      const mid = item.module_id?._id?.toString() || item.module_id?.toString();
      if (!byModule[mid]) {
        byModule[mid] = {
          module_id: item.module_id?._id || item.module_id,
          module_title: item.module_id?.title || '—',
          module_order: item.module_id?.order ?? 0,
          lessons: [],
        };
      }
      byModule[mid].lessons.push({
        lesson_id: item.lesson_id?._id || item.lesson_id,
        title: item.lesson_id?.title || '—',
        status: item.status,
        score: item.score,
        watch_percent: item.watch_percent,
        completed_at: item.completed_at,
      });
    }

    const grouped = Object.values(byModule).sort((a, b) => a.module_order - b.module_order);
    res.json({ success: true, progress: items, grouped });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/lesson-progress/module/:moduleId ──────────────────────────────────
router.get('/module/:moduleId', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const items = await LessonProgress.find({ module_id: req.params.moduleId })
      .populate('trainee_id', 'name email')
      .populate('lesson_id', 'title')
      .select('trainee_id lesson_id status score completed_at watch_percent');

    res.json({ success: true, progress: items });
  } catch (err) {
    next(err);
  }
});

module.exports = router;