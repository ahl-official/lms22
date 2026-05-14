// REPLACE backend/src/models/Test.js
// Added lesson_id field — backward-compatible (module_id tests still work)

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    type: { type: String, enum: ['mcq', 'short_answer'], default: 'mcq' },
    options: [String],
    correct_answer: String,
    points: { type: Number, default: 1 },
    difficulty: { type: String, default: null },
    key_points: [String],
    is_objection: { type: Boolean, default: false },
  },
  { _id: false }
);

const testSchema = new mongoose.Schema(
  {
    course_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
    },
    // Legacy: test belongs to a module
    module_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
    // NEW: test belongs to a specific lesson
    lesson_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lesson',
      default: null,
    },
    title: { type: String, required: true, trim: true },
    test_type: { type: String, enum: ['written', 'voice'], default: 'written' },
    questions: [questionSchema],
    time_limit_minutes: { type: Number, default: null },
    max_attempts: { type: Number, default: 3 },
    passing_score: { type: Number, default: 60 },
    is_active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

testSchema.index({ course_id: 1, module_id: 1, order: 1 });
testSchema.index({ lesson_id: 1 });

module.exports = mongoose.model('Test', testSchema);