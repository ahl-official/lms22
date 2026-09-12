const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    topic: { type: String, default: null },
    resource_url: { type: String, default: null },
}, { _id: false });

const recommendationSchema = new mongoose.Schema({
    trainee_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    course_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    },
    attempt_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Attempt',
        required: true,
    },

    // AI-generated suggestions (3 items by default)
    suggestions: [suggestionSchema],

    // Trainer curation workflow
    // pending  → trainer hasn't reviewed yet
    // approved → trainee can now see these
    // rejected → discarded, trainee never sees them
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
    },

    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewed_at: { type: Date, default: null },
    trainer_note: { type: String, default: null },

}, { timestamps: true });

// Fast queries by trainee + status (trainee dashboard)
recommendationSchema.index({ trainee_id: 1, status: 1 });
// Fast queries for trainer review queue
recommendationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);