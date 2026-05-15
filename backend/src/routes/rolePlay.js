// backend/src/routes/rolePlay.js
// ROLE CLARITY:
//   CHARACTER = a CUSTOMER who has questions, concerns, and objections
//   TRAINEE   = the consultant/salesperson who must answer using lesson knowledge
// All scenario content is derived from the lesson transcript.

const router = require('express').Router()
const multer = require('multer')
const axios = require('axios')
const Lesson = require('../models/Lesson')
const RolePlayProgress = require('../models/RolePlayProgress')
const { authenticate, authorize } = require('../middleware/auth')
const { transcribeAudioBuffer } = require('../services/transcriptService')
const { notifyRolePlayLocked } = require('../services/wahaService')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
const LLM = process.env.LLM_MODEL || 'openai/gpt-4o-mini'
const PASSING_SCORE = 70
const MAX_ATTEMPTS = 10
const MAX_SESSION_QUESTIONS = 5

const callLLM = (messages, max_tokens = 600) =>
    axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        { model: LLM, max_tokens, messages },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` } }
    )

const parseJSON = (raw) => {
    try { return JSON.parse(raw) } catch (_) { }
    try { return JSON.parse(raw.replace(/```json|```/g, '').trim()) } catch (_) { }
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}')
    if (s !== -1 && e > s) return JSON.parse(raw.slice(s, e + 1))
    throw new Error('Could not parse JSON from LLM response')
}

const hasAnyRole = (user, roles) =>
    roles.includes(user?.role) || user?.roles?.some(r => roles.includes(r))

const formatProgress = (progress) => {
    const attemptsUsed = progress?.attempts_used || 0
    const unlocked = !!(progress?.passed || progress?.unlocked_by_trainer)
    const exhausted = !unlocked && attemptsUsed >= MAX_ATTEMPTS
    const currentWindow = attemptsUsed < 5 ? 1 : 2
    const windowLimit = attemptsUsed < 5 ? 5 : MAX_ATTEMPTS

    return {
        _id: progress?._id,
        trainee_id: progress?.trainee_id,
        lesson_id: progress?.lesson_id,
        course_id: progress?.course_id,
        threshold: PASSING_SCORE,
        max_attempts: MAX_ATTEMPTS,
        attempts_used: attemptsUsed,
        attempts_remaining: unlocked ? 0 : Math.max(0, MAX_ATTEMPTS - attemptsUsed),
        current_window: currentWindow,
        window_attempts_remaining: unlocked ? 0 : Math.max(0, windowLimit - attemptsUsed),
        best_score: progress?.best_score || 0,
        last_score: progress?.last_score ?? null,
        last_scenario_type: progress?.last_scenario_type || null,
        last_question_count: progress?.last_question_count || 0,
        passed: !!progress?.passed,
        unlocked_by_trainer: !!progress?.unlocked_by_trainer,
        unlocked,
        exhausted,
        unlocked_at: progress?.unlocked_at || null,
        last_attempt_at: progress?.last_attempt_at || null,
    }
}

const isProgressExhausted = (progress) =>
    !!progress && !progress.passed && !progress.unlocked_by_trainer && (progress.attempts_used || 0) >= MAX_ATTEMPTS

const formatCourseLock = (progresses) => {
    const locked = progresses.find(isProgressExhausted)
    return {
        locked: !!locked,
        locked_progress: locked ? formatProgress(locked) : null,
        progresses: progresses.map(formatProgress),
    }
}

// GET /api/role-play/progress/:lessonId
router.get('/progress/:lessonId', authenticate, async (req, res, next) => {
    try {
        const lesson = await Lesson.findById(req.params.lessonId).select('course_id')
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' })

        let traineeId = req.user._id
        if (req.query.trainee_id) {
            if (!hasAnyRole(req.user, ['trainer', 'admin'])) {
                return res.status(403).json({ success: false, message: 'Access denied' })
            }
            traineeId = req.query.trainee_id
        }

        const progress = await RolePlayProgress.findOne({
            trainee_id: traineeId,
            lesson_id: lesson._id,
        })

        res.json({
            success: true,
            progress: formatProgress(progress || {
                trainee_id: traineeId,
                lesson_id: lesson._id,
                course_id: lesson.course_id,
            }),
        })
    } catch (err) { next(err) }
})

// POST /api/role-play/progress
router.post('/progress', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, score, scenario_type, question_count } = req.body
        const numericScore = Number(score)

        if (!lesson_id) return res.status(400).json({ success: false, message: 'lesson_id required' })
        if (!Number.isFinite(numericScore)) {
            return res.status(400).json({ success: false, message: 'Valid score required' })
        }

        const lesson = await Lesson.findById(lesson_id)
            .select('title course_id module_id')
            .populate('course_id', 'title created_by')
            .populate('module_id', 'title')
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' })

        let progress = await RolePlayProgress.findOne({
            trainee_id: req.user._id,
            lesson_id: lesson._id,
        })

        if (!progress) {
            progress = new RolePlayProgress({
                trainee_id: req.user._id,
                lesson_id: lesson._id,
                course_id: lesson.course_id?._id || lesson.course_id,
            })
        }

        const alreadyUnlocked = progress.passed || progress.unlocked_by_trainer
        const wasExhausted = !alreadyUnlocked && progress.attempts_used >= MAX_ATTEMPTS
        if (!alreadyUnlocked && progress.attempts_used >= MAX_ATTEMPTS) {
            return res.status(423).json({
                success: false,
                message: 'Role playing attempts exhausted. Contact trainer to unlock test.',
                progress: formatProgress(progress),
            })
        }

        if (!alreadyUnlocked) progress.attempts_used += 1
        progress.last_score = Math.max(0, Math.min(100, Math.round(numericScore)))
        progress.best_score = Math.max(progress.best_score || 0, progress.last_score)
        progress.last_attempt_at = new Date()
        progress.last_scenario_type = scenario_type || progress.last_scenario_type
        progress.last_question_count = Math.min(MAX_SESSION_QUESTIONS, Math.max(0, Number(question_count) || 0))

        if (progress.last_score >= PASSING_SCORE) {
            progress.passed = true
            progress.unlocked_at = progress.unlocked_at || new Date()
        }

        await progress.save()

        const isNowExhausted =
            !wasExhausted &&
            !progress.passed &&
            !progress.unlocked_by_trainer &&
            progress.attempts_used >= MAX_ATTEMPTS

        if (isNowExhausted) {
            try {
                await lesson.populate('course_id.created_by', 'name phone')
                await notifyRolePlayLocked({
                    progress,
                    trainee: req.user,
                    trainer: lesson.course_id?.created_by,
                    course: lesson.course_id,
                    module: lesson.module_id,
                    lesson,
                    threshold: PASSING_SCORE,
                })
            } catch (notifyErr) {
                console.warn('Roleplay lock notification failed:', notifyErr.message)
            }
        }

        res.json({ success: true, progress: formatProgress(progress) })
    } catch (err) { next(err) }
})

// PUT /api/role-play/progress/:lessonId/unlock
router.put('/progress/:lessonId/unlock', authenticate, authorize('trainer', 'admin'), async (req, res, next) => {
    try {
        const { trainee_id, note = '' } = req.body
        if (!trainee_id) return res.status(400).json({ success: false, message: 'trainee_id required' })

        const lesson = await Lesson.findById(req.params.lessonId).select('course_id')
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' })

        const progress = await RolePlayProgress.findOneAndUpdate(
            { trainee_id, lesson_id: lesson._id },
            {
                $set: {
                    course_id: lesson.course_id,
                    unlocked_by_trainer: true,
                    unlocked_at: new Date(),
                    trainer_unlocked_by: req.user._id,
                    trainer_unlock_note: note,
                },
                $setOnInsert: {
                    attempts_used: 0,
                    best_score: 0,
                    last_score: null,
                    passed: false,
                },
            },
            { new: true, upsert: true, runValidators: true }
        )

        res.json({ success: true, progress: formatProgress(progress) })
    } catch (err) { next(err) }
})

// GET /api/role-play/course/:courseId/progress
router.get('/course/:courseId/progress', authenticate, async (req, res, next) => {
    try {
        let traineeId = req.user._id
        if (req.query.trainee_id) {
            if (!hasAnyRole(req.user, ['trainer', 'admin'])) {
                return res.status(403).json({ success: false, message: 'Access denied' })
            }
            traineeId = req.query.trainee_id
        }

        const progresses = await RolePlayProgress.find({
            trainee_id: traineeId,
            course_id: req.params.courseId,
        }).populate('lesson_id', 'title')

        res.json({ success: true, ...formatCourseLock(progresses) })
    } catch (err) { next(err) }
})

// GET /api/role-play/locked/trainee/:traineeId
router.get('/locked/trainee/:traineeId', authenticate, authorize('trainer', 'admin'), async (req, res, next) => {
    try {
        const progresses = await RolePlayProgress.find({
            trainee_id: req.params.traineeId,
            passed: { $ne: true },
            unlocked_by_trainer: { $ne: true },
            attempts_used: { $gte: MAX_ATTEMPTS },
        })
            .populate('course_id', 'title')
            .populate('lesson_id', 'title')
            .sort({ updatedAt: -1 })

        res.json({
            success: true,
            locks: progresses.map(p => ({
                ...formatProgress(p),
                course_title: p.course_id?.title,
                lesson_title: p.lesson_id?.title,
            })),
        })
    } catch (err) { next(err) }
})

// PUT /api/role-play/course/:courseId/unlock
router.put('/course/:courseId/unlock', authenticate, authorize('trainer', 'admin'), async (req, res, next) => {
    try {
        const { trainee_id, note = '' } = req.body
        if (!trainee_id) return res.status(400).json({ success: false, message: 'trainee_id required' })

        await RolePlayProgress.updateMany(
            {
                trainee_id,
                course_id: req.params.courseId,
                passed: { $ne: true },
                unlocked_by_trainer: { $ne: true },
                attempts_used: { $gte: MAX_ATTEMPTS },
            },
            {
                $set: {
                    unlocked_by_trainer: true,
                    unlocked_at: new Date(),
                    trainer_unlocked_by: req.user._id,
                    trainer_unlock_note: note,
                },
            }
        )

        const progresses = await RolePlayProgress.find({
            trainee_id,
            course_id: req.params.courseId,
        }).populate('lesson_id', 'title')

        res.json({ success: true, ...formatCourseLock(progresses) })
    } catch (err) { next(err) }
})

// Direction hint for what kind of customer situation to simulate.
// The CHARACTER is always a customer — the hint shapes what that customer wants/fears.
const SCENARIO_TYPE_HINTS = {
    objection: 'The customer has a specific objection, concern, or hesitation (price, trust, timing, competitor, etc.) that the trainee must address.',
    consultation: 'The customer has a problem or need they want help with — the trainee must ask the right questions and present the right solution.',
    demo: 'The customer wants to understand what the product/service does and why it is right for them — the trainee must explain and demonstrate value.',
    closing: 'The customer is interested but hesitating before committing — the trainee must identify the last concern and guide them to a decision.',
}

// ── POST /api/role-play/scenario ──────────────────────────────────────────────
router.post('/scenario', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, scenario_type = 'objection' } = req.body
        if (!lesson_id) return res.status(400).json({ success: false, message: 'lesson_id required' })

        const lesson = await Lesson.findById(lesson_id).select('title transcript')
        if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' })
        if (!lesson.transcript) {
            return res.status(400).json({ success: false, message: 'Lesson has no transcript — add one to enable Role Playing.' })
        }

        if (hasAnyRole(req.user, ['trainee'])) {
            const progress = await RolePlayProgress.findOne({ trainee_id: req.user._id, lesson_id })
            if (progress && !progress.passed && !progress.unlocked_by_trainer && progress.attempts_used >= MAX_ATTEMPTS) {
                return res.status(423).json({
                    success: false,
                    message: 'Contact trainer to unlock test as failed 10 times.',
                    progress: formatProgress(progress),
                })
            }
        }

        const directionHint = SCENARIO_TYPE_HINTS[scenario_type] || SCENARIO_TYPE_HINTS.objection

        const prompt = `You are designing a sales role-play practice scenario for a trainee.

