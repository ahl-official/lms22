/**
 * One-time: unlock assessment (skip role play gate) for trainees enrolled
 * ONLY in American Hairline Technician Training.
 *
 * Usage (from backend/):
 *   node src/db/unlockTechnicianAssessment.js
 *   node src/db/unlockTechnicianAssessment.js --dry-run
 */
require('dotenv').config();

const mongoose = require('mongoose');
const Course = require('../models/Course');
const Lesson = require('../models/Lesson');
const Enrollment = require('../models/Enrollment');
const RolePlayProgress = require('../models/RolePlayProgress');
const User = require('../models/User');

const COURSE_TITLE = /American Hairline Technician Training/i;
const UNLOCK_NOTE = 'Bulk unlock: skip English role play for technician-only enrollments';

const dryRun = process.argv.includes('--dry-run');

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const course = await Course.findOne({ title: COURSE_TITLE }).select('_id title');
  if (!course) {
    console.error('Course not found:', COURSE_TITLE);
    process.exit(1);
  }

  const admin = await User.findOne({ email: 'admin@lms.com' }).select('_id email');
  const lessons = await Lesson.find({ course_id: course._id }).select('_id title').sort({ order: 1 });
  const enrollments = await Enrollment.find({ course_id: course._id }).select('trainee_id');

  const traineeIds = [...new Set(enrollments.map((e) => String(e.trainee_id)))];
  const eligible = [];

  for (const traineeId of traineeIds) {
    const count = await Enrollment.countDocuments({ trainee_id: traineeId });
    if (count === 1) {
      const user = await User.findById(traineeId).select('name email role');
      if (user?.role === 'trainee') eligible.push(user);
    }
  }

  console.log('Course:', course.title, course._id.toString());
  console.log('Lessons:', lessons.length);
  console.log('Enrolled trainees:', traineeIds.length);
  console.log('Eligible (only this course):', eligible.length);
  eligible.forEach((u) => console.log('  -', u.email, u.name || ''));

  if (!eligible.length) {
    console.log('Nothing to unlock.');
    await mongoose.disconnect();
    return;
  }

  if (dryRun) {
    console.log('\nDry run — no writes.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  let upserted = 0;
  let alreadyUnlocked = 0;

  for (const trainee of eligible) {
    for (const lesson of lessons) {
      const existing = await RolePlayProgress.findOne({
        trainee_id: trainee._id,
        lesson_id: lesson._id,
      });

      if (existing?.passed || existing?.unlocked_by_trainer) {
        alreadyUnlocked += 1;
        continue;
      }

      await RolePlayProgress.findOneAndUpdate(
        { trainee_id: trainee._id, lesson_id: lesson._id },
        {
          $set: {
            course_id: course._id,
            unlocked_by_trainer: true,
            unlocked_at: now,
            trainer_unlocked_by: admin?._id || null,
            trainer_unlock_note: UNLOCK_NOTE,
          },
          $setOnInsert: {
            attempts_used: 0,
            best_score: 0,
            last_score: null,
            passed: false,
          },
        },
        { upsert: true, new: true, runValidators: true }
      );
      upserted += 1;
    }
  }

  console.log('\nDone.');
  console.log('New unlocks:', upserted);
  console.log('Already unlocked:', alreadyUnlocked);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
