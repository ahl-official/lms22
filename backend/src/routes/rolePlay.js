// backend/src/routes/rolePlay.js
// Role framing comes from the course category's roleplay_type (Step 2).
// CHARACTER = AI counterpart; TRAINEE = student in the job this course trains.
// Scenario content is still derived from the lesson transcript.

const router = require('express').Router()
const multer = require('multer')
const axios = require('axios')
const Lesson = require('../models/Lesson')
const RolePlayProgress = require('../models/RolePlayProgress')
const RolePlayAttempt = require('../models/RolePlayAttempt')
const { authenticate, authorize } = require('../middleware/auth')
const { transcribeAudioBuffer } = require('../services/transcriptService')
const { notifyRolePlayLocked } = require('../services/wahaService')
const {
    normalizeRolePlayType,
    getRolePlayFrame,
} = require('../constants/rolePlayTypes')

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

const clampNumber = (value, min, max) => {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return min
    return Math.max(min, Math.min(max, numeric))
}

const isBlankResponse = (value) => {
    const normalized = (value || '').toString().trim().toLowerCase()
    return !normalized || normalized === '(no response)' || normalized === 'no response' || normalized === 'n/a' || normalized === 'na'
}

const coachingTier = (score) => {
    if (score >= 8) return 'positive'
    if (score >= 5) return 'constructive'
    return 'corrective'
}

const hasAnyRole = (user, roles) =>
    roles.includes(user?.role) || user?.roles?.some(r => roles.includes(r))

const resolveRolePlayContext = async (lessonOrId) => {
    const lessonId = lessonOrId?._id || lessonOrId
    const lesson = await Lesson.findById(lessonId)
        .select('title transcript course_id roleplay_personas transcript_status')
        .populate({
            path: 'course_id',
            select: 'title category_id',
            populate: { path: 'category_id', select: 'name roleplay_type' },
        })

    if (!lesson) return null

    const course = lesson.course_id
    const category = course?.category_id
    const roleplayType = normalizeRolePlayType(category?.roleplay_type)
    const frame = getRolePlayFrame(roleplayType, {
        courseTitle: course?.title || '',
        categoryName: category?.name || '',
        lessonTitle: lesson.title || '',
    })

    return { lesson, course, category, roleplayType, frame }
}

const fallbackPersonas = (lessonTitle = 'this lesson', frame = null) => {
    const resolved = frame || getRolePlayFrame('sales', { lessonTitle })
    return resolved.fallback_personas(lessonTitle)
}

const generateLessonPersonas = async (lesson, frame) => {
    const f = frame || getRolePlayFrame('auto', { lessonTitle: lesson.title })
    const prompt = `Create roleplay counterpart personas from this lesson transcript.

ROLEPLAY MODE: ${f.mode_label} (${f.roleplay_type})
CONTEXT: ${f.context_line}
TRAINEE ROLE: ${f.trainee_role}
CHARACTER KIND: ${f.character_kind}

LESSON TITLE: "${lesson.title}"
TRANSCRIPT:
"""
${(lesson.transcript || '').slice(0, 5000)}
"""

Return ONLY valid JSON:
{
  "personas": [
    {
      "key": "short-kebab-case",
      "label": "Short persona label",
      "customer_name": "Realistic first name",
      "customer_role": "Who this counterpart is",
      "situation": "Counterpart situation based only on the transcript",
      "concern": "The main question, doubt, or need this counterpart has",
      "goal": "What the trainee must accomplish with this counterpart",
      "focus_areas": ["specific lesson point 1", "specific lesson point 2", "specific lesson point 3"]
    }
  ]
}

Rules:
- Generate 3 personas.
- Each persona is the CHARACTER (${f.character_kind}), not the trainee.
- The trainee is: ${f.trainee_role}.
${f.persona_rules}
- Base every persona on the transcript's skills, facts, techniques, and realistic workplace talk for this mode.
- Do not use generic preset categories like objection handling, demo, closing, or needs assessment.
- Make each persona feel different and realistic.
- Keep labels short and user-friendly.`

    try {
        const res = await callLLM([{ role: 'user', content: prompt }], 900)
        const parsed = parseJSON(res.data.choices[0].message.content)
        const personas = Array.isArray(parsed.personas) ? parsed.personas : []
        return personas.slice(0, 4).map((persona, index) => ({
            key: persona.key || `persona-${index + 1}`,
            label: persona.label || `${f.character_label} ${index + 1}`,
            customer_name: persona.customer_name || persona.character_name || `${f.character_label} ${index + 1}`,
            customer_role: persona.customer_role || persona.character_role || `a ${f.character_kind} from this lesson`,
            situation: persona.situation || 'They need help with the topic covered in this lesson.',
            concern: persona.concern || persona.opening_line || 'They have a question about the lesson topic.',
            goal: persona.goal || `Use the lesson content to help the ${f.character_label.toLowerCase()} move forward.`,
            focus_areas: Array.isArray(persona.focus_areas) ? persona.focus_areas.slice(0, 4) : [],
        })).filter(p => p.label && p.customer_role)
    } catch (err) {
        console.warn('Roleplay persona generation failed:', err.message)
        return fallbackPersonas(lesson.title, f)
    }
}

