const mongoose = require('mongoose');

let connectionPromise = null;

let cleanupRan = false;

const runAutoUnenroll = async () => {
  if (cleanupRan) return;
  cleanupRan = true;
  try {
    const Course = mongoose.models.Course || require('../models/Course');
    const User = mongoose.models.User || require('../models/User');
    const Enrollment = mongoose.models.Enrollment || require('../models/Enrollment');

    const course = await Course.findOne({ title: /American Hairline Technician Training/i }).select('_id title');
    if (!course) return;

    const trainees = await User.find({
      $or: [
        { email: /dhruv/i },
        { name: /dhruv/i },
        { email: /preview\.hindi\.demo/i },
        { name: /preview\.hindi\.demo/i },
        { email: /parth/i },
        { name: /parth/i },
      ],
    }).select('_id email name');

    if (trainees.length > 0) {
      const traineeIds = trainees.map((t) => t._id);
      const res = await Enrollment.deleteMany({
        course_id: course._id,
        trainee_id: { $in: traineeIds },
      });
      if (res.deletedCount > 0) {
        console.log(`[AutoUnenroll] Removed ${res.deletedCount} enrollment(s) for target trainees from ${course.title}`);
      }
    }
  } catch (err) {
    console.error('[AutoUnenroll error]:', err.message);
  }
};

const connect = async () => {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connectionPromise) return connectionPromise;

  try {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    await connectionPromise;
    console.log('MongoDB connected:', mongoose.connection.host);
    runAutoUnenroll().catch(() => {});
    return mongoose;
  } catch (err) {
    connectionPromise = null;
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

module.exports = { connect, mongoose };