━━ ROLE CLARITY (critical) ━━
The CHARACTER you create is a CUSTOMER or CLIENT.
The TRAINEE is the consultant / salesperson / expert who must answer the customer.
The customer opens the conversation with a question or concern.
The trainee must respond using knowledge from the lesson.
Do NOT make the character a consultant, trainer, or salesperson.

━━ LESSON CONTENT ━━
LESSON TITLE: "${lesson.title}"
LESSON TRANSCRIPT:
"""
${lesson.transcript.slice(0, 5000)}
"""

━━ TASK ━━
1. Read the transcript and identify:
   - The main skill or product/service knowledge this lesson teaches
   - The typical questions, doubts, or objections a CUSTOMER would raise about this topic
   - Specific language, facts, or techniques the lesson gives the trainee to handle those questions

2. Create a customer character whose opening question or concern requires the trainee to use exactly what the lesson teaches.
   Direction: ${directionHint}

RULES:
- The character must be a CUSTOMER — never a consultant or salesperson
- The opening_line must be a customer question, concern, or objection — NOT a sales pitch
- The situation must describe what the customer is experiencing (their problem, doubt, or need)
- The goal must describe what the trainee (consultant) needs to achieve
- All content must map directly to the lesson transcript — no generic scenarios

Return ONLY valid JSON, no markdown:
{
  "scenario_type": "${scenario_type}",
  "lesson_skill": "One sentence: the main skill or knowledge this lesson teaches the trainee",
  "lesson_key_points": ["key fact/technique 1 from transcript", "key fact/technique 2", "key fact/technique 3"],
  "character_name": "A realistic customer first name",
  "character_role": "Realistic description of who this customer is (e.g. 'a first-time client considering hair treatment')",
  "opening_line": "The CUSTOMER's opening question or concern. Must be something a real customer would ask that tests the lesson's content. 1-2 natural sentences.",
  "situation": "One sentence: what this customer is experiencing or worried about — from the customer's perspective.",
  "goal": "What the trainee (consultant) must accomplish in this conversation, using the lesson's teachings."
}`

        const res2 = await callLLM([{ role: 'user', content: prompt }], 600)
        const scenario = parseJSON(res2.data.choices[0].message.content)
        res.json({ success: true, scenario })
    } catch (err) { next(err) }
})

// ── Shared turn logic ─────────────────────────────────────────────────────────
const processTurn = async ({ lessonTranscript, lessonTitle, scenario, conversation, userMessage }) => {
    const history = conversation
        .map(m => `${m.role === 'user' ? 'Trainee (Consultant)' : `${scenario.character_name} (Customer)`}: ${m.content}`)
        .join('\n')

    const lessonSkill = scenario.lesson_skill || ''
    const keyPoints = (scenario.lesson_key_points || []).join('; ')

    const prompt = `You are running a sales training role-play.

