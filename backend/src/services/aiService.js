const OpenAI = require('openai');
const Attempt = require('../models/Attempt');

let _chat = null;
const getChatClient = () => {
  if (!_chat) {
    _chat = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'LMS Platform',
      },
    });
  }
  return _chat;
};

const CHAT_MODEL = process.env.LLM_MODEL || 'openai/gpt-4o-mini';

const parseJSON = (content) => {
  try { return JSON.parse(content); } catch (_) { }
  const clean = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(clean); } catch (_) { }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(content.slice(start, end + 1)); } catch (_) { }
  }
  throw new Error('Could not extract valid JSON from response');
};

const DISTRIBUTION_HINTS = {
  trial: 'Mostly factual (70%) with some procedural (30%); no complex scenarios.',
  basics: 'Balanced mix of factual (40%), procedural (30%), and scenario (30%) questions.',
  'field-ready': 'Focus on procedural (30%) and complex scenario/edge-case (70%). Include multi-turn scenarios.',
};

// ── Short-answer scoring helpers ──────────────────────────────────────────────
const STOP_WORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'for', 'are', 'was', 'have',
  'been', 'will', 'its', 'our', 'their', 'they', 'which', 'what', 'when',
  'where', 'how', 'can', 'not', 'but', 'all', 'any', 'about', 'into', 'over',
  'also', 'more', 'than', 'just', 'such', 'your', 'each', 'these', 'those',
  'some', 'would', 'should', 'could', 'both', 'while', 'after', 'before',
  'being', 'having', 'other', 'same', 'much', 'only', 'like', 'does', 'then',
  'here', 'there', 'make', 'made', 'must', 'very', 'well', 'even', 'now',
  'many', 'most', 'too', 'see', 'him', 'her', 'his', 'she', 'had', 'has',
  'did', 'use',
]);

const extractKeywords = (text) =>
  (text || '')
    .toLowerCase()
    .split(/[\s,;:.!?'"()\[\]]+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w));

const clampNumber = (value, min, max) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
};

const isBlankAnswer = (answer) => {
  const normalized = (answer || '').toString().trim().toLowerCase();
  return !normalized ||
    normalized === '(no response)' ||
    normalized === 'no response' ||
    normalized === 'n/a' ||
    normalized === 'na';
};

const answerTier = (scoreOutOfTen) => {
  if (scoreOutOfTen >= 8) return 'positive';
  if (scoreOutOfTen >= 5) return 'constructive';
  return 'corrective';
};

const normalizeEvaluation = (evaluation, userAnswer) => {
  if (isBlankAnswer(userAnswer)) {
    return {
      ...evaluation,
      overall_score: 0,
      feedback_tier: 'corrective',
      what_correct: '',
      what_missed: evaluation?.what_missed || 'No answer was provided.',
      feedback: 'No response was captured, so this question scores 0. Next time, give at least one specific detail from the lesson.',
      spoken_feedback: 'No response was captured, so this one scores zero. Try giving one specific detail next time.',
    };
  }

  const score = clampNumber(evaluation?.overall_score, 0, 10);
  return {
    ...evaluation,
    overall_score: score,
    feedback_tier: answerTier(score),
  };
};

const scoreFromQuestionEvaluations = (conversation = []) => {
  const scores = conversation
    .map(turn => Number(turn?.evaluation?.overall_score))
    .filter(Number.isFinite)
    .map(score => clampNumber(score, 0, 10) * 10);

  if (!scores.length) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
};

const hasAnsweredAnyQuestion = (conversation = []) =>
  conversation.some(turn => !isBlankAnswer(turn?.answer));

const normalizeBrandTerms = (value, sourceText = '') => {
  const source = (sourceText || '').toLowerCase();
  const shouldUseAmericanHairline = source.includes('american hairline');

  if (typeof value === 'string') {
    if (!shouldUseAmericanHairline) return value;
    return value
      .replace(/\bAmerican Airlines\b/gi, 'American Hairline')
      .replace(/\bAmerican Airline\b/gi, 'American Hairline')
      .replace(/\bAmerican Airline's\b/gi, "American Hairline's");
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeBrandTerms(item, sourceText));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeBrandTerms(item, sourceText)])
    );
  }

  return value;
};

