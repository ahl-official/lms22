const router = require('express').Router();
const aiController = require('../controllers/aiController');
const { authenticate } = require('../middleware/auth');

// POST /api/ai/generate-notes
router.post('/generate-notes', authenticate, aiController.generateStudyNotes);

module.exports = router;
