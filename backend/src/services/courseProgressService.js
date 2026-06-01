const LessonProgress = require('../models/LessonProgress');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const Enrollment = require('../models/Enrollment');
const Attempt = require('../models/Attempt');

const getModuleCompletionSnapshot = async ({ traineeId, moduleIds }) => {
  const totalByModule = {};
  const completedByModule = {};
  const completedLessonIds = new Set();

  if (!traineeId || !moduleIds?.length) {
    return { totalByModule, completedByModule, completedLessonIds };
  }

  const lessons = await Lesson.find({ module_id: { $in: moduleIds }, is_published: true })
    .select('_id module_id test_id')
    .lean();
  const lessonIds = lessons.map(lesson => lesson._id);
  const testIds = lessons.map(lesson => lesson.test_id).filter(Boolean);

  const [completedProgress, attempts] = await Promise.all([
    LessonProgress.find({
      trainee_id: traineeId,
      lesson_id: { $in: lessonIds },
      status: 'completed',
    }).select('lesson_id').lean(),
    testIds.length
      ? Attempt.find({
        trainee_id: traineeId,
        test_id: { $in: testIds },
        status: 'scored',
      }).select('test_id score passing_score').lean()
      : [],
  ]);

  const completedProgressLessonIds = new Set(
    completedProgress.map(item => item.lesson_id.toString())
  );
  const passedTestIds = new Set(
    attempts
      .filter(attempt => Number(attempt.score) >= (attempt.passing_score || 60))
      .map(attempt => attempt.test_id.toString())
  );

  for (const lesson of lessons) {
    const moduleKey = lesson.module_id.toString();
    totalByModule[moduleKey] = (totalByModule[moduleKey] || 0) + 1;

    const lessonCompleted =
      completedProgressLessonIds.has(lesson._id.toString()) ||
      (lesson.test_id && passedTestIds.has(lesson.test_id.toString()));

    if (lessonCompleted) {
      completedByModule[moduleKey] = (completedByModule[moduleKey] || 0) + 1;
      completedLessonIds.add(lesson._id.toString());
    }
  }

  return { totalByModule, completedByModule, completedLessonIds };
};

const recalculateEnrollmentProgress = async ({ traineeId, courseId }) => {
  if (!traineeId || !courseId) return null;

  const modules = await Module.find({ course_id: courseId, is_published: true }).sort({ order: 1 });
  const moduleIds = modules.map(mod => mod._id);
  if (!moduleIds.length) return null;

  const { totalByModule, completedByModule } = await getModuleCompletionSnapshot({ traineeId, moduleIds });

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
  } else if (progress > 0) {
    enrollment.status = 'in_progress';
    enrollment.completed_at = null;
  } else {
    enrollment.status = 'not_started';
    enrollment.completed_at = null;
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
  getModuleCompletionSnapshot,
  markAssessmentAttemptProgress,
  recalculateEnrollmentProgress,
};
