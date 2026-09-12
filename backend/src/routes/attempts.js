const router = require('express').Router();
const Attempt = require('../models/Attempt');
const Test = require('../models/Test');
const Enrollment = require('../models/Enrollment');
const LessonProgress = require('../models/LessonProgress');
const RolePlayProgress = require('../models/RolePlayProgress');
const { authenticate, authorize } = require('../middleware/auth');
const { hasDemoFullAccess } = require('../constants/demoAccess');
const { uploadAudio } = require('../middleware/upload');
const { saveWrittenAttempt, saveVoiceAttempt } = require('../services/attemptService');
const { recalculateEnrollmentProgress } = require('../services/courseProgressService');
const { streamRecording, deleteRecording } = require('../config/gridfs');

const ensureRolePlayUnlocked = async (test, user) => {
  if (hasDemoFullAccess(user)) return;
  if (!test.lesson_id) return;

  const progress = await RolePlayProgress.findOne({
    trainee_id: user._id,
    lesson_id: test.lesson_id,
  });

  if (progress?.passed || progress?.unlocked_by_trainer) return;

  const err = new Error(
    (progress?.attempts_used || 0) >= 10
      ? 'Contact trainer to unlock test as failed 10 times.'
      : 'Score 70% in Role Playing to unlock this assessment.'
  );
  err.status = 423;
  throw err;
};

/** Block further attempts once max reached or current pass barrier is met. */
const assertCanAttemptAssessment = async (userId, test) => {
  const maxAttempts = test.max_attempts || 4;
  const passBar = test.passing_score || 60;
  const attempts = await Attempt.find({
    trainee_id: userId,
    test_id: test._id,
    status: 'scored',
  }).select('score').lean();

  if (attempts.length >= maxAttempts) {
    const err = new Error('Max attempts reached');
    err.status = 429;
    throw err;
  }

  const best = attempts.reduce((max, a) => Math.max(max, Number(a.score) || 0), 0);
  if (attempts.length && best >= passBar) {
    const err = new Error('Assessment already passed. Chapter is closed.');
    err.status = 429;
    throw err;
  }
};

// POST /api/attempts/written
router.post('/written', authenticate, authorize('trainee'), async (req, res, next) => {
  try {
    const { test_id, course_id, answers, started_at } = req.body;
    if (!test_id || !course_id || !answers)
      return res.status(400).json({ success: false, message: 'test_id, course_id, answers required' });

    const test = await Test.findById(test_id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    if (test.test_type !== 'written')
      return res.status(400).json({ success: false, message: 'Use /voice for voice tests' });

    await ensureRolePlayUnlocked(test, req.user);
    await assertCanAttemptAssessment(req.user._id, test);

    const enrollment = await Enrollment.findOne({ trainee_id: req.user._id, course_id });
    if (enrollment?.status === 'not_started') {
      enrollment.status = 'in_progress';
      await enrollment.save();
    }

    const attempt = await saveWrittenAttempt({
      traineeId: req.user._id,
      testId: test_id,
      courseId: course_id,
      enrollmentId: enrollment?._id,
      questions: test.questions,
      answers,
      startedAt: started_at,
    });

    res.status(201).json({ success: true, attempt });
  } catch (err) { next(err); }
});

// POST /api/attempts/voice
router.post('/voice', authenticate, authorize('trainee'), (req, res, next) => {
  uploadAudio(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ success: false, message: uploadErr.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'Audio file required' });

    try {
      const { test_id, course_id } = req.body;
      if (!test_id || !course_id)
        return res.status(400).json({ success: false, message: 'test_id, course_id required' });

      const test = await Test.findById(test_id);
      if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
      if (test.test_type !== 'voice')
        return res.status(400).json({ success: false, message: 'Not a voice test' });

      await ensureRolePlayUnlocked(test, req.user);
      await assertCanAttemptAssessment(req.user._id, test);

      const enrollment = await Enrollment.findOne({ trainee_id: req.user._id, course_id });

      const attempt = await saveVoiceAttempt({
        traineeId: req.user._id,
        testId: test_id,
        courseId: course_id,
        enrollmentId: enrollment?._id,
        questions: test.questions,
        audioBuffer: req.file.buffer,
        contentType: req.file.mimetype,
      });

      res.status(201).json({ success: true, attempt });
    } catch (err) { next(err); }
  });
});

