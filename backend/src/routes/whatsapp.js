const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { getStatus, sendReport, sendBulkReports, testMessage } = require('../controllers/whatsappController');

// All routes require auth
router.use(authenticate);

// Admin only: check WAHA session status
router.get('/status', authorize('admin'), getStatus);

// Admin only: test message to a phone
router.post('/test-message', authorize('admin'), testMessage);

// Admin only: bulk send for a test
router.post('/send-bulk', authorize('admin', 'trainer'), sendBulkReports);

// Trainer or admin: send report for a single attempt
router.post('/send-report/:attemptId', authorize('admin', 'trainer'), sendReport);

module.exports = router;
