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

  return matched.length / expectedKeywords.length >= 0.4;
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
Return ONLY valid JSON, no markdown:
{"questions":[{"question":"string","type":"short_answer","difficulty":"${difficulty}","is_objection":false,"expected_answer":"string","key_points":["a","b","c"],"points":2}]}`
    : `You are an expert learning assessor. Generate ${questionCount} multiple choice questions.
Order questions from EASIEST to HARDEST.
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
  return parsed.questions || [];
};

// ── Score written attempt ─────────────────────────────────────────────────────
// FIX: short_answer questions now use keyword-overlap scoring, not "non-empty = pass".
const scoreWrittenAttempt = async (questions, answers) => {
  let correct = 0;
  let total = 0;

  const breakdown = questions.map((q, i) => {
    const userAns = (answers[i] || '').toString().trim().toLowerCase();
    const correctAns = (q.correct_answer || '').toString().trim().toLowerCase();

    let isCorrect;
    if (q.type === 'mcq') {
      isCorrect = userAns === correctAns;
    } else {
      // short_answer: keyword-overlap scoring
      isCorrect = scoreShortAnswer(
        answers[i] || '',
        q.correct_answer || '',
        q.key_points || []
      );
    }

    if (isCorrect) correct += q.points || 1;
    total += q.points || 1;

    return {
      question: q.question,
      user_answer: answers[i],
      correct_answer: q.correct_answer,
      is_correct: isCorrect,
      points: q.points || 1,
    };
  });

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { score, breakdown };
};

// ── Per-answer evaluation ─────────────────────────────────────────────────────
const evaluateAnswer = async ({ question, userAnswer, courseTranscript = '', category = '' }) => {
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

SCORING RULES:
- Technique correct but different wording: Score 8/10 or higher.
- Core meaning matches: Minimum 7/10.
- Only penalize for explicitly wrong info or forbidden mistakes.

PENALTIES: apologizing for price/limitations (-3), arguing with customer (-5), over-explaining (-2)

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

SCORING: Semantically correct but informal = 8/10. Covers key points with fillers = 9/10. Factually wrong = <5/10.

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
        { role: 'user', content: 'Evaluate this answer strictly but fairly.' },
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
    if (!evaluation.feedback_tier) {
      evaluation.feedback_tier = score >= 8 ? 'positive' : score >= 5 ? 'constructive' : 'corrective';
    }
    if (!evaluation.spoken_feedback) {
      if (score >= 8) evaluation.spoken_feedback = 'Excellent! That is correct and well-articulated.';
      else if (score >= 5) evaluation.spoken_feedback = 'Good effort. You covered the main points but missed a few details.';
      else evaluation.spoken_feedback = 'Not quite. Please review the training material.';
    }
  } catch (_) { }

  return evaluation;
};

// ── Score single audio file voice attempt ─────────────────────────────────────
const scoreVoiceAttempt = async (voiceTranscript, questions) => {
  const client = getChatClient();
  const questionsText = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a voice assessment scorer. Score the candidate's spoken response.
Return ONLY valid JSON:
{"score":85,"feedback":"Overall assessment","rubric_breakdown":{"content_accuracy":80,"communication_clarity":90,"completeness":85,"confidence_score":80}}`,
      },
      { role: 'user', content: `Questions:\n${questionsText}\n\nCandidate response:\n${voiceTranscript}` },
    ],
    temperature: 0.3,
  });

  return parseJSON(response.choices[0].message.content);
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
  const client = getChatClient();

  const conversationText = conversation
    .map((t, i) => `Q${i + 1}: ${t.question}\nAnswer: ${t.answer}`)
    .join('\n\n');

  const response = await client.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are an expert assessor scoring a verbal exam for "${courseTitle}".
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

  return parseJSON(response.choices[0].message.content);
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
};