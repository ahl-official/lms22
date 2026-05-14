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

module.exports = router;