/**
 * Score a short-answer response via keyword overlap.
 * Returns true if user's answer covers ≥ 40% of expected keywords.
 * Falls back gracefully when correct_answer is empty.
 */
const scoreShortAnswer = (userAns, correctAns, keyPoints = []) => {
  const trimmed = (userAns || '').trim();
  if (trimmed.length < 3) return false;

  const userLower = trimmed.toLowerCase();
  const correctLower = (correctAns || '').toLowerCase();

  // Exact or near-exact match
  if (correctLower && userLower === correctLower) return true;

  // Build keyword pool from correct answer + key_points
  const expectedKeywords = [
    ...extractKeywords(correctAns),
    ...keyPoints.flatMap(kp => extractKeywords(kp)),
  ];

  // No extractable keywords — accept any non-trivial answer
  if (!expectedKeywords.length) {
    return trimmed.split(/\s+/).length >= 3;
  }

  const userKeywords = new Set(extractKeywords(userAns));
  const matched = expectedKeywords.filter(
    k => userKeywords.has(k) || userLower.includes(k)
  );

  return matched.length / expectedKeywords.length >= 0.25;
};

const shortAnswerCredit = (userAns, correctAns, keyPoints = []) => {
  const trimmed = (userAns || '').trim();
  if (trimmed.length < 3) return 0;
  if (scoreShortAnswer(userAns, correctAns, keyPoints)) return 1;

  const expectedKeywords = [
    ...extractKeywords(correctAns),
    ...keyPoints.flatMap(kp => extractKeywords(kp)),
  ];

  if (!expectedKeywords.length) return trimmed.split(/\s+/).length >= 3 ? 0.6 : 0.35;

  const userLower = trimmed.toLowerCase();
  const userKeywords = new Set(extractKeywords(userAns));
  const matched = expectedKeywords.filter(k => userKeywords.has(k) || userLower.includes(k));
  const ratio = matched.length / expectedKeywords.length;

  if (ratio >= 0.5) return 0.85;
  if (ratio >= 0.25) return 0.65;
  if (ratio >= 0.15) return 0.45;
  if (trimmed.split(/\s+/).length >= 5) return 0.25;
  return 0.1;
};

// ── Adaptive difficulty based on past attempt scores ──────────────────────────
const determineAdaptiveDifficulty = async (traineeId, courseId) => {
  try {
    const recentAttempts = await Attempt.find({
      trainee_id: traineeId,
      course_id: courseId,
      status: 'scored',
      score: { $ne: null },
    }).sort({ submitted_at: -1 }).limit(5);

    if (!recentAttempts.length) return 'trial';
    const avg = recentAttempts.reduce((sum, a) => sum + a.score, 0) / recentAttempts.length;
    if (avg < 50) return 'trial';
    if (avg < 75) return 'basics';
    return 'field-ready';
  } catch (err) {
    console.warn('Adaptive difficulty check failed:', err.message);
    return 'basics';
  }
};

