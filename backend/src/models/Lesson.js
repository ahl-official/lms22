// REPLACE backend/src/models/Lesson.js
// Added: test_id (link to full Test doc) + ai_notes cache

const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true },
        type: { type: String, enum: ['mcq', 'short_answer'], default: 'mcq' },
        options: [String],
        correct_answer: { type: String, default: null },
        points: { type: Number, default: 1 },
    },
    { _id: false }
);

const lessonSchema = new mongoose.Schema(
    {
        module_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
        course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: '' },
        order: { type: Number, default: 0 },

        // Primary lesson content. video_url/video_source are kept for older records.
        content_url: { type: String, default: null },
        content_type: { type: String, enum: ['video', 'pdf', 'doc', 'unknown'], default: 'unknown' },
        content_source: {
            type: String,
            enum: ['youtube', 'gumlet', 'google_drive', 'google_docs', 'direct', 'unknown'],
            default: 'unknown',
        },
        embed_url: { type: String, default: null },
        video_url: { type: String, default: null },
        video_source: { type: String, enum: ['youtube', 'gumlet', 'unknown'], default: 'unknown' },
        transcript: { type: String, default: null },
        transcript_status: {
            type: String,
            enum: ['none', 'fetching', 'ready', 'error'],
            default: 'none',
        },

        // Content
        text_content: { type: String, default: null },
        study_notes: { type: String, default: null },

        // Inline quiz (simple, no attempt tracking)
        quiz_questions: [quizQuestionSchema],
        quiz_passing_score: { type: Number, default: 60 },

        // Linked full graded Test (attempt-tracked, AI-scored)
        test_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Test',
            default: null,
        },

        // Cached AI notes — generated from lesson transcript
        ai_notes: {
            summary: { type: String, default: null },
            checklist: { type: mongoose.Schema.Types.Mixed, default: null },
            flashcards: { type: mongoose.Schema.Types.Mixed, default: null },
            diagrams: { type: mongoose.Schema.Types.Mixed, default: null },
            keyPoints: { type: mongoose.Schema.Types.Mixed, default: null },
            generated_at: { type: Date, default: null },
        },
        roleplay_personas: {
            personas: { type: mongoose.Schema.Types.Mixed, default: null },
            roleplay_type: { type: String, default: null },
            roleplay_notes: { type: String, default: null },
            generated_at: { type: Date, default: null },
        },

        duration_minutes: { type: Number, default: null },
        is_published: { type: Boolean, default: false },
        created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

lessonSchema.index({ module_id: 1, order: 1 });
lessonSchema.index({ course_id: 1 });

module.exports = mongoose.model('Lesson', lessonSchema);