━━ ROLES ━━
YOU are: ${scenario.character_name} — a CUSTOMER (${scenario.character_role})
The person you are talking to is: the TRAINEE, playing the role of a consultant/salesperson

━━ LESSON CONTEXT (what the trainee has studied) ━━
LESSON: "${lessonTitle}"
LESSON TEACHES: ${lessonSkill}
KEY POINTS: ${keyPoints}
LESSON TRANSCRIPT:
"""
${lessonTranscript.slice(0, 2000)}
"""

━━ SCENARIO ━━
Your situation as the customer: ${scenario.situation}
The trainee's goal: ${scenario.goal}

━━ CONVERSATION SO FAR ━━
${history}

━━ TRAINEE (CONSULTANT) JUST SAID ━━
"${userMessage}"

━━ YOUR JOB AS THE CUSTOMER ━━
React as a real customer would. You can:
- Ask a follow-up question if their answer was vague or incomplete
- Push back if you are not convinced
- Express satisfaction and move the conversation forward if they answered well
- Raise a new related concern if the current one is resolved
Stay curious, realistic, and human. Do NOT become easy just because they answered — keep gently probing.
Do NOT roleplay as a consultant or give the trainee advice in character.

━━ COACHING (evaluate the trainee's consultant response) ━━
Score STRICTLY against what the lesson teaches. The trainee is the consultant — evaluate whether they answered like one.

SCORING:
1. "idk", blank, single word, completely off-topic → 1-2 MAX, no exceptions
2. Evasive or generic answer that ignores the lesson's content → 2-3
3. Tried to answer but missed the lesson's specific technique/knowledge → 3-5
4. Partially correct — used some lesson content but incomplete → 5-6
5. Good — clearly applied the lesson's teaching to answer the customer → 6-8
6. Excellent — answered with confidence, specifics, and full command of lesson content → 8-10

Override all stricter scoring above with this client-centered scoring:
- Score from the client's perspective first. Do not require a perfect script match.
- Reward answers that reduce confusion, reassure the customer, explain the service simply, and guide the customer toward a useful next step.
- Blank, single-word, or completely off-topic -> 2-3.
- Somewhat relevant but unclear or not helpful for the client -> 4-5.
- Partially helpful: explains something useful but misses part of the customer's concern -> 6-7.
- Client-centered and mostly helpful: addresses the concern, reassures, and gives a reasonable next step -> 8.
- Excellent: clear, specific, empathetic, accurate, and moves the client forward -> 9-10.
- If the trainee answers the customer's main concern in a way a real client could understand, do not score below 7 just because one expected detail is missing.
- If the trainee gives a reasonable consultation or booking next step, treat that as a strong positive.

The coaching tip MUST reference the lesson specifically:
- If they answered well: name exactly what technique from the lesson they used correctly
- If they missed it: tell them exactly what the lesson says they should have said or done
- Include spoken_feedback as one short friendly sentence the trainee can hear aloud before the customer continues.

Return ONLY valid JSON:
{
  "character_reply": "Your response as the CUSTOMER. 1-3 natural sentences. Ask a follow-up, push back, or acknowledge if satisfied.",
  "coaching": {
    "score": 5,
    "what_worked": "What the trainee did right as a consultant, referencing the lesson — or null if nothing worked",
    "tip": "What the lesson specifically teaches that the trainee should do differently or better",
    "spoken_feedback": "Short spoken coaching feedback for the trainee.",
    "tier": "constructive"
  }
}

tier: "positive" (8-10), "constructive" (5-7), "corrective" (1-4).`

    const res = await callLLM([{ role: 'user', content: prompt }], 600)
    return parseJSON(res.data.choices[0].message.content)
}

// ── POST /api/role-play/turn (text input) ─────────────────────────────────────
router.post('/turn', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, scenario, conversation = [], user_message } = req.body
        if (!scenario || !user_message) {
            return res.status(400).json({ success: false, message: 'scenario and user_message required' })
        }

        const lesson = await Lesson.findById(lesson_id).select('title transcript')
        const result = await processTurn({
            lessonTranscript: lesson?.transcript || '',
            lessonTitle: lesson?.title || '',
            scenario,
            conversation,
            userMessage: user_message,
        })

        res.json({ success: true, character_reply: result.character_reply, coaching: result.coaching })
    } catch (err) { next(err) }
})

// ── POST /api/role-play/turn-audio (voice input) ──────────────────────────────
router.post('/turn-audio', authenticate, upload.single('audio'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'Audio file required' })

        const { lesson_id, scenario: rawScenario, conversation: rawConversation } = req.body
        const scenario = typeof rawScenario === 'string' ? JSON.parse(rawScenario) : rawScenario
        const conversation = typeof rawConversation === 'string' ? JSON.parse(rawConversation) : (rawConversation || [])

        if (!scenario) return res.status(400).json({ success: false, message: 'scenario required' })

        // Transcribe via AssemblyAI pipeline
        let transcription = ''
        try {
            transcription = (await transcribeAudioBuffer(req.file.buffer, req.file.mimetype || 'audio/webm') || '').trim()
        } catch (err) {
            console.error('[RolePlay audio] Transcription failed:', err.message)
            return res.status(422).json({
                success: false,
                message: 'Could not transcribe audio — try again or switch to text input.',
            })
        }

        if (!transcription) {
            return res.status(422).json({
                success: false,
                message: 'No speech detected. Speak more clearly or switch to text input.',
            })
        }

        const lesson = await Lesson.findById(lesson_id).select('title transcript')
        const result = await processTurn({
            lessonTranscript: lesson?.transcript || '',
            lessonTitle: lesson?.title || '',
            scenario,
            conversation,
            userMessage: transcription,
        })

        res.json({
            success: true,
            character_reply: result.character_reply,
            coaching: result.coaching,
            transcription,
        })
    } catch (err) { next(err) }
})

// ── POST /api/role-play/summary ───────────────────────────────────────────────
router.post('/summary', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, scenario, conversation = [] } = req.body
        if (!conversation.length) return res.status(400).json({ success: false, message: 'No conversation to summarize' })

        const lesson = await Lesson.findById(lesson_id).select('title transcript')
        const convoText = conversation
            .map(m => `${m.role === 'user' ? 'Trainee (Consultant)' : `${scenario?.character_name || 'Customer'}`}: ${m.content}`)
            .join('\n')

        const lessonSkill = scenario?.lesson_skill || ''
        const keyPoints = (scenario?.lesson_key_points || []).join('; ')

        const prompt = `You evaluated a sales training role-play session.

━━ CONTEXT ━━
LESSON: "${lesson?.title || 'Sales Training'}"
LESSON TEACHES: ${lessonSkill}
KEY POINTS: ${keyPoints}
LESSON TRANSCRIPT:
"""
${(lesson?.transcript || '').slice(0, 3000)}
"""

The TRAINEE played the consultant/salesperson.
The CHARACTER played the customer.
Scenario: ${scenario?.situation || ''}
Trainee goal: ${scenario?.goal || ''}

━━ CONVERSATION ━━
${convoText}

━━ EVALUATION ━━
Evaluate the TRAINEE as a consultant — did they answer the customer's questions correctly and confidently using what the lesson teaches?

Ask yourself:
- Did the trainee demonstrate the knowledge and techniques this lesson covers?
- Did they handle the customer's questions/objections the way the lesson recommends?
- Where did they fall short of what the lesson specifically teaches?

SCORING:
- Mostly evasive or ignored lesson content → 20-40
- Some effort but missed key lesson techniques → 40-55
- Average — applied some lesson knowledge but inconsistently → 55-65
- Good — clearly demonstrated the lesson's teachings → 65-80
- Excellent — answered like a trained consultant with full command of lesson content → 80+

Override all stricter final scoring above with this client-centered scale:
- Score from whether the client would feel understood, informed, and guided toward a next step.
- Mostly evasive or not useful to the client -> 35-50
- Some effort, but the client would still be confused -> 50-60
- Partially useful and mostly relevant -> 60-70
- Helpful, client-centered, and reasonably accurate -> 70-85
- Very clear, empathetic, specific, and confidence-building -> 85+
- Do not require every expected detail for a passing score. A useful answer that handles the client's main concern should usually be 70+.

Return ONLY valid JSON:
{
  "overall_score": 58,
  "grade": "C+",
  "summary": "2-3 honest sentences evaluating the trainee as a consultant, referencing the lesson content.",
  "strengths": ["specific moment where trainee correctly applied lesson knowledge — empty array if none"],
  "improvements": [
    {
      "area": "Specific technique or knowledge point from the lesson",
      "tip": "Exactly what the lesson says to do — quote or closely paraphrase the lesson content"
    }
  ],
  "best_moment": "The single best response the trainee gave as a consultant, or null if none stood out.",
  "recommended_focus": "The specific lesson skill the trainee should focus on in the next practice session."
}`

        const res2 = await callLLM([{ role: 'user', content: prompt }], 700)
        const summary = parseJSON(res2.data.choices[0].message.content)
        res.json({ success: true, summary })
    } catch (err) { next(err) }
})

module.exports = router