const ensureLessonPersonas = async (lesson, frame) => {
    const cachedType = lesson.roleplay_personas?.roleplay_type
    let personas = Array.isArray(lesson.roleplay_personas?.personas)
        ? lesson.roleplay_personas.personas
        : []

    if (personas.length && cachedType === frame.roleplay_type) {
        return personas
    }

    personas = await generateLessonPersonas(lesson, frame)
    lesson.roleplay_personas = {
        personas,
        roleplay_type: frame.roleplay_type,
        generated_at: new Date(),
    }
    await lesson.save()
    return personas
}

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

const formatAttempt = (attempt) => ({
    _id: attempt._id,
    trainee_id: attempt.trainee_id?._id || attempt.trainee_id,
    course_id: attempt.course_id?._id || attempt.course_id,
    course_title: attempt.course_id?.title,
    module_id: attempt.module_id?._id || attempt.module_id,
    module_title: attempt.module_id?.title,
    lesson_id: attempt.lesson_id?._id || attempt.lesson_id,
    lesson_title: attempt.lesson_id?.title,
    progress_id: attempt.progress_id,
    attempt_number: attempt.attempt_number || 1,
    scenario_type: attempt.scenario_type,
    scenario: attempt.scenario,
    conversation: attempt.conversation || [],
    summary: attempt.summary,
    score: attempt.score,
    grade: attempt.grade,
    passed: !!attempt.passed,
    question_count: attempt.question_count || 0,
    submitted_at: attempt.submitted_at,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
})

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
        const { lesson_id, score, scenario_type, question_count, scenario = null, conversation = [], summary = null } = req.body
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

        const safeConversation = Array.isArray(conversation)
            ? conversation.slice(0, 20).map(turn => ({
                role: turn.role === 'character' ? 'character' : 'user',
                content: String(turn.content || '').slice(0, 5000),
                source: turn.source || null,
                coaching: turn.coaching || null,
                created_at: turn.created_at || new Date(),
            }))
            : []
        const priorAttemptCount = await RolePlayAttempt.countDocuments({
            trainee_id: req.user._id,
            lesson_id: lesson._id,
        })
        const attempt = await RolePlayAttempt.create({
            trainee_id: req.user._id,
            lesson_id: lesson._id,
            module_id: lesson.module_id?._id || lesson.module_id || null,
            course_id: lesson.course_id?._id || lesson.course_id,
            progress_id: progress._id,
            attempt_number: priorAttemptCount + 1,
            scenario_type: scenario_type || null,
            scenario,
            conversation: safeConversation,
            summary,
            score: progress.last_score,
            grade: summary?.grade || null,
            passed: progress.last_score >= PASSING_SCORE,
            question_count: progress.last_question_count,
            submitted_at: progress.last_attempt_at,
        })

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

        res.json({ success: true, progress: formatProgress(progress), attempt: formatAttempt(attempt) })
    } catch (err) { next(err) }
})

