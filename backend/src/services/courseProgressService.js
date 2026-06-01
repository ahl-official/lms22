const LessonProgress = require('../models/LessonProgress');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const Enrollment = require('../models/Enrollment');

const recalculateEnrollmentProgress = async ({ traineeId, courseId }) => {
  if (!traineeId || !courseId) return null;

  const modules = await Module.find({ course_id: courseId, is_published: true }).sort({ order: 1 });
  const moduleIds = modules.map(mod => mod._id);
  if (!moduleIds.length) return null;

  const [lessonCounts, completedCounts] = await Promise.all([
    Lesson.aggregate([
      { $match: { module_id: { $in: moduleIds }, is_published: true } },
      { $group: { _id: '$module_id', count: { $sum: 1 } } },
    ]),
    LessonProgress.aggregate([
      {
        $match: {
          trainee_id: traineeId,
          module_id: { $in: moduleIds },
          status: 'completed',
        },
      },
      { $group: { _id: '$module_id', count: { $sum: 1 } } },
    ]),
  ]);

  const totalByModule = {};
  for (const row of lessonCounts) totalByModule[row._id.toString()] = row.count;

  const completedByModule = {};
  for (const row of completedCounts) completedByModule[row._id.toString()] = row.count;

  const completedModules = modules.filter((mod) => {
    const key = mod._id.toString();
    const total = totalByModule[key] || 0;
    return total > 0 && (completedByModule[key] || 0) >= total;
  }).length;

  const progress = modules.length ? Math.round((completedModules / modules.length) * 100) : 0;
  const enrollment = await Enrollment.findOne({ trainee_id: traineeId, course_id: courseId });
  if (!enrollment) return { progress, completedModules, totalModules: modules.length };

  enrollment.progress = progress;
  if (progress === 100) {
    enrollment.status = 'completed';
    enrollment.completed_at = enrollment.completed_at || new Date();
  } else if (progress > 0 || enrollment.status === 'not_started') {
    enrollment.status = progress > 0 ? 'in_progress' : enrollment.status;
  }
  await enrollment.save();

  return { progress, completedModules, totalModules: modules.length, enrollment };
};

const markAssessmentAttemptProgress = async ({ attempt, test, traineeId, courseId }) => {
  if (!attempt || !traineeId || !courseId) return null;

  const passingScore = attempt.passing_score || test?.passing_score || 60;
  const passed = Number(attempt.score) >= passingScore;
  const lessonId = test?.lesson_id?._id || test?.lesson_id;
  const moduleId = test?.module_id?._id || test?.module_id;

  if (lessonId && moduleId && passed) {
    await LessonProgress.findOneAndUpdate(
      { trainee_id: traineeId, lesson_id: lessonId },
      {
        $set: {
          trainee_id: traineeId,
          lesson_id: lessonId,
          module_id: moduleId,
          course_id: courseId,
          status: 'completed',
          score: attempt.score,
          completed_at: new Date(),
          watch_percent: 100,
        },
        $setOnInsert: { started_at: attempt.started_at || new Date() },
      },
      { upsert: true, new: true }
    );

    return recalculateEnrollmentProgress({ traineeId, courseId });
  }

  const enrollment = await Enrollment.findOne({ trainee_id: traineeId, course_id: courseId });
  if (enrollment) {
    if (enrollment.best_score === null || attempt.score > enrollment.best_score) {
      enrollment.best_score = attempt.score;
    }
    if (!test?.lesson_id) {
      if (passed) {
        enrollment.status = 'completed';
        enrollment.progress = 100;
        enrollment.completed_at = enrollment.completed_at || new Date();
      } else {
        enrollment.status = 'in_progress';
      }
    }
    await enrollment.save();
  }

  return recalculateEnrollmentProgress({ traineeId, courseId });
};

module.exports = {
  markAssessmentAttemptProgress,
  recalculateEnrollmentProgress,
};
