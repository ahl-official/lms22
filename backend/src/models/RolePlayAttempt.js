const mongoose = require('mongoose');

const rolePlayTurnSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'character'],
      required: true,
    },
    content: { type: String, default: '' },
    source: { type: String, default: null },
    coaching: { type: mongoose.Schema.Types.Mixed, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const rolePlayAttemptSchema = new mongoose.Schema(
  {
    trainee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    module_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
      index: true,
    },
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
      index: true,
    },
    progress_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RolePlayProgress',
      default: null,
    },
    attempt_number: { type: Number, default: 1 },
    scenario_type: { type: String, default: null },
    scenario: { type: mongoose.Schema.Types.Mixed, default: null },
    conversation: [rolePlayTurnSchema],
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
    score: { type: Number, default: null, min: 0, max: 100 },
    grade: { type: String, default: null },
    passed: { type: Boolean, default: false },
    question_count: { type: Number, default: 0 },
    submitted_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

rolePlayAttemptSchema.index({ trainee_id: 1, course_id: 1, submitted_at: -1 });
rolePlayAttemptSchema.index({ trainee_id: 1, lesson_id: 1, submitted_at: -1 });

module.exports = mongoose.model('RolePlayAttempt', rolePlayAttemptSchema);
