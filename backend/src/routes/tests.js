const router = require('express').Router();
const Test = require('../models/Test');
const Attempt = require('../models/Attempt');
const { authenticate, authorize } = require('../middleware/auth');

// ── GET /api/tests/course/:courseId ───────────────────────────────────────
router.get('/course/:courseId', authenticate, async (req, res, next) => {
  try {
    const filter = { course_id: req.params.courseId };
    if (req.user.role === 'trainee') filter.is_active = true;
    const tests = await Test.find(filter).sort({ order: 1, createdAt: 1 });
    if (req.user.role !== 'trainee') return res.json({ success: true, tests });

    const testIds = tests.map(t => t._id);
    const attempts = await Attempt.find({
      trainee_id: req.user._id,
      test_id: { $in: testIds },
      status: 'scored',
    }).select('test_id score passing_score submitted_at').sort({ submitted_at: -1 }).lean();

    const attemptMap = {};
    for (const attempt of attempts) {
      const key = attempt.test_id.toString();
      if (!attemptMap[key]) {
        attemptMap[key] = {
          latest: attempt,
          best_score: attempt.score,
          attempts_used: 0,
          passed: false,
        };
      }
      const row = attemptMap[key];
      row.attempts_used += 1;
      if (attempt.score > row.best_score) row.best_score = attempt.score;
      if (attempt.score >= (attempt.passing_score || 60)) row.passed = true;
    }

    const passedTestIds = new Set(
      attempts
        .filter(a => {
          const test = tests.find(t => t._id.equals(a.test_id));
          return test && a.score >= (test.passing_score || 60);
        })
        .map(a => a.test_id.toString())
    );

    const sanitized = tests.map((t, idx) => {
      const obj = t.toObject();
      obj.questions = obj.questions.map(({ correct_answer, ...q }) => q);
      obj.is_locked = idx > 0 && !passedTestIds.has(tests[idx - 1]._id.toString());
      const attemptInfo = attemptMap[t._id.toString()];
      obj.assessment_attempt = attemptInfo ? {
        latest_attempt_id: attemptInfo.latest._id,
        latest_score: attemptInfo.latest.score,
        latest_submitted_at: attemptInfo.latest.submitted_at,
        best_score: attemptInfo.best_score,
        passed: attemptInfo.passed,
        attempts_used: attemptInfo.attempts_used,
        attempts_remaining: Math.max(0, (t.max_attempts || 3) - attemptInfo.attempts_used),
        max_attempts: t.max_attempts || 3,
      } : null;
      return obj;
    });

    res.json({ success: true, tests: sanitized });
  } catch (err) { next(err); }
});

// ── GET /api/tests/module/:moduleId ───────────────────────────────────────
router.get('/module/:moduleId', authenticate, async (req, res, next) => {
  try {
    const filter = { module_id: req.params.moduleId };
    if (req.user.role === 'trainee') filter.is_active = true;

    const tests = await Test.find(filter).sort({ order: 1, createdAt: 1 });

    if (req.user.role !== 'trainee') return res.json({ success: true, tests });

    const testIds = tests.map(t => t._id);
    const attempts = await Attempt.find({
      trainee_id: req.user._id,
      test_id: { $in: testIds },
      status: 'scored',
    }).select('test_id score passing_score submitted_at').sort({ submitted_at: -1 }).lean();

    const attemptMap = {};
    for (const attempt of attempts) {
      const key = attempt.test_id.toString();
      if (!attemptMap[key]) {
        attemptMap[key] = {
          latest: attempt,
          best_score: attempt.score,
          attempts_used: 0,
          passed: false,
        };
      }
      const row = attemptMap[key];
      row.attempts_used += 1;
      if (attempt.score > row.best_score) row.best_score = attempt.score;
      if (attempt.score >= (attempt.passing_score || 60)) row.passed = true;
    }

    const passedTestIds = new Set(
      attempts
        .filter(a => {
          const test = tests.find(t => t._id.equals(a.test_id));
          return test && a.score >= (test.passing_score || 60);
        })
        .map(a => a.test_id.toString())
    );

    const sanitized = tests.map((t, idx) => {
      const obj = t.toObject();
      obj.questions = obj.questions.map(({ correct_answer, ...q }) => q);
      obj.is_locked = idx > 0 && !passedTestIds.has(tests[idx - 1]._id.toString());
      const attemptInfo = attemptMap[t._id.toString()];
      obj.assessment_attempt = attemptInfo ? {
        latest_attempt_id: attemptInfo.latest._id,
        latest_score: attemptInfo.latest.score,
        latest_submitted_at: attemptInfo.latest.submitted_at,
        best_score: attemptInfo.best_score,
        passed: attemptInfo.passed,
        attempts_used: attemptInfo.attempts_used,
        attempts_remaining: Math.max(0, (t.max_attempts || 3) - attemptInfo.attempts_used),
        max_attempts: t.max_attempts || 3,
      } : null;
      return obj;
    });

    res.json({ success: true, tests: sanitized });
  } catch (err) { next(err); }
});

// ── GET /api/tests/:id ────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    const obj = test.toObject();
    if (req.user.role === 'trainee') {
      obj.questions = obj.questions.map(({ correct_answer, ...q }) => q);
    }
    res.json({ success: true, test: obj });
  } catch (err) { next(err); }
});

// ── PUT /api/tests/:id/approve ────────────────────────────────────────────
router.put('/:id/approve', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const test = await Test.findByIdAndUpdate(req.params.id, { is_active: true }, { new: true });
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    res.json({ success: true, test });
  } catch (err) { next(err); }
});

// ── PUT /api/tests/:id/unpublish ──────────────────────────────────────────
router.put('/:id/unpublish', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const test = await Test.findByIdAndUpdate(req.params.id, { is_active: false }, { new: true });
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    res.json({ success: true, test });
  } catch (err) { next(err); }
});

// ── PUT /api/tests/:id/reorder ────────────────────────────────────────────
router.put('/:id/reorder', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { order } = req.body;
    if (typeof order !== 'number')
      return res.status(400).json({ success: false, message: 'order must be a number' });
    const test = await Test.findByIdAndUpdate(req.params.id, { order }, { new: true });
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    res.json({ success: true, test });
  } catch (err) { next(err); }
});

// ── POST /api/tests ───────────────────────────────────────────────────────
router.post('/', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { course_id, module_id, title, test_type, questions,
      time_limit_minutes, max_attempts, passing_score, order } = req.body;

    if (!course_id || !title || !questions?.length)
      return res.status(400).json({ success: false, message: 'course_id, title, questions required' });

    let resolvedOrder = order;
    if (resolvedOrder == null) {
      const last = await Test.findOne({ module_id: module_id || null, course_id }).sort({ order: -1 });
      resolvedOrder = last ? last.order + 1 : 0;
    }

    const test = await Test.create({
      course_id, module_id: module_id || null, title, test_type, questions,
      time_limit_minutes, max_attempts, passing_score,
      order: resolvedOrder, is_active: false, created_by: req.user._id,
    });

    res.status(201).json({ success: true, test });
  } catch (err) { next(err); }
});

// ── PUT /api/tests/:id ────────────────────────────────────────────────────
router.put('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const test = await Test.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!test) return res.status(404).json({ success: false, message: 'Test not found' });
    res.json({ success: true, test });
  } catch (err) { next(err); }
});

// ── DELETE /api/tests/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    await Test.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Test deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