// ── Generate test questions with progressive difficulty ───────────────────────
const generateTest = async (transcript, { testType = 'written', questionCount = 5, courseTitle = '', difficulty = 'basics' } = {}) => {
  const client = getChatClient();
  const isVoice = testType === 'voice';
  const dist = DISTRIBUTION_HINTS[difficulty] || DISTRIBUTION_HINTS.basics;

  const systemPrompt = isVoice
    ? `You are an expert learning assessor. Generate ${questionCount} open-ended questions for a voice assessment.
Order questions from EASIEST to HARDEST (Progressive Difficulty).
Question mix: ${dist}
Preserve exact names from the course/transcript. If the transcript says "American Hairline", never rewrite it as "American Airline" or "American Airlines".
Return ONLY valid JSON, no markdown:
{"questions":[{"question":"string","type":"short_answer","difficulty":"${difficulty}","is_objection":false,"expected_answer":"string","key_points":["a","b","c"],"points":2}]}`
    : `You are an expert learning assessor. Generate ${questionCount} multiple choice questions.
Order questions from EASIEST to HARDEST.
Preserve exact names from the course/transcript. If the transcript says "American Hairline", never rewrite it as "American Airline" or "American Airlines".
Return ONLY valid JSON, no markdown:
{"questions":[{"question":"string","type":"mcq","options":["A","B","C","D"],"correct_answer":"A","difficulty":"${difficulty}","points":1}]}`;

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Course: ${courseTitle}\n\nTranscript:\n${transcript.slice(0, 8000)}` },
    ],
    temperature: 0.7,
  });

  const _raw = response.choices[0].message.content;
  console.log('[generateTest] raw:', _raw.slice(0, 800));
  const parsed = parseJSON(_raw);
  return normalizeBrandTerms(parsed.questions || [], `${courseTitle}\n${transcript}`);
};

// ── Score written attempt ─────────────────────────────────────────────────────
// MCQs remain objective; open answers use the same trainer-style judgment as roleplay.
const scoreWrittenAttempt = async (questions, answers) => {
  let correct = 0;
  let total = 0;
  const breakdown = [];

  for (const [i, q] of questions.entries()) {
    const userAns = (answers[i] || '').toString().trim().toLowerCase();
    const correctAns = (q.correct_answer || '').toString().trim().toLowerCase();

    let isCorrect;
    let earned = 0;
    let evaluation = null;
    if (q.type === 'mcq') {
      isCorrect = userAns === correctAns;
      earned = isCorrect ? (q.points || 1) : 0;
    } else {
      let credit;
      try {
        evaluation = await evaluateAnswer({
          question: {
            question: q.question,
            expected_answer: q.expected_answer || q.correct_answer || '',
            key_points: q.key_points || [],
            is_objection: q.is_objection || false,
          },
          userAnswer: answers[i] || '',
        });
        credit = clampNumber(evaluation.overall_score, 0, 10) / 10;
      } catch (err) {
        console.warn('Written answer evaluation failed, using keyword fallback:', err.message);
        credit = shortAnswerCredit(
          answers[i] || '',
          q.correct_answer || q.expected_answer || '',
          q.key_points || []
        );
      }

      earned = (q.points || 1) * credit;
      isCorrect = credit >= 0.8;
    }

    correct += earned;
    total += q.points || 1;

    breakdown.push({
      question: q.question,
      user_answer: answers[i],
      correct_answer: q.correct_answer || q.expected_answer,
      is_correct: isCorrect,
      points: q.points || 1,
      earned_points: Math.round(earned * 100) / 100,
      feedback: evaluation?.feedback || null,
      feedback_tier: evaluation?.feedback_tier || null,
      answer_score: evaluation?.overall_score ?? null,
    });
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { score, breakdown };
};

// ── Per-answer evaluation ─────────────────────────────────────────────────────
const evaluateAnswer = async ({ question, userAnswer, courseTranscript = '', category = '' }) => {
  if (isBlankAnswer(userAnswer)) {
    return normalizeEvaluation({}, userAnswer);
  }

  const client = getChatClient();

  const isObjection = question.is_objection === true ||
    /objection|budget|price|fake|expensive|concern|hesitat/i.test(question.question || '');

  const keyPoints = question.key_points || [];
  const trainingExcerpt = courseTranscript.slice(0, 1500);

  const systemPrompt = isObjection ? `You are evaluating a sales trainee's objection-handling response.

EVALUATION CRITERIA:
- IGNORE filler words (um, uh, like) and minor stammering.
- Focus strictly on MEANING and INTENT.
- Paraphrasing is ENCOURAGED — if they convey the right concept in different words, give FULL CREDIT.
- Short but correct answers score HIGH (8/10+). Do not punish brevity.
- Recognize synonyms (e.g. "expensive" == "costly", "trust" == "confidence").
- Be generous and client-centered: if the answer would reassure or help a real customer, score it well.

SCORING RULES:
- Technique correct but different wording: Score 8/10 or higher.
- Core meaning matches: Minimum 7.5/10.
- Missing one supporting detail: subtract only 1-2 points, never more.
- If the answer is helpful but incomplete, keep it around 7/10 instead of failing it.
- Give 8/10 or higher for small but useful client-facing moves: reassurance, asking a clarifying question, offering a next step, or explaining one concrete detail.
- Only score below 5/10 for answers that are wrong, dismissive, unsafe, or unrelated.
- Feedback should feel fun, warm, and coach-like. Always celebrate what worked before naming one next move.

PENALTIES: arguing with customer (-4), explicitly wrong facts (-3), dismissive tone (-3), long but confusing answer (-1 to -2)

OBJECTION QUESTION: ${question.question}
EXPECTED: ${question.expected_answer || ''}
KEY POINTS: ${JSON.stringify(keyPoints)}
TRAINING EXCERPT: ${trainingExcerpt}
USER ANSWER: "${userAnswer}"

Return ONLY valid JSON:
{"tone":0,"technique":0,"key_points_covered":0,"overall_score":0,"what_correct":"","what_missed":"","feedback":"","spoken_feedback":"Short 1-2 sentence TTS feedback","feedback_tier":"positive","evidence_from_training":""}`
    : `You are a supportive sales training evaluator. Your goal is to verify understanding, not memorization.

IMPORTANT:
1. IGNORE filler words, hesitations, conversational fluff.
2. Core idea captured correctly = 8/10+.
3. Do NOT penalize for different vocabulary if meaning is preserved.
4. Short but correct answers score HIGH. Do not punish brevity.
5. Recognize synonyms (e.g. "client" == "customer").
6. Missing one detail should only cost 1-2 points. Do not turn a useful answer into a fail.
7. Keep feedback upbeat, practical, and a little fun. Praise the useful part first, then give one clear next move.
8. Give 8/10 or higher for small useful client-facing moves: reassurance, clarifying questions, concrete details, or a next step.

SCORING: Semantically correct but informal = 8/10. Covers most key points with fillers = 9/10. Helpful but incomplete = 7/10. Factually wrong or unrelated = <5/10.

QUESTION: ${question.question}
EXPECTED ANSWER: ${question.expected_answer || ''}
KEY POINTS: ${JSON.stringify(keyPoints)}
TRAINING MATERIAL: ${trainingExcerpt}
USER ANSWER: "${userAnswer}"

Return ONLY valid JSON:
{"accuracy":0,"completeness":0,"clarity":0,"overall_score":0,"what_correct":"","what_missed":"","feedback":"","spoken_feedback":"Short 1-2 sentence TTS feedback","feedback_tier":"positive","evidence_from_training":""}`;

  let evaluation;
  try {
    const response = await client.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Evaluate this answer generously and practically. Reward helpful client-centered answers.' },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });
    evaluation = parseJSON(response.choices[0].message.content);
  } catch (err) {
    console.warn('Answer evaluation LLM failed:', err.message);
    evaluation = {
      overall_score: 0,
      feedback: 'Evaluation failed due to a technical error.',
      spoken_feedback: 'Sorry, I could not evaluate that answer.',
    };
  }

  evaluation.user_answer = userAnswer;

  // Keyword fallback — if LLM score is low but keywords match, boost score
  try {
    const rawScore = parseFloat(evaluation.overall_score) || 0;
    if (rawScore < 5 && userAnswer.trim() && keyPoints.length > 0) {
      const uaLower = userAnswer.toLowerCase();
      const matched = keyPoints.filter(kp => uaLower.includes(kp.toLowerCase()));
      const keywordRatio = matched.length / keyPoints.length;
      if (keywordRatio >= 0.5) {
        evaluation.overall_score = Math.max(rawScore, 6.5);
        evaluation.feedback = `You mentioned key points like "${matched.slice(0, 2).join('", "')}". Good job hitting the main concepts.`;
        evaluation.spoken_feedback = 'You hit the main keywords. Good job.';
        evaluation.what_correct = 'Included majority of key points.';
      }
    }
  } catch (_) { }

  // Ensure feedback tier and spoken feedback
  try {
    const score = parseFloat(evaluation.overall_score) || 0;
    if (userAnswer.trim().split(/\s+/).length >= 8 && score >= 6 && score < 8) {
      const clientMoves = [
        /book|booking|appointment|schedule|consult/i,
        /online|video|clinic|center|centre|travel|city|location/i,
        /fee|cost|price|deduct|amount/i,
        /help|guide|explain|reassur|understand/i,
      ].filter(rx => rx.test(userAnswer)).length;
      if (clientMoves >= 1) {
        evaluation.overall_score = 8;
        evaluation.feedback_tier = 'positive';
        evaluation.feedback = evaluation.feedback || 'Good client-centered answer. You gave the customer a useful next step and kept the conversation moving.';
      }
    }
    evaluation = normalizeEvaluation(evaluation, userAnswer);
    if (!evaluation.spoken_feedback) {
      const finalScore = parseFloat(evaluation.overall_score) || 0;
      if (finalScore >= 8) evaluation.spoken_feedback = 'Nice work, that was client-friendly and moved the conversation forward.';
      else if (finalScore >= 5) evaluation.spoken_feedback = 'Nice start. You covered the core idea; add one more detail next time.';
      else evaluation.spoken_feedback = 'Good try. Let us tighten the answer and make it clearer for the client.';
    }
  } catch (_) { }

  return normalizeEvaluation(evaluation, userAnswer);
};

// ── Score single audio file voice attempt ─────────────────────────────────────
const scoreVoiceAttempt = async (voiceTranscript, questions) => {
  if (isBlankAnswer(voiceTranscript)) {
    return {
      score: 0,
      feedback: 'No response was captured, so this assessment scores 0. Try again with clear answers to each question.',
      rubric_breakdown: {
        content_accuracy: 0,
        communication_clarity: 0,
        completeness: 0,
        confidence_score: 0,
      },
    };
  }

  const client = getChatClient();
  const questionsText = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a friendly, generous voice assessment scorer. Score the candidate's spoken response from a client-centered perspective.
Rules:
- Reward answers that are helpful, reassuring, and mostly accurate, even if not perfectly worded.
- If the candidate forgets one supporting detail, subtract only 5-10 percentage points.
- Do not fail a useful answer just because it does not match the expected wording exactly.
- Only score harshly for wrong facts, unsafe advice, dismissive tone, or answers that do not address the question.
- Feedback should be upbeat, short, and practical.
Return ONLY valid JSON:
{"score":85,"feedback":"Overall assessment","rubric_breakdown":{"content_accuracy":80,"communication_clarity":90,"completeness":85,"confidence_score":80}}`,
      },
      { role: 'user', content: `Questions:\n${questionsText}\n\nCandidate response:\n${voiceTranscript}` },
    ],
    temperature: 0.3,
  });

  const parsed = parseJSON(response.choices[0].message.content);
  parsed.score = Math.round(clampNumber(parsed.score, 0, 100));
  if (parsed.rubric_breakdown) {
    for (const key of Object.keys(parsed.rubric_breakdown)) {
      parsed.rubric_breakdown[key] = Math.round(clampNumber(parsed.rubric_breakdown[key], 0, 100));
    }
  }
  return parsed;
};

