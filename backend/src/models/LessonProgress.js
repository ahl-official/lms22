const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema(
    {
        trainee_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        lesson_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Lesson',
            required: true,
        },
        module_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Module',
            required: true,
        },
        course_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Course',
            required: true,
        },
        status: {
            type: String,
            enum: ['not_started', 'in_progress', 'completed'],
            default: 'not_started',
        },
        // Score if lesson has a quiz/test
        score: { type: Number, default: null, min: 0, max: 100 },
        // Video watch progress (0-100%)
        watch_percent: { type: Number, default: 0, min: 0, max: 100 },
        started_at: { type: Date, default: null },
        completed_at: { type: Date, default: null },
    },
    { timestamps: true }
);

lessonProgressSchema.index({ trainee_id: 1, lesson_id: 1 }, { unique: true });
lessonProgressSchema.index({ trainee_id: 1, module_id: 1 });
lessonProgressSchema.index({ trainee_id: 1, course_id: 1 });

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);