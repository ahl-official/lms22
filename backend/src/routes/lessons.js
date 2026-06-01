// REPLACE backend/src/routes/lessons.js
// Added: lesson-level test CRUD, AI notes generation per lesson

const router = require('express').Router();
const axios = require('axios');
const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Test = require('../models/Test');
const Attempt = require('../models/Attempt');
const Module = require('../models/Module');
const Enrollment = require('../models/Enrollment');
const { authenticate, authorize } = require('../middleware/auth');
const { detectContentSource, fetchTranscript } = require('../services/transcriptService');
const { generateTest, normalizeBrandTerms } = require('../services/aiService');

// ── helpers ───────────────────────────────────────────────────────────────────

const stripAnswers = (lesson) => {
    const obj = lesson.toObject ? lesson.toObject() : { ...lesson };
    obj.quiz_questions = (obj.quiz_questions || []).map(({ correct_answer, ...q }) => q);
    if (obj.test_id?.questions) {
        obj.test_id.questions = obj.test_id.questions.map(({ correct_answer, ...q }) => q);
    }
    return obj;
};

const attachProgress = async (lessons, traineeId) => {
    if (!traineeId) return lessons;
    const lessonIds = lessons.map((l) => l._id || l.lesson_id);
    const testIds = lessons
        .map(l => l.test_id?._id || l.test_id)
        .filter(Boolean);

    const [progItems, attempts] = await Promise.all([
        LessonProgress.find({
            trainee_id: traineeId,
            lesson_id: { $in: lessonIds },
        }).select('lesson_id status score completed_at watch_percent'),
        testIds.length
            ? Attempt.find({
                trainee_id: traineeId,
                test_id: { $in: testIds },
                status: 'scored',
            }).select('test_id score passing_score submitted_at').sort({ submitted_at: -1 }).lean()
            : [],
    ]);

    const progMap = {};
    for (const p of progItems) progMap[p.lesson_id.toString()] = p;

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

    return lessons.map((l) => {
        const id = (l._id || l.lesson_id).toString();
        const prog = progMap[id];
        const testId = l.test_id?._id || l.test_id;
        const attemptsForTest = testId ? attemptMap[testId.toString()] : null;
        const maxAttempts = l.test_id?.max_attempts || 3;
        return {
            ...l,
            is_completed: prog?.status === 'completed' || !!attemptsForTest?.passed,
            progress_status: prog?.status || (attemptsForTest?.passed ? 'completed' : 'not_started'),
            lesson_score: prog?.score ?? attemptsForTest?.best_score ?? null,
            watch_percent: prog?.watch_percent ?? 0,
            completed_at: prog?.completed_at ?? (attemptsForTest?.passed ? attemptsForTest.latest.submitted_at : null),
            assessment_attempt: attemptsForTest ? {
                latest_attempt_id: attemptsForTest.latest._id,
                latest_score: attemptsForTest.latest.score,
                latest_submitted_at: attemptsForTest.latest.submitted_at,
                best_score: attemptsForTest.best_score,
                passed: attemptsForTest.passed,
                attempts_used: attemptsForTest.attempts_used,
                attempts_remaining: Math.max(0, maxAttempts - attemptsForTest.attempts_used),
                max_attempts: maxAttempts,
            } : null,
        };
    });
};

const applyContentLink = (lesson, rawUrl) => {
    const url = rawUrl?.trim?.() || null;
    const detected = url ? detectContentSource(url) : {
        content_type: 'unknown',
        content_source: 'unknown',
        video_source: 'unknown',
        embed_url: null,
    };

    lesson.content_url = url;
    lesson.content_type = detected.content_type;
    lesson.content_source = detected.content_source;
    lesson.embed_url = detected.embed_url;
    lesson.video_url = url;
    lesson.video_source = detected.video_source || 'unknown';
};

const resetGeneratedLessonContent = (lesson) => {
    lesson.transcript = null;
    lesson.transcript_status = 'none';
    lesson.ai_notes = { summary: null, checklist: null, flashcards: null, diagrams: null, keyPoints: null, generated_at: null };
    lesson.roleplay_personas = { personas: null, generated_at: null };
};

