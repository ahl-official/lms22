const router = require('express').Router();
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
} = require('../services/aiService');
const { notifyAssessmentComplete } = require('../services/wahaService');

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

// GET /api/voice-test/start/:courseId
// Optional query param: ?lesson_id=xxx
// If lesson_id is provided and that lesson has a voice test, use its questions.
// Otherwise fall back to the course-level active test (original behaviour).
router.get('/start/:courseId', authenticate, async (req, res, next) => {
    try {
        const { lesson_id } = req.query;

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
        const safeFirstQuestion = safeQuestions[0] || firstQuestion;

        res.json({
            success: true,
            first_question: safeFirstQuestion.question,
            first_question_obj: {
                question: safeFirstQuestion.question,
                expected_answer: safeFirstQuestion.correct_answer || '',
                key_points: safeFirstQuestion.key_points || [],
                is_objection: safeFirstQuestion.is_objection || false,
            },
            test_id: test._id,
            course_title: course.title,
            adaptive_difficulty: adaptiveDifficulty,
            fallback_questions: safeQuestions.map(q => ({
                question: q.question,
                expected_answer: q.correct_answer || '',
                key_points: q.key_points || [],
                is_objection: q.is_objection || false,
            })),
        });
    } catch (err) { next(err); }
});

// POST /api/voice-test/next-question  (unchanged)
router.post('/next-question', authenticate, async (req, res, next) => {
    try {
        const { course_id, conversation, question_number, total_questions, test_id } = req.body;

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
        });

        res.json({ success: true, question });
    } catch (err) { next(err); }
});

// POST /api/voice-test/evaluate-answer  (unchanged)
router.post('/evaluate-answer', authenticate, async (req, res, next) => {
    try {
        const { course_id, question, user_answer } = req.body;

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
        });

        res.json({ success: true, evaluation });
    } catch (err) { next(err); }
});

// POST /api/voice-test/score  (unchanged)
router.post('/score', authenticate, async (req, res, next) => {
    try {
        const { course_id, conversation, test_id, lesson_id } = req.body;

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

        const result = await scoreConversation({
            courseTitle: course.title,
            transcript: course.transcript || '',
            conversation,
        });

        const passingScore = course.passing_score || test?.passing_score || 60;

        const attempt = await Attempt.create({
            trainee_id: req.user._id,
            course_id,
            test_id: test_id || null,
            enrollment_id: enrollment?._id || null,
            test_type: 'voice',
            questions_snapshot: conversation.map((turn, index) => ({
                question: turn.question || `Question ${index + 1}`,
                user_answer: turn.answer || '',
                answer_score: turn.evaluation?.overall_score ?? null,
                feedback: turn.evaluation?.feedback || turn.evaluation?.spoken_feedback || null,
                feedback_tier: turn.evaluation?.feedback_tier || null,
            })),
            voice_transcript: conversation.map(t => `Q: ${t.question}\nA: ${t.answer}`).join('\n\n'),
            ai_feedback: result.feedback,
            ai_rubric_breakdown: result.rubric_breakdown,
            score: result.score,
            passing_score: passingScore,
            status: 'scored',
            submitted_at: new Date(),
        });

        if (enrollment) {
            if (enrollment.best_score === null || result.score > enrollment.best_score)
                enrollment.best_score = result.score;
            if (result.score >= passingScore) {
                enrollment.status = 'completed';
                enrollment.progress = 100;
                enrollment.completed_at = new Date();
            } else {
                enrollment.status = 'in_progress';
            }
            await enrollment.save();
        }

        try {
            const trainee = await User.findById(req.user._id).select('name email phone');
            await notifyAssessmentComplete({ attempt, trainee, trainer: course.created_by, course, test });
        } catch (notifyErr) {
            console.warn('WhatsApp notification failed (non-fatal):', notifyErr.message);
        }

        res.json({ success: true, result });
    } catch (err) { next(err); }
});

module.exports = router;
