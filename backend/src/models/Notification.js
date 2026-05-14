const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  is_read: { type: Boolean, default: false },
  link: { type: String, default: null },
}, { timestamps: true });

notificationSchema.index({ user_id: 1, is_read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
