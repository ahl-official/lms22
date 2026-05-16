const mongoose = require('mongoose');

const rolePlayProgressSchema = new mongoose.Schema(
  {
    trainee_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      required: true,
    },
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    attempts_used: { type: Number, default: 0 },
    best_score: { type: Number, default: 0 },
    last_score: { type: Number, default: null },
    passed: { type: Boolean, default: false },
    unlocked_by_trainer: { type: Boolean, default: false },
    unlocked_at: { type: Date, default: null },
    trainer_unlocked_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    trainer_unlock_note: { type: String, default: '' },
    last_attempt_at: { type: Date, default: null },
    last_scenario_type: { type: String, default: null },
    last_question_count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

rolePlayProgressSchema.index({ trainee_id: 1, lesson_id: 1 }, { unique: true });
rolePlayProgressSchema.index({ course_id: 1, trainee_id: 1 });
rolePlayProgressSchema.index({ course_id: 1, attempts_used: 1, passed: 1, unlocked_by_trainer: 1 });

module.exports = mongoose.model('RolePlayProgress', rolePlayProgressSchema);
