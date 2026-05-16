const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  passing_score: { type: Number, default: 60, min: 0, max: 100 },
  tags: [String],
  is_published: { type: Boolean, default: false },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },
  department_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
  }],
}, { timestamps: true });

courseSchema.index({ category_id: 1, is_published: 1, createdAt: -1 });
courseSchema.index({ created_by: 1, createdAt: -1 });
courseSchema.index({ is_published: 1, createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);
