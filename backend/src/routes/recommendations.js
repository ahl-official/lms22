const router = require('express').Router();
const axios = require('axios');
const Recommendation = require('../models/Recommendation');
const Attempt = require('../models/Attempt');
const { authenticate, authorize } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recommendations/generate
// Called from the frontend immediately after a failed attempt is scored.
// Generates 3 AI suggestions based on the attempt's feedback/rubric, then
// saves them as 'pending' for trainer review.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/generate', authenticate, authorize('trainee'), async (req, res, next) => {
    try {
        const { attempt_id } = req.body;
        if (!attempt_id)
            return res.status(400).json({ success: false, message: 'attempt_id required' });

        const attempt = await Attempt.findById(attempt_id)
            .populate('course_id', 'title transcript')
            .populate('test_id', 'title');

        if (!attempt)
            return res.status(404).json({ success: false, message: 'Attempt not found' });

        if (!attempt.trainee_id.equals(req.user._id))
            return res.status(403).json({ success: false, message: 'Access denied' });

        // Only generate for failed attempts
        if (attempt.score >= (attempt.passing_score || 60)) {
            return res.status(400).json({
                success: false,
                message: 'Trainee passed — no recommendations needed',
            });
        }

        // Don't double-generate for the same attempt
        const existing = await Recommendation.findOne({ attempt_id });
        if (existing) {
            return res.json({ success: true, recommendation: existing, already_existed: true });
        }

        // Build a rich prompt using the attempt's AI feedback and rubric breakdown
        const rubricSummary = attempt.ai_rubric_breakdown
            ? JSON.stringify(attempt.ai_rubric_breakdown, null, 2)
            : null;

        const improvementAreas = attempt.ai_rubric_breakdown?.improvement_areas
            ? attempt.ai_rubric_breakdown.improvement_areas
                .map(a => `- ${a.topic}: ${a.issue}`)
                .join('\n')
            : null;

        const prompt = `A sales trainee scored ${attempt.score}% (needed ${attempt.passing_score || 60}%) on: "${attempt.course_id?.title}".

${attempt.ai_feedback ? `Overall AI feedback:\n${attempt.ai_feedback}\n` : ''}
${improvementAreas ? `Specific weak areas:\n${improvementAreas}\n` : ''}
${rubricSummary && !improvementAreas ? `Rubric breakdown:\n${rubricSummary}\n` : ''}

Generate exactly 3 targeted, actionable learning recommendations to help this trainee improve before their next attempt. Be specific to their actual weak areas — never give generic advice like "study more".

Return ONLY valid JSON, no markdown, no code fences:
{
  "suggestions": [
    {
      "title": "<short resource or activity title>",
      "description": "<2 sentences: what to do and exactly why it addresses their gap>",
      "topic": "<the specific skill this addresses, e.g. 'Objection Handling'>",
      "resource_url": null
    },
    { ... },
    { ... }
  ]
}`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'anthropic/claude-3.5-sonnet',
                max_tokens: 900,
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
        const clean = raw.replace(/```json|```/g, '').trim();

        let suggestions;
        try {
            ({ suggestions } = JSON.parse(clean));
        } catch {
            console.error('[Recommendations] AI JSON parse failed:', clean);
            return res.status(500).json({ success: false, message: 'Failed to parse AI response' });
        }

        const rec = await Recommendation.create({
            trainee_id: req.user._id,
            course_id: attempt.course_id._id,
            attempt_id: attempt._id,
            suggestions,
            status: 'pending',
        });

        res.status(201).json({ success: true, recommendation: rec });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/my
// Trainee sees only their APPROVED recommendations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/my', authenticate, authorize('trainee'), async (req, res, next) => {
    try {
        const recs = await Recommendation.find({
            trainee_id: req.user._id,
            status: 'approved',
        })
            .populate('course_id', 'title')
            .populate('attempt_id', 'score submitted_at')
            .sort({ createdAt: -1 });

        res.json({ success: true, recommendations: recs });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/pending
// Trainer/Admin sees all PENDING recommendations (their curation queue)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const recs = await Recommendation.find({ status: 'pending' })
            .populate('trainee_id', 'name email')
            .populate('course_id', 'title')
            .populate('attempt_id', 'score submitted_at passing_score')
            .sort({ createdAt: -1 });

        res.json({ success: true, recommendations: recs });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/recommendations/all
// Trainer/Admin sees full history (all statuses) for audit/review
// ─────────────────────────────────────────────────────────────────────────────
router.get('/all', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const { status, trainee_id } = req.query;
        const filter = {};
        if (status) filter.status = status;
        if (trainee_id) filter.trainee_id = trainee_id;

        const recs = await Recommendation.find(filter)
            .populate('trainee_id', 'name email')
            .populate('course_id', 'title')
            .populate('attempt_id', 'score submitted_at')
            .populate('reviewed_by', 'name')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({ success: true, recommendations: recs });
    } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/recommendations/:id/review
// Trainer approves or rejects with an optional note
// Body: { status: 'approved' | 'rejected', trainer_note?: string }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id/review', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
    try {
        const { status, trainer_note } = req.body;

        if (!['approved', 'rejected'].includes(status))
            return res.status(400).json({ success: false, message: 'status must be approved or rejected' });

        const rec = await Recommendation.findByIdAndUpdate(
            req.params.id,
            {
                status,
                trainer_note: trainer_note || null,
                reviewed_by: req.user._id,
                reviewed_at: new Date(),
            },
            { new: true }
        )
            .populate('trainee_id', 'name email')
            .populate('course_id', 'title');

        if (!rec)
            return res.status(404).json({ success: false, message: 'Recommendation not found' });

        res.json({ success: true, recommendation: rec });
    } catch (err) { next(err); }
});

module.exports = router;