const getHistory = async ({ traineeId, courseId, lessonId }) => {
    const filter = { trainee_id: traineeId }
    if (courseId) filter.course_id = courseId
    if (lessonId) filter.lesson_id = lessonId

    return RolePlayAttempt.find(filter)
        .populate('course_id', 'title')
        .populate('module_id', 'title order')
        .populate('lesson_id', 'title')
        .sort({ submitted_at: -1 })
        .limit(100)
}

// GET /api/role-play/history/me
router.get('/history/me', authenticate, async (req, res, next) => {
    try {
        const attempts = await getHistory({
            traineeId: req.user._id,
            courseId: req.query.course_id,
            lessonId: req.query.lesson_id,
        })
        res.json({ success: true, attempts: attempts.map(formatAttempt) })
    } catch (err) { next(err) }
})

// GET /api/role-play/history/trainee/:traineeId
router.get('/history/trainee/:traineeId', authenticate, authorize('trainer', 'admin'), async (req, res, next) => {
    try {
        const attempts = await getHistory({
            traineeId: req.params.traineeId,
            courseId: req.query.course_id,
            lessonId: req.query.lesson_id,
        })
        res.json({ success: true, attempts: attempts.map(formatAttempt) })
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

// GET /api/role-play/personas/:lessonId
router.get('/personas/:lessonId', authenticate, async (req, res, next) => {
    try {
        const ctx = await resolveRolePlayContext(req.params.lessonId)
        if (!ctx) return res.status(404).json({ success: false, message: 'Lesson not found' })

        const { lesson, frame, roleplayType } = ctx
        if (lesson.transcript_status !== 'ready' || !lesson.transcript) {
            return res.status(400).json({ success: false, message: 'Lesson transcript is required to generate personas.' })
        }

        const personas = await ensureLessonPersonas(lesson, frame)
        res.json({
            success: true,
            personas,
            roleplay_type: roleplayType,
            roleplay_mode: frame.mode_label,
        })
    } catch (err) { next(err) }
})

// Direction hint for what kind of counterpart situation to simulate.
const SCENARIO_TYPE_HINTS = {
    objection: 'The counterpart has a specific concern, hesitation, or pushback that the trainee must address.',
    consultation: 'The counterpart has a problem or need they want help with — the trainee must ask the right questions and present the right solution.',
    demo: 'The counterpart wants to understand what the product/service/process does and why it is right — the trainee must explain and demonstrate value.',
    closing: 'The counterpart is interested but hesitating before committing — the trainee must identify the last concern and guide them to a decision.',
}

// ── POST /api/role-play/scenario ──────────────────────────────────────────────
router.post('/scenario', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, scenario_type = 'objection', persona = null } = req.body
        if (!lesson_id) return res.status(400).json({ success: false, message: 'lesson_id required' })

        const ctx = await resolveRolePlayContext(lesson_id)
        if (!ctx) return res.status(404).json({ success: false, message: 'Lesson not found' })

        const { lesson, frame, roleplayType } = ctx
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

        let cachedPersonas = Array.isArray(lesson.roleplay_personas?.personas) ? lesson.roleplay_personas.personas : []
        if (!persona) {
            cachedPersonas = await ensureLessonPersonas(lesson, frame)
        }
        const selectedPersona = persona || cachedPersonas[0] || fallbackPersonas(lesson.title, frame)[0]

        const prompt = `You are designing a workplace role-play practice scenario for a trainee.

━━ ROLE CLARITY (critical) ━━
ROLEPLAY MODE: ${frame.mode_label} (${roleplayType})
CONTEXT: ${frame.context_line}
The CHARACTER you create is: ${frame.character_kind}
The TRAINEE is: ${frame.trainee_role}
The character opens the conversation with a question or concern.
The trainee must respond using knowledge from the lesson.
${frame.scenario_rules}

━━ LESSON CONTENT ━━
LESSON TITLE: "${lesson.title}"
LESSON TRANSCRIPT:
"""
${lesson.transcript.slice(0, 5000)}
"""

━━ TASK ━━
1. Read the transcript and identify:
   - The main skill or knowledge this lesson teaches for the trainee role
   - The typical questions, doubts, or requests the CHARACTER would raise about this topic
   - Specific language, facts, or techniques the lesson gives the trainee to handle those

2. Create a character whose opening question or concern requires the trainee to use exactly what the lesson teaches.
   Use this transcript-generated persona:
   ${JSON.stringify(selectedPersona, null, 2)}

RULES:
- The character must match the selected transcript-generated persona
- Character kind: ${frame.character_kind}
- Trainee role: ${frame.trainee_role}
- The opening_line must be something the character would naturally say — not the trainee pitching
- Keep the character cooperative and realistic; ask one main concern at a time
- Avoid aggressive wording unless the trainee has repeatedly failed
- The situation must describe what the character is experiencing
- The goal must describe what the trainee needs to achieve
- All content must map directly to the lesson transcript — no generic scenarios
${SCENARIO_TYPE_HINTS[scenario_type] ? `- Scenario direction hint: ${SCENARIO_TYPE_HINTS[scenario_type]}` : ''}

Return ONLY valid JSON, no markdown:
{
  "scenario_type": "transcript-persona",
  "persona_label": "Transcript Persona",
  "lesson_skill": "One sentence: the main skill or knowledge this lesson teaches the trainee",
  "lesson_key_points": ["key fact/technique 1 from transcript", "key fact/technique 2", "key fact/technique 3"],
  "character_name": "A realistic first name for the character",
  "character_role": "Realistic description of who this character is in this workplace context",
  "opening_line": "The CHARACTER's opening question or concern. Must test the lesson's content. 1-2 natural sentences.",
  "situation": "One sentence: what this character is experiencing — from their perspective.",
  "goal": "What the trainee must accomplish in this conversation, using the lesson's teachings."
}`

        const res2 = await callLLM([{ role: 'user', content: prompt }], 600)
        const scenario = parseJSON(res2.data.choices[0].message.content)
        scenario.scenario_type = selectedPersona.key || scenario.scenario_type || scenario_type
        scenario.persona_label = selectedPersona.label || scenario.persona_label || 'Transcript Persona'
        scenario.roleplay_type = roleplayType
        scenario.roleplay_mode = frame.mode_label
        scenario.trainee_role = frame.trainee_role
        scenario.character_kind = frame.character_kind
        res.json({ success: true, scenario })
    } catch (err) { next(err) }
})

