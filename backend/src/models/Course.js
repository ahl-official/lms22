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

module.exports = mongoose.model('Course', courseSchema);