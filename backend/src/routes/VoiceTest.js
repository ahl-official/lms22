const router = require('express').Router();
const multer = require('multer');
const Course = require('../models/Course');
const Test = require('../models/Test');
const Lesson = require('../models/Lesson');
const Attempt = require('../models/Attempt');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const RolePlayProgress = require('../models/RolePlayProgress');
const { authenticate } = require('../middleware/auth');
const {
    generateNextQuestion,
    scoreConversation,
    evaluateAnswer,
    determineAdaptiveDifficulty,
    normalizeBrandTerms,
    translateVoiceQuestions,
    normalizeAssessmentLanguage,
    repairHindiVoiceTranscript,
    toRomanHinglishDisplay,
    toRomanHinglishDisplayMany,
    withHinglishDisplayFields,
} = require('../services/aiService');
const { notifyAssessmentComplete } = require('../services/wahaService');
const { markAssessmentAttemptProgress } = require('../services/courseProgressService');
const { synthesizeSpeech } = require('../services/ttsService');
const { transcribeAudioBuffer, isWeakHindiTranscript } = require('../services/transcriptService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

const ensureRolePlayUnlocked = async (lessonId, traineeId) => {
    if (!lessonId) return;

    const progress = await RolePlayProgress.findOne({
        trainee_id: traineeId,
        lesson_id: lessonId,
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

// POST /api/voice-test/speech
// Server-side TTS keeps Hindi playback independent of browser-installed voices.
router.post('/speech', authenticate, async (req, res, next) => {
    try {
        const { text, language } = req.body;
        if (!text || !String(text).trim()) {
            return res.status(400).json({ success: false, message: 'Speech text is required' });
        }

        const audio = await synthesizeSpeech(String(text).trim(), language);
        const audioMime = audio.mimeType
            || ((process.env.TTS_PROVIDER || 'edge').toLowerCase() === 'piper' && language === 'hi'
                ? 'audio/wav'
                : 'audio/mpeg');
        res.set('Content-Type', audioMime);
        res.set('Cache-Control', 'no-store');
        if (audio.ttsProvider) res.set('X-TTS-Provider', audio.ttsProvider);
        return res.send(audio);
    } catch (err) { next(err); }
});

// POST /api/voice-test/transcribe
// Reliable mic capture path: browser MediaRecorder → AssemblyAI (Chrome STT is flaky for Hindi).
router.post('/transcribe', authenticate, upload.single('audio'), async (req, res, next) => {
    try {
        if (!req.file?.buffer?.length) {
            return res.status(400).json({ success: false, message: 'Audio file required' });
        }

        const language = normalizeAssessmentLanguage(req.body.language);
        let transcript = '';
        try {
            transcript = (await transcribeAudioBuffer(
                req.file.buffer,
                req.file.mimetype || 'audio/webm',
                { language }
            ) || '').trim();
        } catch (err) {
            console.error('[voice-test:transcribe_failed]', {
                message: err.message,
                language,
                bytes: req.file.buffer.length,
                mime: req.file.mimetype,
            });
            return res.status(422).json({
                success: false,
                message: 'Could not transcribe audio. Please try again.',
            });
        }

        let repaired = false;
        let confidence = 'high';

        // Hindi/Hinglish: repair short English hallucinations from STT.
        if (language === 'hi' && transcript) {
            const needsRepair = isWeakHindiTranscript(transcript);
            if (needsRepair) {
                const repair = await repairHindiVoiceTranscript(transcript);
                console.log('[voice-test:hindi_stt_repair]', {
                    original: transcript.slice(0, 120),
                    repaired: (repair.transcript || '').slice(0, 120),
                    confidence: repair.confidence,
                    changed: repair.repaired,
                });
                transcript = (repair.transcript || '').trim();
                repaired = repair.repaired;
                confidence = repair.confidence;
            }
        }

        if (!transcript || (language === 'hi' && isWeakHindiTranscript(transcript) && confidence === 'low')) {
            return res.status(422).json({
                success: false,
                message: language === 'hi'
                    ? 'Speech was unclear. Please speak again clearly in Hindi/Hinglish, then press Done.'
                    : 'No speech detected. Speak a bit longer, then press Done.',
            });
        }

        // Display-only Roman Hinglish. Canonical transcript stays unchanged for scoring.
        const display_transcript = language === 'hi'
            ? await toRomanHinglishDisplay(transcript)
            : transcript;

        return res.json({
            success: true,
            transcript,
            display_transcript,
            language,
            repaired,
            confidence,
        });
    } catch (err) { next(err); }
});

// GET /api/voice-test/start/:courseId
// Optional query param: ?lesson_id=xxx
// If lesson_id is provided and that lesson has a voice test, use its questions.
// Otherwise fall back to the course-level active test (original behaviour).
router.get('/start/:courseId', authenticate, async (req, res, next) => {
    try {
        const { lesson_id } = req.query;
        const language = normalizeAssessmentLanguage(req.query.language);

        const course = await Course.findById(req.params.courseId);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        let test = null;
        let lesson = null;

        // ── Lesson-specific voice test ──────────────────────────────────────────
        if (lesson_id) {
            lesson = await Lesson.findById(lesson_id).populate('test_id');
            await ensureRolePlayUnlocked(lesson?._id, req.user._id);
            if (lesson?.test_id && lesson.test_id.test_type === 'voice' && lesson.test_id.is_active) {
                test = lesson.test_id;
            }
        }

        // ── Fallback: course-level active test ──────────────────────────────────
        if (!test) {
            test = await Test.findOne({ course_id: req.params.courseId, is_active: true, lesson_id: null });
        }

        if (!test) {
            return res.status(404).json({ success: false, message: 'No active voice test found' });
        }

        if (!test.questions?.length) {
            return res.status(400).json({ success: false, message: 'Test has no questions' });
        }

        const firstQuestion = test.questions[0];
        const adaptiveDifficulty = await determineAdaptiveDifficulty(req.user._id, req.params.courseId);
        const brandSource = `${course.title}\n${lesson_id ? lesson?.title || '' : ''}\n${lesson_id ? lesson?.transcript || '' : ''}\n${course.transcript || ''}`;
        const safeQuestions = normalizeBrandTerms(test.questions, brandSource);
        const localizedQuestions = await translateVoiceQuestions(safeQuestions, language);
        const safeFirstQuestion = localizedQuestions[0] || firstQuestion;

        // Display-only Roman Hinglish for UI. Canonical question text stays for TTS/scoring.
        let questionDisplays = localizedQuestions.map((q) => q.question || '');
        if (language === 'hi') {
            questionDisplays = await toRomanHinglishDisplayMany(questionDisplays);
        }

        const fallback_questions = localizedQuestions.map((q, index) => ({
            question: q.question,
            question_display: questionDisplays[index] || q.question,
            expected_answer: q.correct_answer || '',
            key_points: q.key_points || [],
            is_objection: q.is_objection || false,
        }));

        res.json({
            success: true,
            first_question: safeFirstQuestion.question,
            first_question_display: questionDisplays[0] || safeFirstQuestion.question,
            first_question_obj: {
                question: safeFirstQuestion.question,
                question_display: questionDisplays[0] || safeFirstQuestion.question,
                expected_answer: safeFirstQuestion.correct_answer || '',
                key_points: safeFirstQuestion.key_points || [],
                is_objection: safeFirstQuestion.is_objection || false,
            },
            test_id: test._id,
            course_title: course.title,
            language,
            adaptive_difficulty: adaptiveDifficulty,
            fallback_questions,
        });
    } catch (err) { next(err); }
});

// POST /api/voice-test/next-question  (unchanged)
router.post('/next-question', authenticate, async (req, res, next) => {
    try {
        const { course_id, conversation, question_number, total_questions, test_id } = req.body;
        const language = normalizeAssessmentLanguage(req.body.language);

        const course = await Course.findById(course_id).select('title transcript');
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const test = await Test.findById(test_id);
        const fallbackQuestions = normalizeBrandTerms(test?.questions || [], `${course.title}\n${course.transcript || ''}`).map(q => ({
            question: q.question,
            expected_answer: q.correct_answer || '',
            key_points: q.key_points || [],
            is_objection: q.is_objection || false,
        }));

        const { question } = await generateNextQuestion({
            courseTitle: course.title,
            transcript: course.transcript || '',
            conversation,
            fallbackQuestions,
            questionNumber: question_number,
            totalQuestions: total_questions,
            language,
        });

        const questionText = typeof question === 'string' ? question : (question?.question || '');
        const question_display = language === 'hi'
            ? await toRomanHinglishDisplay(questionText)
            : questionText;

        res.json({
            success: true,
            question: typeof question === 'string'
                ? question
                : { ...question, question_display },
            question_display,
        });
    } catch (err) { next(err); }
});

// POST /api/voice-test/evaluate-answer  (unchanged)
router.post('/evaluate-answer', authenticate, async (req, res, next) => {
    try {
        const { course_id, question, user_answer } = req.body;
        const language = normalizeAssessmentLanguage(req.body.language);

        if (!question || !user_answer) {
            return res.status(400).json({ success: false, message: 'question and user_answer required' });
        }

        const course = await Course.findById(course_id).select('transcript title');

        const evaluation = await evaluateAnswer({
            question: normalizeBrandTerms({
                question: question.question || question,
                expected_answer: question.expected_answer || question.correct_answer || '',
                key_points: question.key_points || [],
                is_objection: question.is_objection || false,
            }, `${course?.title || ''}\n${course?.transcript || ''}`),
            userAnswer: user_answer,
            courseTranscript: course?.transcript || '',
            category: course?.title || '',
            language,
        });

        const display_answer = language === 'hi'
            ? await toRomanHinglishDisplay(user_answer)
            : user_answer;

        res.json({
            success: true,
            evaluation: await withHinglishDisplayFields(evaluation, language),
            display_answer,
        });
    } catch (err) { next(err); }
});

// POST /api/voice-test/score  (unchanged)
router.post('/score', authenticate, async (req, res, next) => {
    try {
        const { course_id, conversation, test_id, lesson_id } = req.body;
        const language = normalizeAssessmentLanguage(req.body.language);

        const course = await Course.findById(course_id)
            .select('title transcript passing_score created_by')
            .populate('created_by', 'name phone');

        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const enrollment = await Enrollment.findOne({ trainee_id: req.user._id, course_id });
        const test = await Test.findById(test_id)
            .select('title passing_score max_attempts test_type questions module_id lesson_id')
            .populate('module_id', 'title order')
            .populate('lesson_id', 'title');
        await ensureRolePlayUnlocked(lesson_id || test?.lesson_id, req.user._id);

        // Score with canonical conversation fields only.
        const scoringConversation = (conversation || []).map((turn) => ({
            question: turn.question,
            answer: turn.answer,
            evaluation: turn.evaluation
                ? {
                    ...turn.evaluation,
                    // Strip display-only fields before scoring prompts
                    feedback_display: undefined,
                    what_correct_display: undefined,
                    what_missed_display: undefined,
                    spoken_feedback_display: undefined,
                }
                : turn.evaluation,
        }));

        const result = await scoreConversation({
            courseTitle: course.title,
            transcript: course.transcript || '',
            conversation: scoringConversation,
            language,
        });

        const passingScore = course.passing_score || test?.passing_score || 60;

        const attempt = await Attempt.create({
            trainee_id: req.user._id,
            course_id,
            test_id: test_id || null,
            enrollment_id: enrollment?._id || null,
            test_type: 'voice',
            assessment_language: language,
            questions_snapshot: scoringConversation.map((turn, index) => ({
                question: turn.question || `Question ${index + 1}`,
                user_answer: turn.answer || '',
                answer_score: turn.evaluation?.overall_score ?? null,
                feedback: turn.evaluation?.feedback || turn.evaluation?.spoken_feedback || null,
                feedback_tier: turn.evaluation?.feedback_tier || null,
            })),
            voice_transcript: scoringConversation.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n'),
            ai_feedback: result.feedback,
            ai_rubric_breakdown: result.rubric_breakdown,
            score: result.score,
            passing_score: passingScore,
            status: 'scored',
            submitted_at: new Date(),
        });

        await markAssessmentAttemptProgress({
            attempt,
            test,
            traineeId: req.user._id,
            courseId: course_id,
        });

        if (enrollment && (enrollment.best_score === null || result.score > enrollment.best_score)) {
            enrollment.best_score = result.score;
            await enrollment.save();
        }

        try {
            const trainee = await User.findById(req.user._id).select('name email phone');
            await notifyAssessmentComplete({ attempt, trainee, trainer: course.created_by, course, test });
        } catch (notifyErr) {
            console.warn('WhatsApp notification failed (non-fatal):', notifyErr.message);
        }

        const displayResult = { ...result };
        if (language === 'hi' && result?.feedback) {
            displayResult.feedback_display = await toRomanHinglishDisplay(result.feedback);
        }

        res.json({ success: true, result: displayResult });
    } catch (err) { next(err); }
});

module.exports = router;
