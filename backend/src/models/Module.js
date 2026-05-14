const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
    course_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // Video
    video_url: { type: String, default: null },
    video_source: {
        type: String,
        enum: ['youtube', 'gumlet', 'unknown'],
        default: 'unknown',
    },

    // Transcript for AI notes + test generation
    transcript: { type: String, default: null },
    transcript_status: {
        type: String,
        enum: ['none', 'fetching', 'ready', 'error'],
        default: 'none',
    },

    // Voice test required for this module
    requires_voice_test: { type: Boolean, default: false },
    passing_score: { type: Number, default: 60, min: 0, max: 100 },

    // Sequential order within the course
    order: { type: Number, default: 0 },
    is_published: { type: Boolean, default: false },

    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

moduleSchema.index({ course_id: 1, order: 1 });

module.exports = mongoose.model('Module', moduleSchema);