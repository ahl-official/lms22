/**
 * Reset assessment attempt(s) for one trainee on one course.
 *
 * Usage (from backend/):
 *   node src/db/resetTraineeAttempt.js --email faizan@lms.com --course "American Hairline Technician Training"
 *   node src/db/resetTraineeAttempt.js --email faizan@lms.com --course-id 6a672b2f8e90628bb3a8c81c --dry-run
 */
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Attempt = require('../models/Attempt');
const Test = require('../models/Test');
const LessonProgress = require('../models/LessonProgress');
const Enrollment = require('../models/Enrollment');
const { recalculateEnrollmentProgress } = require('../services/courseProgressService');
const { deleteRecording } = require('../config/gridfs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || process.env.RESET_DRY_RUN === '1';
const emailIdx = args.indexOf('--email');
const courseIdx = args.indexOf('--course');
const courseIdIdx = args.indexOf('--course-id');
const email = process.env.RESET_EMAIL || (emailIdx >= 0 ? args[emailIdx + 1] : null);
const courseTitle = process.env.RESET_COURSE || (courseIdx >= 0 ? args[courseIdx + 1] : null);
const courseIdArg = process.env.RESET_COURSE_ID || (courseIdIdx >= 0 ? args[courseIdIdx + 1] : null);

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  if (!email) {
    console.error('Usage: node resetTraineeAttempt.js --email user@lms.com [--course title | --course-id id]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const trainee = await User.findOne({ email }).select('_id name email');
  if (!trainee) {
    console.error('Trainee not found:', email);
    process.exit(1);
  }

  let course = null;
  if (courseIdArg) {
    course = await Course.findById(courseIdArg).select('_id title');
  } else if (courseTitle) {
    course = await Course.findOne({ title: new RegExp(courseTitle, 'i') }).select('_id title');
  }

  if (!course) {
    console.error('Course not found');
    process.exit(1);
  }

  const attempts = await Attempt.find({
    trainee_id: trainee._id,
    course_id: course._id,
  }).sort({ submitted_at: -1 });

  console.log('Trainee:', trainee.email, trainee._id.toString());
  console.log('Course:', course.title, course._id.toString());
  console.log('Attempts found:', attempts.length);
  attempts.forEach((a) => {
    console.log(`  - ${a._id} | ${a.test_type} | score=${a.score} | ${a.submitted_at?.toISOString?.() || a.submitted_at}`);
  });

  if (!attempts.length) {
    console.log('Nothing to reset.');
    await mongoose.disconnect();
    return;
  }

  const testIds = [...new Set(attempts.map((a) => String(a.test_id)).filter(Boolean))];
  const tests = await Test.find({ _id: { $in: testIds } }).select('_id lesson_id title');
  const lessonIds = tests.map((t) => t.lesson_id).filter(Boolean);

  if (dryRun) {
    console.log('Dry run — no writes.');
    await mongoose.disconnect();
    return;
  }

  for (const attempt of attempts) {
    if (attempt.recording_gridfs_id) {
      try {
        await deleteRecording(attempt.recording_gridfs_id);
      } catch (err) {
        console.warn('Recording delete skipped:', err.message);
      }
    }
  }

  const deleted = await Attempt.deleteMany({
    trainee_id: trainee._id,
    course_id: course._id,
  });

  if (lessonIds.length) {
    await LessonProgress.updateMany(
      { trainee_id: trainee._id, lesson_id: { $in: lessonIds } },
      {
        $set: {
          status: 'not_started',
          score: null,
          watch_percent: 0,
          started_at: null,
          completed_at: null,
        },
      }
    );
  }

  const enrollment = await Enrollment.findOne({ trainee_id: trainee._id, course_id: course._id });
  if (enrollment) {
    enrollment.best_score = null;
    enrollment.status = 'not_started';
    enrollment.progress = 0;
    enrollment.completed_at = null;
    await enrollment.save();
  }

  await recalculateEnrollmentProgress({ traineeId: trainee._id, courseId: course._id });

  console.log('Deleted attempts:', deleted.deletedCount);
  console.log('Reset lesson progress for lessons:', lessonIds.length);
  console.log('Done.');

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
