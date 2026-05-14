const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  requires_voice_test: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