// ── Generate next dynamic question ────────────────────────────────────────────
const generateNextQuestion = async ({ courseTitle, transcript, conversation, fallbackQuestions, questionNumber, totalQuestions }) => {
  const client = getChatClient();

  const lastAnswer = conversation[conversation.length - 1]?.answer || '';
  if (lastAnswer.trim().split(' ').length < 5 && fallbackQuestions.length > 0) {
    const fallback = fallbackQuestions[Math.floor(Math.random() * fallbackQuestions.length)];
    return { question: fallback.question, source: 'fallback' };
  }

  const conversationText = conversation.map((t, i) => `Q${i + 1}: ${t.question}\nAnswer: ${t.answer}`).join('\n\n');

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an interactive voice assessor for "${courseTitle}".
Generate ONE follow-up question that builds on the conversation, probes deeper if superficial, or moves to a new topic if thorough.
Conversational, single sentence ending in ?
Return ONLY the question text.`,
      },
      { role: 'user', content: `Transcript:\n${transcript.slice(0, 4000)}\n\nConversation:\n${conversationText}\n\nThis is question ${questionNumber} of ${totalQuestions}.` },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });

  return { question: response.choices[0].message.content.trim(), source: 'dynamic' };
};

// ── Score full conversation at end of session ─────────────────────────────────
const scoreConversation = async ({ courseTitle, transcript, conversation }) => {
  if (!hasAnsweredAnyQuestion(conversation)) {
    return {
      score: 0,
      feedback: 'No responses were captured, so this assessment scores 0. Try again and answer each question with at least one lesson-specific detail.',
      strengths: [],
      improvement_areas: [
        {
          topic: 'Answer completeness',
          issue: 'No answer was provided for the assessment questions.',
          action: 'Give a clear spoken response for each question before moving on.',
        },
      ],
      rubric_breakdown: {
        content_accuracy: 0,
        communication_clarity: 0,
        completeness: 0,
        confidence_score: 0,
      },
      question_scores: conversation.map(turn => ({
        question: turn.question,
        answer: turn.answer,
        score: 0,
        feedback: 'No response was captured.',
      })),
    };
  }

  const client = getChatClient();
  const conversationText = conversation
    .map((t, i) => `Q${i + 1}: ${t.question}\nAnswer: ${t.answer}`)
    .join('\n\n');

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a friendly, practical assessor scoring a verbal exam for "${courseTitle}".
Return ONLY valid JSON, no markdown:
{
  "score": 85,
  "feedback": "2-3 sentence overall assessment",
  "strengths": [
    "specific thing they did well",
    "another genuine strength"
  ],
  "improvement_areas": [
    {
      "topic": "specific skill name e.g. Objection Handling",
      "issue": "exactly what was wrong or missing in their answers",
      "action": "concrete next step tied to this course — never say study more"
    }
  ],
  "rubric_breakdown": {
    "content_accuracy": 80,
    "communication_clarity": 90,
    "completeness": 85,
    "confidence_score": 80
  },
  "question_scores": [
    {"question": "text", "answer": "text", "score": 80, "feedback": "brief note"}
  ]
}

Rules:
- score = average of rubric_breakdown values
- Score from the client's perspective first: would the client feel understood, informed, and guided?
- If the trainee misses one supporting detail, subtract only 5-10 percentage points from the relevant category.
- Helpful but incomplete answers should usually stay in the 70-80 range.
- Good client-centered answers with natural wording should score 80+.
- Do not require a perfect script or every expected phrase.
- strengths must be specific observations, not generic praise
- improvement_areas must be specific — "study more" is NOT acceptable
- each action must name a concrete next step tied to this course
- if they answered everything well, improvement_areas can be []`,
      },
      {
        role: 'user',
        content: `Transcript:\n${transcript.slice(0, 4000)}\n\nConversation:\n${conversationText}`,
      },
    ],
    temperature: 0.3,
  });

  const parsed = parseJSON(response.choices[0].message.content);
  const modelScore = clampNumber(parsed.score, 0, 100);
  const questionScore = scoreFromQuestionEvaluations(conversation);
  parsed.score = Math.round(questionScore == null
    ? modelScore
    : (modelScore * 0.55) + (questionScore * 0.45));

  if (parsed.rubric_breakdown) {
    for (const key of Object.keys(parsed.rubric_breakdown)) {
      parsed.rubric_breakdown[key] = Math.round(clampNumber(parsed.rubric_breakdown[key], 0, 100));
    }
  }
  return parsed;
};

// ── Embeddings ────────────────────────────────────────────────────────────────
const generateEmbedding = async (text) => {
  const { generateEmbedding: pineconeEmbed } = require('../config/pinecone');
  return pineconeEmbed(text);
};

module.exports = {
  generateTest,
  scoreWrittenAttempt,
  scoreShortAnswer,
  scoreVoiceAttempt,
  evaluateAnswer,
  generateNextQuestion,
  scoreConversation,
  determineAdaptiveDifficulty,
  generateEmbedding,
  normalizeBrandTerms,
};