// ── Shared turn logic ─────────────────────────────────────────────────────────
const processTurn = async ({ lessonTranscript, lessonTitle, scenario, conversation, userMessage, frame }) => {
    const f = frame || getRolePlayFrame(scenario?.roleplay_type || 'auto', { lessonTitle })
    const traineeLabel = f.trainee_label
    const characterLabel = f.character_label

    const history = conversation
        .map(m => `${m.role === 'user' ? `Trainee (${traineeLabel})` : `${scenario.character_name} (${characterLabel})`}: ${m.content}`)
        .join('\n')

    const lessonSkill = scenario.lesson_skill || ''
    const keyPoints = (scenario.lesson_key_points || []).join('; ')
    const isClientFacing = ['sales', 'technical_service', 'support'].includes(f.roleplay_type)

    const prompt = `You are running a workplace training role-play.

━━ ROLES ━━
ROLEPLAY MODE: ${f.mode_label} (${f.roleplay_type})
CONTEXT: ${f.context_line}
YOU are: ${scenario.character_name} — ${characterLabel} (${scenario.character_role})
The person you are talking to is: the TRAINEE, playing the role of ${f.trainee_role}
${f.turn_rules}

━━ LESSON CONTEXT (what the trainee has studied) ━━
LESSON: "${lessonTitle}"
LESSON TEACHES: ${lessonSkill}
KEY POINTS: ${keyPoints}
LESSON TRANSCRIPT:
"""
${lessonTranscript.slice(0, 2000)}
"""

━━ SCENARIO ━━
Your situation as the ${characterLabel.toLowerCase()}: ${scenario.situation}
The trainee's goal: ${scenario.goal}

━━ CONVERSATION SO FAR ━━
${history}

━━ TRAINEE (${traineeLabel.toUpperCase()}) JUST SAID ━━
"${userMessage}"

━━ YOUR JOB AS THE ${characterLabel.toUpperCase()} ━━
React as a real ${characterLabel.toLowerCase()} would. You can:
- Ask a follow-up question if their answer was vague or incomplete
- Ask for clarification if the answer is confusing or incomplete
- Express satisfaction and move the conversation forward if they answered well
- Move toward a realistic next step if the current concern is resolved
Stay realistic and curious, but be willing to accept a helpful answer and move forward.
TONE OVERRIDE:
- Be cooperative, not an examiner.
- Stay warm, curious, and slightly cautious.
- You are allowed to be reassured by a reasonable answer.
- If the trainee gives a helpful answer, acknowledge it positively and move forward.
- Do not repeat the same concern more than once.
- Do not keep escalating with new objections every turn.
- Ask at most ONE short follow-up question.
- Only push back firmly if the trainee was off-topic, dismissive, or clearly failed to answer the concern.
- If their answer is mostly helpful but incomplete, acknowledge help before asking for the missing detail.
Do NOT roleplay as the trainee or give the trainee advice in character.

━━ COACHING (evaluate the trainee's response) ━━
Score generously against what the lesson teaches. Grade from whether a real ${characterLabel.toLowerCase()} would feel helped.

SCORING:
1. "idk", blank, single word, completely off-topic → 1-2 MAX, no exceptions
2. Evasive or generic answer that ignores the lesson's content → 2-3
3. Tried to answer but missed the lesson's specific technique/knowledge → 3-5
4. Partially correct — used some lesson content but incomplete → 5-6
5. Good — clearly applied the lesson's teaching → 6-8
6. Excellent — answered with confidence, specifics, and full command of lesson content → 8-10

Override with this practical scale:
- Score from the counterpart's perspective first. Do not require a perfect script match.
- Reward answers that reduce confusion, apply the lesson, and guide a useful next step.
- Blank, single-word, or completely off-topic -> 2-3.
- Somewhat relevant but unclear or not helpful -> 4-5.
- Partially helpful: explains something useful but misses part of the concern -> 7.
- Mostly helpful: addresses the concern and gives a reasonable next step -> 8-9.
- Excellent: clear, specific, accurate, and moves the conversation forward -> 9-10.
- If the trainee answers the main concern in a way a real person could understand, do not score below 7 just because one expected detail is missing.
- If they forget one supporting detail, subtract only 1-2 points.
- Keep coaching fun, warm, and energizing. Give one clear next move, not a harsh critique.

The coaching tip MUST reference the lesson specifically:
- Always start feedback by naming one thing the trainee did well, even if the answer was imperfect.
- If they answered well: name exactly what technique from the lesson they used correctly
- If they missed it: tell them exactly what the lesson says they should have said or done
- Include spoken_feedback as one short upbeat sentence the trainee can hear aloud before the character continues.

Return ONLY valid JSON:
{
  "character_reply": "Your response as the ${characterLabel.toUpperCase()}. 1-3 natural sentences. Ask a follow-up, push back, or acknowledge if satisfied.",
  "coaching": {
    "score": 5,
    "what_worked": "What the trainee did right as ${f.trainee_role}, referencing the lesson — or null if nothing worked",
    "tip": "What the lesson specifically teaches that the trainee should do differently or better",
    "spoken_feedback": "Short spoken coaching feedback for the trainee.",
    "tier": "constructive"
  }
}

tier: "positive" (8-10), "constructive" (5-7), "corrective" (1-4).`

    if (isBlankResponse(userMessage)) {
        return {
            character_reply: "I didn't catch your answer. Could you please explain that once more?",
            coaching: {
                score: 0,
                what_worked: null,
                tip: 'No response was captured. Answer with at least one lesson-specific detail before moving on.',
                spoken_feedback: 'No response was captured, so this turn scores zero.',
                tier: 'corrective',
            },
        }
    }

    const res = await callLLM([{ role: 'user', content: prompt }], 600)
    const parsed = parseJSON(res.data.choices[0].message.content)
    parsed.coaching = parsed.coaching || {}
    const score = Number(parsed?.coaching?.score)
    const hasSubstance = userMessage.trim().split(/\s+/).length >= 8

    // Sales/service boost: reward practical next-step language that helps a client.
    if (isClientFacing) {
        const helpfulClientMoves = [
            /book|booking|appointment|schedule|consult/i,
            /online|video|clinic|center|centre|mumbai|bangalore|delhi|travel|city|location/i,
            /fee|cost|price|500|deduct|calculate|amount/i,
            /expert|guide|explain|help|do not worry|reassur/i,
        ].filter(rx => rx.test(userMessage)).length
        if (hasSubstance && helpfulClientMoves >= 2 && score < 8) {
            parsed.coaching.score = 8
            parsed.coaching.tier = 'positive'
            parsed.coaching.what_worked = parsed.coaching.what_worked || 'You helped the client move forward by explaining options and giving a practical next step.'
            parsed.coaching.spoken_feedback = 'Nice work, you gave the client useful options and moved them forward.'
        } else if (hasSubstance && score >= 5 && score < 7) {
            parsed.coaching.score = 7
            parsed.coaching.tier = 'constructive'
            parsed.coaching.what_worked = parsed.coaching.what_worked || 'You gave the client something useful to work with.'
            parsed.coaching.spoken_feedback = parsed.coaching.spoken_feedback || 'Nice start. You helped the client; add one more detail next time.'
        }
    } else if (hasSubstance && score >= 5 && score < 7) {
        parsed.coaching.score = 7
        parsed.coaching.tier = 'constructive'
        parsed.coaching.what_worked = parsed.coaching.what_worked || 'You applied something useful from the lesson.'
        parsed.coaching.spoken_feedback = parsed.coaching.spoken_feedback || 'Nice start. Add one more lesson detail next time.'
    }

    parsed.coaching.score = clampNumber(parsed.coaching.score, 0, 10)
    parsed.coaching.tier = coachingTier(parsed.coaching.score)
    return parsed
}

