const router = require('express').Router();
const enrollmentController = require('../controllers/enrollmentController');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/enrollments
router.post('/', authenticate, authorize('admin', 'trainer'), enrollmentController.enrollTrainee);

// POST /api/enrollments/bulk
router.post('/bulk', authenticate, authorize('admin', 'trainer'), enrollmentController.bulkEnroll);

// GET /api/enrollments/my
router.get('/my', authenticate, authorize('trainee'), enrollmentController.getMyEnrollments);

// GET /api/enrollments/course/:courseId
router.get('/course/:courseId', authenticate, authorize('admin', 'trainer'), enrollmentController.getCourseEnrollments);

// PUT /api/enrollments/:id/progress
router.put('/:id/progress', authenticate, enrollmentController.updateProgress);

// DELETE /api/enrollments/:id
router.delete('/:id', authenticate, authorize('admin', 'trainer'), enrollmentController.deleteEnrollment);

// POST /api/enrollments/cleanup-unenroll-demo
// Triggered to unenroll dhruv, preview.hindi.demo, and parth from American Hairline Technician Training
router.post('/cleanup-unenroll-demo', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const Course = require('../models/Course');
    const User = require('../models/User');
    const Enrollment = require('../models/Enrollment');

    const course = await Course.findOne({ title: /American Hairline Technician Training/i }).select('_id title');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const targetUsers = await User.find({
      $or: [
        { email: /dhruv/i },
        { name: /dhruv/i },
        { email: /preview\.hindi\.demo/i },
        { name: /preview\.hindi\.demo/i },
        { email: /parth/i },
        { name: /parth/i },
      ],
    }).select('_id email name');

    const userIds = targetUsers.map((u) => u._id);
    const deleteResult = await Enrollment.deleteMany({
      course_id: course._id,
      trainee_id: { $in: userIds },
    });

    res.json({
      success: true,
      course: course.title,
      matchedUsers: targetUsers.map((u) => ({ id: u._id, name: u.name, email: u.email })),
      deletedCount: deleteResult.deletedCount,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