// POST /api/attempts/reset — admin/trainer reset trainee attempts for a course
router.post('/reset', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { trainee_id, course_id } = req.body;
    if (!trainee_id || !course_id) {
      return res.status(400).json({ success: false, message: 'trainee_id and course_id required' });
    }

    const attempts = await Attempt.find({ trainee_id, course_id });
    if (!attempts.length) {
      return res.json({ success: true, deleted_count: 0, message: 'No attempts to reset' });
    }

    for (const attempt of attempts) {
      if (attempt.recording_gridfs_id) {
        try {
          await deleteRecording(attempt.recording_gridfs_id);
        } catch (err) {
          console.warn('[attempts.reset] recording delete skipped:', err.message);
        }
      }
    }

    const testIds = [...new Set(attempts.map((a) => String(a.test_id)).filter(Boolean))];
    const tests = await Test.find({ _id: { $in: testIds } }).select('lesson_id');
    const lessonIds = tests.map((t) => t.lesson_id).filter(Boolean);

    const deleted = await Attempt.deleteMany({ trainee_id, course_id });

    if (lessonIds.length) {
      await LessonProgress.updateMany(
        { trainee_id, lesson_id: { $in: lessonIds } },
        {
          $set: {
            status: 'not_started',
            score: null,
            watch_percent: 0,
            started_at: null,
            completed_at: null,
          },
        }
      );
    }

    const enrollment = await Enrollment.findOne({ trainee_id, course_id });
    if (enrollment) {
      enrollment.best_score = null;
      enrollment.status = 'not_started';
      enrollment.progress = 0;
      enrollment.completed_at = null;
      await enrollment.save();
    }

    await recalculateEnrollmentProgress({ traineeId: trainee_id, courseId: course_id });

    res.json({
      success: true,
      deleted_count: deleted.deletedCount,
      lesson_ids_reset: lessonIds.map(String),
    });
  } catch (err) { next(err); }
});

// GET /api/attempts/my
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const attempts = await Attempt.find({ trainee_id: req.user._id })
      .populate('course_id', 'title')
      .populate('test_id', 'title test_type lesson_id')
      .sort({ submitted_at: -1 });
    res.json({ success: true, attempts });
  } catch (err) { next(err); }
});

// GET /api/attempts/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.id)
      .populate('course_id', 'title requires_voice_test passing_score')
      .populate('test_id', 'title test_type questions');

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });

    // Only the trainee or admin/trainer can view
    if (req.user.role === 'trainee' && !attempt.trainee_id.equals(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const obj = attempt.toObject();
    // Attach questions snapshot for result page
    if (attempt.test_id?.questions) {
      obj.questions = attempt.test_id.questions;
    }
    obj.course_title = attempt.course_id?.title;
    obj.passing_score = attempt.course_id?.passing_score || 60;

    res.json({ success: true, attempt: obj });
  } catch (err) { next(err); }
});

// GET /api/attempts/:id/recording — Stream audio from GridFS
router.get('/:id/recording', authenticate, async (req, res, next) => {
  try {
    const attempt = await Attempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (!attempt.recording_gridfs_id)
      return res.status(404).json({ success: false, message: 'No recording' });

    if (req.user.role === 'trainee' && !attempt.trainee_id.equals(req.user._id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    await streamRecording(attempt.recording_gridfs_id, res);
  } catch (err) { next(err); }
});

// GET /api/attempts/course/:courseId/trainee/:traineeId
router.get('/course/:courseId/trainee/:traineeId', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const attempts = await Attempt.find({
      course_id: req.params.courseId,
      trainee_id: req.params.traineeId,
    }).sort({ submitted_at: -1 });
    res.json({ success: true, attempts });
  } catch (err) { next(err); }
});

module.exports = router;
