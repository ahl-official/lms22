const router = require('express').Router();
const Attempt = require('../models/Attempt');
const Test = require('../models/Test');
const Enrollment = require('../models/Enrollment');
const RolePlayProgress = require('../models/RolePlayProgress');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadAudio } = require('../middleware/upload');
const { saveWrittenAttempt, saveVoiceAttempt } = require('../services/attemptService');
const { streamRecording } = require('../config/gridfs');

const ensureRolePlayUnlocked = async (test, traineeId) => {
  if (!test.lesson_id) return;

  const progress = await RolePlayProgress.findOne({
    trainee_id: traineeId,
    lesson_id: test.lesson_id,
  });

  if (progress?.passed || progress?.unlocked_by_trainer) return;

  const err = new Error(
    (progress?.attempts_used || 0) >= 10
      ? 'Contact trainer to unlock test as failed 10 times.'
      : 'Score 80% in Role Playing to unlock this assessment.'
  );
  err.status = 423;
  throw err;
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

    await ensureRolePlayUnlocked(test, req.user._id);

    // Check attempt count
    const attemptCount = await Attempt.countDocuments({ trainee_id: req.user._id, test_id });
    if (attemptCount >= (test.max_attempts || 3))
      return res.status(429).json({ success: false, message: 'Max attempts reached' });

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

      await ensureRolePlayUnlocked(test, req.user._id);

      const attemptCount = await Attempt.countDocuments({ trainee_id: req.user._id, test_id });
      if (attemptCount >= (test.max_attempts || 3))
        return res.status(429).json({ success: false, message: 'Max attempts reached' });

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

// GET /api/attempts/my
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const attempts = await Attempt.find({ trainee_id: req.user._id })
      .populate('course_id', 'title')
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