// ── GET /api/lessons/module/:moduleId ─────────────────────────────────────────
router.get('/module/:moduleId', authenticate, async (req, res, next) => {
    try {
        const filter = { module_id: req.params.moduleId };
        if (req.user.role === 'trainee') filter.is_published = true;

        const raw = await Lesson.find(filter)
            .sort({ order: 1, createdAt: 1 })
            .populate({
                path: 'test_id',
                select: 'title test_type passing_score is_active questions time_limit_minutes max_attempts',
            })
            .lean();

        let lessons =
            req.user.role === 'trainee'
                ? raw.map(stripAnswers)
                : raw;

        if (req.user.role === 'trainee') {
            lessons = await attachProgress(lessons, req.user._id);
        }

        res.json({ success: true, lessons });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/lessons/course/:courseId ─────────────────────────────────────────
router.get('/course/:courseId', authenticate, async (req, res, next) => {
    try {
        const filter = { course_id: req.params.courseId };
        if (req.user.role === 'trainee') filter.is_published = true;

        const raw = await Lesson.find(filter)
            .sort({ order: 1, createdAt: 1 })
            .populate({
                path: 'test_id',
                select: 'title test_type passing_score is_active max_attempts',
            })
            .lean();

        let lessons =
            req.user.role === 'trainee'
                ? raw.map(stripAnswers)
                : raw;

        if (req.user.role === 'trainee') {
            lessons = await attachProgress(lessons, req.user._id);
        }

        res.json({ success: true, lessons });
    } catch (err) {
        next(err);
    }
});

// ── GET /api/lessons/:id ──────────────────────────────────────────────────────
router.get('/:id', authenticate, async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id).populate({
            path: 'test_id',
            select: 'title test_type passing_score is_active questions time_limit_minutes max_attempts',
        }).lean();
        if (!lesson)
            return res.status(404).json({ success: false, message: 'Lesson not found' });

        let obj = req.user.role === 'trainee' ? stripAnswers(lesson) : { ...lesson };

        if (req.user.role === 'trainee') {
            const prog = await LessonProgress.findOne({
                trainee_id: req.user._id,
                lesson_id: lesson._id,
            });
            obj.is_completed = prog?.status === 'completed';
            obj.progress_status = prog?.status || 'not_started';
            obj.lesson_score = prog?.score ?? null;
            obj.watch_percent = prog?.watch_percent ?? 0;
        }

        res.json({ success: true, lesson: obj });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/lessons ─────────────────────────────────────────────────────────
router.post('/', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const {
            module_id, course_id, title, description,
            content_url, video_url, text_content, study_notes,
            quiz_questions, quiz_passing_score, duration_minutes,
        } = req.body;

        if (!module_id || !course_id || !title)
            return res.status(400).json({ success: false, message: 'module_id, course_id, title required' });

        const mod = await Module.findById(module_id);
        if (!mod || mod.course_id.toString() !== course_id.toString())
            return res.status(400).json({ success: false, message: 'Module does not belong to this course' });

        const last = await Lesson.findOne({ module_id }).sort({ order: -1 });
        const order = last ? last.order + 1 : 0;
        const contentLink = content_url !== undefined ? content_url : video_url;
        const detected = contentLink ? detectContentSource(contentLink) : null;

        const lesson = await Lesson.create({
            module_id, course_id,
            title: title.trim(),
            description: description?.trim() || '',
            order,
            content_url: contentLink?.trim?.() || null,
            content_type: detected?.content_type || 'unknown',
            content_source: detected?.content_source || 'unknown',
            embed_url: detected?.embed_url || null,
            video_url: contentLink?.trim?.() || null,
            video_source: detected?.video_source || 'unknown',
            text_content: text_content || null,
            study_notes: study_notes || null,
            quiz_questions: quiz_questions || [],
            quiz_passing_score: quiz_passing_score || 60,
            duration_minutes: duration_minutes || null,
            created_by: req.user._id,
        });

        res.status(201).json({ success: true, lesson });
    } catch (err) {
        next(err);
    }
});

// ── PUT /api/lessons/:id ──────────────────────────────────────────────────────
router.put('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson)
            return res.status(404).json({ success: false, message: 'Lesson not found' });

        const {
            title, description, order, is_published,
            content_url, video_url, text_content, study_notes,
            quiz_questions, quiz_passing_score, duration_minutes,
        } = req.body;

        if (title !== undefined) lesson.title = title.trim();
        if (description !== undefined) lesson.description = description.trim();
        if (order !== undefined) lesson.order = order;
        if (is_published !== undefined) lesson.is_published = is_published;
        if (text_content !== undefined) lesson.text_content = text_content;
        if (study_notes !== undefined) lesson.study_notes = study_notes;
        if (quiz_questions !== undefined) lesson.quiz_questions = quiz_questions;
        if (quiz_passing_score !== undefined) lesson.quiz_passing_score = quiz_passing_score;
        if (duration_minutes !== undefined) lesson.duration_minutes = duration_minutes;

        const nextContentUrl = content_url !== undefined ? content_url : video_url;
        if (nextContentUrl !== undefined && nextContentUrl !== (lesson.content_url || lesson.video_url || null)) {
            applyContentLink(lesson, nextContentUrl);
            resetGeneratedLessonContent(lesson);
        }

        await lesson.save();
        res.json({ success: true, lesson });
    } catch (err) {
        next(err);
    }
});

