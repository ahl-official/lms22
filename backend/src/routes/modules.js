const router = require('express').Router();
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Test = require('../models/Test');
const { authenticate, authorize } = require('../middleware/auth');
const { detectVideoSource, fetchTranscript } = require('../services/transcriptService');
const { generateTest } = require('../services/aiService');

// ── GET /api/modules/course/:courseId ─────────────────────────────────────
router.get('/course/:courseId', authenticate, async (req, res, next) => {
    try {
        const filter = { course_id: req.params.courseId };
        if (req.user.role === 'trainee') filter.is_published = true;

        const modules = await Module.find(filter).sort({ order: 1, createdAt: 1 });

        // ── Trainer / Admin — attach counts ───────────────────────────────────
        if (req.user.role !== 'trainee') {
            const modulesWithCounts = await Promise.all(modules.map(async (m) => {
                const obj = m.toObject();
                const [lesson_count, test_count, draft_count] = await Promise.all([
                    Lesson.countDocuments({ module_id: m._id, is_published: true }),
                    Test.countDocuments({ module_id: m._id, is_active: true }),
                    Test.countDocuments({ module_id: m._id, is_active: false }),
                ]);
                obj.lesson_count = lesson_count;
                obj.test_count = test_count;
                obj.draft_count = draft_count;
                return obj;
            }));
            return res.json({ success: true, modules: modulesWithCounts });
        }

        // ── Trainee — lock/complete via LessonProgress ────────────────────────
        const moduleIds = modules.map(m => m._id);

        // Total published lessons per module
        const lessonDocs = await Lesson.find(
            { module_id: { $in: moduleIds }, is_published: true },
            'module_id'
        );
        const totalByMod = {};
        for (const l of lessonDocs) {
            const k = l.module_id.toString();
            totalByMod[k] = (totalByMod[k] || 0) + 1;
        }

        // Completed lessons per module for this trainee
        const agg = await LessonProgress.aggregate([
            { $match: { trainee_id: req.user._id, module_id: { $in: moduleIds }, status: 'completed' } },
            { $group: { _id: '$module_id', count: { $sum: 1 } } },
        ]);
        const doneByMod = {};
        for (const row of agg) doneByMod[row._id.toString()] = row.count;

        // Build completed set
        const completedSet = new Set();
        for (const mod of modules) {
            const k = mod._id.toString();
            if ((totalByMod[k] || 0) > 0 && (doneByMod[k] || 0) >= totalByMod[k]) {
                completedSet.add(k);
            }
        }

        const result = modules.map((mod, idx) => {
            const obj = mod.toObject();
            const k = mod._id.toString();
            obj.lesson_count = totalByMod[k] || 0;
            obj.lessons_completed = doneByMod[k] || 0;
            obj.is_completed = completedSet.has(k);
            obj.is_locked = idx === 0 ? false : !completedSet.has(modules[idx - 1]._id.toString());
            return obj;
        });

        res.json({ success: true, modules: result });
    } catch (err) { next(err); }
});

// ── GET /api/modules/:id ──────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const module = await Module.findById(req.params.id);
        if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
        res.json({ success: true, module });
    } catch (err) { next(err); }
});

// ── POST /api/modules ─────────────────────────────────────────────────────
router.post('/', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const { course_id, title, description, video_url, requires_voice_test, passing_score } = req.body;
        if (!course_id || !title)
            return res.status(400).json({ success: false, message: 'course_id and title required' });

        const last = await Module.findOne({ course_id }).sort({ order: -1 });
        const order = last ? last.order + 1 : 0;
        const video_source = video_url ? detectVideoSource(video_url) : 'unknown';

        const mod = await Module.create({
            course_id, title, description, video_url, video_source,
            requires_voice_test: !!requires_voice_test,
            passing_score: passing_score || 60,
            order,
            created_by: req.user._id,
        });
        res.status(201).json({ success: true, module: mod });
    } catch (err) { next(err); }
});

