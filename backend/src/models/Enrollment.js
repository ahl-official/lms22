const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema({
  trainee_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
  },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  best_score: { type: Number, default: null },
  completed_at: { type: Date, default: null },
  enrolled_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// One enrollment per trainee per course
enrollmentSchema.index({ trainee_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