// ── POST /api/role-play/turn (text input) ─────────────────────────────────────
router.post('/turn', authenticate, async (req, res, next) => {
    try {
        const { lesson_id, scenario, conversation = [], user_message } = req.body
        if (!scenario || !user_message) {
            return res.status(400).json({ success: false, message: 'scenario and user_message required' })
        }

        const ctx = lesson_id ? await resolveRolePlayContext(lesson_id) : null
        const lesson = ctx?.lesson || (lesson_id ? await Lesson.findById(lesson_id).select('title transcript') : null)
        const frame = ctx?.frame || getRolePlayFrame(scenario?.roleplay_type || 'auto', {
            lessonTitle: lesson?.title || '',
        })

        const result = await processTurn({
            lessonTranscript: lesson?.transcript || '',
            lessonTitle: lesson?.title || '',
            scenario,
            conversation,
            userMessage: user_message,
            frame,
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

        const ctx = lesson_id ? await resolveRolePlayContext(lesson_id) : null
        const lesson = ctx?.lesson || (lesson_id ? await Lesson.findById(lesson_id).select('title transcript') : null)
        const frame = ctx?.frame || getRolePlayFrame(scenario?.roleplay_type || 'auto', {
            lessonTitle: lesson?.title || '',
        })

        const result = await processTurn({
            lessonTranscript: lesson?.transcript || '',
            lessonTitle: lesson?.title || '',
            scenario,
            conversation,
            userMessage: transcription,
            frame,
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

        const ctx = lesson_id ? await resolveRolePlayContext(lesson_id) : null
        const lesson = ctx?.lesson || (lesson_id ? await Lesson.findById(lesson_id).select('title transcript') : null)
        const frame = ctx?.frame || getRolePlayFrame(scenario?.roleplay_type || 'auto', {
            lessonTitle: lesson?.title || '',
        })

        const convoText = conversation
            .map(m => `${m.role === 'user' ? `Trainee (${frame.trainee_label})` : `${scenario?.character_name || frame.character_label}`}: ${m.content}`)
            .join('\n')

        const lessonSkill = scenario?.lesson_skill || ''
        const keyPoints = (scenario?.lesson_key_points || []).join('; ')
        const userResponses = conversation.filter(m => m.role === 'user')

        if (!userResponses.some(m => !isBlankResponse(m.content))) {
            return res.json({
                success: true,
                summary: {
                    overall_score: 0,
                    grade: 'F',
                    summary: `No trainee responses were captured, so this roleplay scores 0. Try again and answer each ${frame.character_label.toLowerCase()} turn with at least one lesson-specific detail.`,
                    strengths: [],
                    improvements: [{
                        area: 'Response completeness',
                        tip: 'Give a clear answer before ending the roleplay turn.',
                    }],
                    best_moment: null,
                    recommended_focus: 'Answer each counterpart question clearly before ending the turn.',
                },
            })
        }

        const isClientFacing = ['sales', 'technical_service', 'support'].includes(frame.roleplay_type)

        const prompt = `You evaluated a workplace training role-play session.

━━ CONTEXT ━━
ROLEPLAY MODE: ${frame.mode_label} (${frame.roleplay_type})
CONTEXT: ${frame.context_line}
LESSON: "${lesson?.title || 'Training'}"
LESSON TEACHES: ${lessonSkill}
KEY POINTS: ${keyPoints}
LESSON TRANSCRIPT:
"""
${(lesson?.transcript || '').slice(0, 3000)}
"""

The TRAINEE played: ${frame.trainee_role}
The CHARACTER played: ${frame.character_kind}
Scenario: ${scenario?.situation || ''}
Trainee goal: ${scenario?.goal || ''}

━━ CONVERSATION ━━
${convoText}

━━ EVALUATION ━━
Evaluate the TRAINEE as ${frame.trainee_role} — did they answer correctly and confidently using what the lesson teaches?
${frame.turn_rules}

Ask yourself:
- Did the trainee demonstrate the knowledge and techniques this lesson covers?
- Did they handle the character's questions the way the lesson recommends?
- Where did they fall short of what the lesson specifically teaches?

SCORING:
- Mostly evasive or ignored lesson content → 20-40
- Some effort but missed key lesson techniques → 40-55
- Average — applied some lesson knowledge but inconsistently → 55-65
- Good — clearly demonstrated the lesson's teachings → 65-80
- Excellent — answered with full command of lesson content → 80+

${isClientFacing ? `Override with this client-centered scale:
- Score from whether the counterpart would feel understood, informed, and guided toward a next step.
- Mostly evasive or not useful -> 35-50
- Some effort, but still confusing -> 50-60
- Partially useful and mostly relevant -> 65-75
- Helpful and reasonably accurate -> 75-88
- Very clear, specific, and confidence-building -> 85+
- Do not require every expected detail for a passing score. A useful answer that handles the main concern should usually be 70+.
- If the trainee forgets one supporting detail, subtract only 5-10 percentage points.` : `Practical scale:
- Score from whether the counterpart would feel the trainee applied the lesson correctly.
- A useful answer that handles the main concern should usually be 70+.
- If the trainee forgets one supporting detail, subtract only 5-10 percentage points.`}
- Keep the summary encouraging and a bit fun: lead with progress, then give one practical thing to try next.

Return ONLY valid JSON:
{
  "overall_score": 58,
  "grade": "C+",
  "summary": "2-3 honest sentences evaluating the trainee in their role, referencing the lesson content.",
  "strengths": ["specific moment where trainee correctly applied lesson knowledge — empty array if none"],
  "improvements": [
    {
      "area": "Specific technique or knowledge point from the lesson",
      "tip": "Exactly what the lesson says to do — quote or closely paraphrase the lesson content"
    }
  ],
  "best_moment": "The single best response the trainee gave, or null if none stood out.",
  "recommended_focus": "The specific lesson skill the trainee should focus on in the next practice session."
}`

        const res2 = await callLLM([{ role: 'user', content: prompt }], 700)
        const summary = parseJSON(res2.data.choices[0].message.content)
        summary.overall_score = Math.round(clampNumber(summary.overall_score, 0, 100))
        res.json({ success: true, summary })
    } catch (err) { next(err) }
})

module.exports = router