// ── PUT /api/modules/:id ──────────────────────────────────────────────────
router.put('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const mod = await Module.findById(req.params.id);
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });

        const { title, description, video_url, requires_voice_test, passing_score } = req.body;
        if (video_url && video_url !== mod.video_url) {
            mod.video_url = video_url;
            mod.video_source = detectVideoSource(video_url);
            mod.transcript = null;
            mod.transcript_status = 'none';
        }
        if (title !== undefined) mod.title = title;
        if (description !== undefined) mod.description = description;
        if (requires_voice_test !== undefined) mod.requires_voice_test = requires_voice_test;
        if (passing_score !== undefined) mod.passing_score = passing_score;

        await mod.save();
        res.json({ success: true, module: mod });
    } catch (err) { next(err); }
});

// ── DELETE /api/modules/:id ───────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        await Promise.all([
            Module.findByIdAndDelete(req.params.id),
            Test.deleteMany({ module_id: req.params.id }),
            Lesson.deleteMany({ module_id: req.params.id }),
            LessonProgress.deleteMany({ module_id: req.params.id }),
        ]);
        res.json({ success: true, message: 'Module and all its content deleted' });
    } catch (err) { next(err); }
});

// ── PUT /api/modules/:id/reorder ──────────────────────────────────────────
router.put('/:id/reorder', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const { order } = req.body;
        if (typeof order !== 'number')
            return res.status(400).json({ success: false, message: 'order must be a number' });
        const mod = await Module.findByIdAndUpdate(req.params.id, { order }, { new: true });
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
        res.json({ success: true, module: mod });
    } catch (err) { next(err); }
});

// ── PUT /api/modules/:id/publish ──────────────────────────────────────────
router.put('/:id/publish', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const mod = await Module.findByIdAndUpdate(
            req.params.id, { is_published: req.body.publish !== false }, { new: true }
        );
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
        res.json({ success: true, module: mod });
    } catch (err) { next(err); }
});

// ── POST /api/modules/:id/fetch-transcript ────────────────────────────────
router.post('/:id/fetch-transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const mod = await Module.findById(req.params.id);
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
        if (!mod.video_url) return res.status(400).json({ success: false, message: 'No video URL set' });

        mod.transcript_status = 'fetching';
        await mod.save();
        try {
            mod.transcript = await fetchTranscript(mod.video_url);
            mod.transcript_status = 'ready';
        } catch (e) {
            mod.transcript_status = 'error';
            await mod.save();
            return res.status(422).json({ success: false, message: e.message });
        }
        await mod.save();
        res.json({ success: true, transcript_status: mod.transcript_status });
    } catch (err) { next(err); }
});

// ── PUT /api/modules/:id/transcript ──────────────────────────────────────
router.put('/:id/transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const mod = await Module.findById(req.params.id);
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
        mod.transcript = req.body.transcript;
        mod.transcript_status = 'ready';
        await mod.save();
        res.json({ success: true, module: mod });
    } catch (err) { next(err); }
});

// ── POST /api/modules/:id/generate-test ──────────────────────────────────
router.post('/:id/generate-test', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const mod = await Module.findById(req.params.id);
        if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
        if (!mod.transcript) return res.status(400).json({ success: false, message: 'Fetch transcript first' });

        const { test_type = 'written', question_count = 5 } = req.body;
        const questions = await generateTest(mod.transcript, {
            testType: test_type, questionCount: question_count, courseTitle: mod.title,
        });
        const last = await Test.findOne({ module_id: mod._id }).sort({ order: -1 });
        const order = last ? last.order + 1 : 0;

        const test = await Test.create({
            course_id: mod.course_id, module_id: mod._id,
            title: `${mod.title} — ${test_type === 'voice' ? 'Voice' : 'Written'} Assessment`,
            test_type, questions, passing_score: mod.passing_score || 60,
            is_active: false, order, created_by: req.user._id,
        });
        res.status(201).json({ success: true, test });
    } catch (err) { next(err); }
});

module.exports = router;