// ── DELETE /api/lessons/:id ───────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findByIdAndDelete(req.params.id);
        if (!lesson)
            return res.status(404).json({ success: false, message: 'Lesson not found' });

        await Promise.all([
            LessonProgress.deleteMany({ lesson_id: req.params.id }),
            Test.updateMany({ lesson_id: req.params.id }, { $set: { lesson_id: null } }),
        ]);

        res.json({ success: true, message: 'Lesson deleted' });
    } catch (err) {
        next(err);
    }
});

// ── PUT /api/lessons/:id/reorder ──────────────────────────────────────────────
router.put('/:id/reorder', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const { order } = req.body;
        if (typeof order !== 'number')
            return res.status(400).json({ success: false, message: 'order must be a number' });
        const lesson = await Lesson.findByIdAndUpdate(req.params.id, { order }, { new: true });
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
        res.json({ success: true, lesson });
    } catch (err) {
        next(err);
    }
});

// ── PUT /api/lessons/:id/publish ──────────────────────────────────────────────
router.put('/:id/publish', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findByIdAndUpdate(
            req.params.id,
            { is_published: req.body.publish !== false },
            { new: true }
        );
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
        res.json({ success: true, lesson });
    } catch (err) {
        next(err);
    }
});

// ── POST /api/lessons/:id/fetch-transcript ────────────────────────────────────
router.post('/:id/fetch-transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
        const contentUrl = lesson.content_url || lesson.video_url;
        if (!contentUrl) return res.status(400).json({ success: false, message: 'No content URL set on this lesson' });

        if (!lesson.content_url) {
            applyContentLink(lesson, contentUrl);
        }

        lesson.transcript_status = 'fetching';
        await lesson.save();

        let transcript = null;
        let fetchError = null;

        try {
            transcript = await fetchTranscript(contentUrl);
        } catch (e) {
            fetchError = e.message;
            console.error(`[Transcript] Fetch failed for lesson ${lesson._id}:`, e.message);
        }

        if (transcript && transcript.trim().length > 0) {
            lesson.transcript = transcript;
            lesson.transcript_status = 'ready';
            // Bust cached AI notes since transcript changed
            lesson.ai_notes = { summary: null, checklist: null, flashcards: null, diagrams: null, keyPoints: null, generated_at: null };
            lesson.roleplay_personas = { personas: null, generated_at: null };
            await lesson.save();
            return res.json({ success: true, transcript_status: 'ready' });
        } else {
            lesson.transcript_status = 'error';
            await lesson.save();
            return res.status(422).json({
                success: false,
                transcript_status: 'error',
                message: fetchError || 'Transcript was empty. Try pasting it manually.',
            });
        }
    } catch (err) {
        next(err);
    }
});

// ── PUT /api/lessons/:id/transcript ───────────────────────────────────────────
router.put('/:id/transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

        lesson.transcript = req.body.transcript;
        lesson.transcript_status = 'ready';
        lesson.ai_notes = { summary: null, checklist: null, flashcards: null, diagrams: null, keyPoints: null, generated_at: null };
        lesson.roleplay_personas = { personas: null, generated_at: null };
        await lesson.save();
        res.json({ success: true, lesson });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// LESSON-LEVEL TEST MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/lessons/:id/test
router.get('/:id/test', authenticate, async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id).populate('test_id');
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

        let test = lesson.test_id
            ? lesson.test_id.toObject()
            : null;

        if (!test) {
            // Fallback: find by lesson_id directly
            const found = await Test.findOne({ lesson_id: req.params.id });
            test = found ? found.toObject() : null;
        }

        if (!test) return res.json({ success: true, test: null });

        if (req.user.role === 'trainee') {
            test.questions = (test.questions || []).map(({ correct_answer, ...q }) => q);
        }

        res.json({ success: true, test });
    } catch (err) {
        next(err);
    }
});

