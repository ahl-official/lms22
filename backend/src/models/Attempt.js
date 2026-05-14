const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
  trainee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  test_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  enrollment_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Enrollment' },
  test_type: { type: String, enum: ['written', 'voice'], required: true },

  // Written test fields
  answers: { type: mongoose.Schema.Types.Mixed, default: null }, // { questionIndex: answer }
  questions_snapshot: { type: mongoose.Schema.Types.Mixed, default: null }, // questions at time of attempt

  // Voice test fields
  voice_transcript: { type: String, default: null },
  recording_gridfs_id: { type: String, default: null }, // GridFS file _id
  ai_feedback: { type: String, default: null },
  ai_rubric_breakdown: { type: mongoose.Schema.Types.Mixed, default: null },

  // Shared
  score: { type: Number, default: null, min: 0, max: 100 },
  passing_score: { type: Number, default: 60 },
  status: {
    type: String,
    enum: ['processing', 'scored', 'failed'],
    default: 'processing',
  },
  pinecone_id: { type: String, default: null }, // Vector ID for voice attempts

  started_at: { type: Date, default: null },
  submitted_at: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Attempt', attemptSchema);
