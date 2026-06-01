const Attempt = require('../models/Attempt');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const Course = require('../models/Course');
const Test = require('../models/Test');
const { uploadRecording } = require('../config/gridfs');
const { upsertVoiceAttempt } = require('../config/pinecone');
const { scoreWrittenAttempt, scoreVoiceAttempt, generateEmbedding } = require('./aiService');
const { transcribeAudioBuffer } = require('./transcriptService');
const { notifyAssessmentComplete } = require('./wahaService');
const { markAssessmentAttemptProgress } = require('./courseProgressService');
const { v4: uuidv4 } = require('uuid');

/**
 * Save a written test attempt: score with AI, persist to MongoDB, notify via WhatsApp.
 */
const saveWrittenAttempt = async ({ traineeId, testId, courseId, enrollmentId, questions, answers, startedAt }) => {
  const { score, breakdown } = await scoreWrittenAttempt(questions, answers);

  // Get passing score from the test itself
  const test = await Test.findById(testId)
    .select('title passing_score test_type questions module_id lesson_id')
    .populate('module_id', 'title order')
    .populate('lesson_id', 'title');
  const passingScore = test?.passing_score || 60;

  const attempt = await Attempt.create({
    trainee_id: traineeId,
    course_id: courseId,
    test_id: testId,
    enrollment_id: enrollmentId,
    test_type: 'written',
    answers,
    questions_snapshot: breakdown,
    score,
    passing_score: passingScore,
    status: 'scored',
    started_at: startedAt || null,
    submitted_at: new Date(),
  });

  await updateEnrollment({ attempt, test, traineeId, courseId, fallbackEnrollmentId: enrollmentId });

  // Best-effort WhatsApp notification — never blocks the response
  sendAssessmentNotification({ attempt, traineeId, courseId, test }).catch(() => { });

  return attempt;
};

/**
 * Save a voice test attempt:
 * 1. Upload audio to MongoDB GridFS
 * 2. Transcribe with AssemblyAI
 * 3. Score with OpenAI
 * 4. Persist to MongoDB
 * 5. Embed + upsert to Pinecone (best-effort)
 * 6. Notify via WhatsApp (best-effort)
 */
const saveVoiceAttempt = async ({ traineeId, testId, courseId, enrollmentId, questions, audioBuffer, contentType = 'audio/webm' }) => {
  const filename = `voice_${traineeId}_${Date.now()}.webm`;
  const gridfsId = await uploadRecording(audioBuffer, filename, contentType);

  const voiceTranscript = await transcribeAudioBuffer(audioBuffer, contentType);

  const { score, feedback, rubric_breakdown } = await scoreVoiceAttempt(voiceTranscript, questions);

  const test = await Test.findById(testId)
    .select('title passing_score test_type questions module_id lesson_id')
    .populate('module_id', 'title order')
    .populate('lesson_id', 'title');
  const passingScore = test?.passing_score || 60;

  const attempt = await Attempt.create({
    trainee_id: traineeId,
    course_id: courseId,
    test_id: testId,
    enrollment_id: enrollmentId,
    test_type: 'voice',
    voice_transcript: voiceTranscript,
    recording_gridfs_id: gridfsId,
    ai_feedback: feedback,
    ai_rubric_breakdown: rubric_breakdown,
    score,
    passing_score: passingScore,
    status: 'scored',
    submitted_at: new Date(),
  });

  await updateEnrollment({ attempt, test, traineeId, courseId, fallbackEnrollmentId: enrollmentId });

  // Pinecone — best-effort
  try {
    const embedding = await generateEmbedding(voiceTranscript);
    if (embedding) {
      const pineconeId = uuidv4();
      await upsertVoiceAttempt({
        id: pineconeId,
        embedding,
        metadata: {
          attempt_id: attempt._id.toString(),
          trainee_id: traineeId.toString(),
          course_id: courseId.toString(),
          score,
          submitted_at: attempt.submitted_at.toISOString(),
        },
      });
      attempt.pinecone_id = pineconeId;
      await attempt.save();
    }
  } catch (pineconeErr) {
    console.warn('Pinecone upsert failed (non-fatal):', pineconeErr.message);
  }

  // Best-effort WhatsApp notification
  sendAssessmentNotification({ attempt, traineeId, courseId, test }).catch(() => { });

  return attempt;
};

/**
 * Fetch the trainee, trainer (course creator), and course, then fire WhatsApp messages.
 * Always resolves — never rejects.
 */
const sendAssessmentNotification = async ({ attempt, traineeId, courseId, test }) => {
  try {
    const [trainee, course] = await Promise.all([
      User.findById(traineeId).select('name email phone'),
      Course.findById(courseId).select('title created_by')
        .populate('created_by', 'name phone'),
    ]);

    const trainer = course?.created_by || null;

    await notifyAssessmentComplete({ attempt, trainee, trainer, course, test });
  } catch (err) {
    console.warn('Assessment WhatsApp notification failed (non-fatal):', err.message);
  }
};

const updateEnrollment = async ({ attempt, test, traineeId, courseId, fallbackEnrollmentId }) => {
  await markAssessmentAttemptProgress({ attempt, test, traineeId, courseId });

  if (!fallbackEnrollmentId) return;
  const enr = await Enrollment.findById(fallbackEnrollmentId);
  if (!enr) return;
  if (enr.best_score === null || attempt.score > enr.best_score) {
    enr.best_score = attempt.score;
    await enr.save();
  }
};

module.exports = { saveWrittenAttempt, saveVoiceAttempt };