// POST /api/lessons/:id/test/generate  (AI-generate)
router.post('/:id/test/generate', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
        if (!lesson.transcript)
            return res.status(400).json({ success: false, message: 'Fetch transcript first' });

        const { test_type = 'written', question_count = 5 } = req.body;

        const questions = await generateTest(lesson.transcript, {
            testType: test_type,
            questionCount: Number(question_count),
            courseTitle: lesson.title,
        });

        // Remove old lesson test if any
        if (lesson.test_id) {
            await Test.findByIdAndDelete(lesson.test_id);
        }

        const test = await Test.create({
            course_id: lesson.course_id,
            module_id: lesson.module_id,
            lesson_id: lesson._id,
            title: `${lesson.title} — ${test_type === 'voice' ? 'Voice' : 'Written'} Assessment`,
            test_type,
            questions,
            passing_score: 60,
            is_active: false,
            created_by: req.user._id,
        });

        lesson.test_id = test._id;
        await lesson.save();

        res.status(201).json({ success: true, test });
    } catch (err) {
        next(err);
    }
});

// PUT /api/lessons/:id/test/approve
router.put('/:id/test/approve', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson || !lesson.test_id)
            return res.status(404).json({ success: false, message: 'No test found for this lesson' });

        const test = await Test.findByIdAndUpdate(lesson.test_id, { is_active: true }, { new: true });
        res.json({ success: true, test });
    } catch (err) {
        next(err);
    }
});

// PUT /api/lessons/:id/test  (update questions)
router.put('/:id/test', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson || !lesson.test_id)
            return res.status(404).json({ success: false, message: 'No test for this lesson' });

        const test = await Test.findByIdAndUpdate(lesson.test_id, req.body, { new: true, runValidators: true });
        res.json({ success: true, test });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/lessons/:id/test
router.delete('/:id/test', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

        if (lesson.test_id) {
            await Test.findByIdAndDelete(lesson.test_id);
            lesson.test_id = null;
            await lesson.save();
        }

        res.json({ success: true, message: 'Lesson test removed' });
    } catch (err) {
        next(err);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// AI NOTES — lesson-level, cached in lesson document
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/lessons/:id/ai-notes
router.post('/:id/ai-notes', authenticate, async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.id);
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
        if (!lesson.transcript)
            return res.status(400).json({ success: false, message: 'No transcript — fetch it first' });

        // Return cache if fresh (< 24h) and not forcing refresh
        const cacheAge = lesson.ai_notes?.generated_at
            ? Date.now() - new Date(lesson.ai_notes.generated_at).getTime()
            : Infinity;

        if (cacheAge < 24 * 60 * 60 * 1000 && lesson.ai_notes?.summary && !req.body.force) {
            const notes = normalizeBrandTerms(lesson.ai_notes, `${lesson.title}\n${lesson.transcript || ''}`);
            return res.json({ success: true, notes, cached: true });
        }

        const prompt = `You are a study assistant for an LMS. Given this lesson transcript, generate study materials.

Lesson: "${lesson.title}"
Transcript: """${lesson.transcript.slice(0, 6000)}"""

Return ONLY valid JSON (no markdown, no code fences):
{
  "summary": "2-3 sentence overview",
  "checklist": ["action item 1", "action item 2", "action item 3", "action item 4", "action item 5"],
  "flashcards": [{"front": "question", "back": "answer"}],
  "diagrams": [{"title": "short title", "code": "valid mermaid code"}],
  "keyPoints": ["point 1", "point 2", "point 3", "point 4", "point 5"]
}

Rules:
- Preserve exact brand/company names from the lesson transcript. If it says "American Hairline", never write "American Airline" or "American Airlines".
- Checklist must summarize everything the trainee should actually do after watching/reading the lesson.
- Checklist items must be practical, action-oriented, and start with a verb.
- Use 5-8 checklist items.
- 6-8 flashcards, progressively harder
- First diagram: flowchart TD. Second diagram: mindmap
- Mindmap root MUST use: root((Word))
- No semicolons in diagram code. No quotes inside node labels
- Node labels under 20 characters`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: process.env.LLM_MODEL || 'openai/gpt-4o-mini',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                },
            }
        );

        const raw = response.data.choices?.[0]?.message?.content || '';
        const notes = normalizeBrandTerms(
            JSON.parse(raw.replace(/```json|```/g, '').trim()),
            `${lesson.title}\n${lesson.transcript || ''}`
        );

        lesson.ai_notes = { ...notes, generated_at: new Date() };
        await lesson.save();

        res.json({ success: true, notes, cached: false });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
