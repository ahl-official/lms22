const Attempt = require('../models/Attempt');
const wahaService = require('../services/wahaService');

const getStatus = async (req, res, next) => {
    try {
        const session = await wahaService.checkSession();
        res.json({ success: true, session });
    } catch (err) {
        console.error('[WAHA] Status check failed:', err.message);
        if (err.response) {
            console.error('[WAHA] HTTP status:', err.response.status);
            console.error('[WAHA] Response body:', JSON.stringify(err.response.data));
        }
        res.json({
            success: false,
            message: 'WAHA session unreachable',
            error: err.message,
            waha_status: err.response?.status,
            waha_error: err.response?.data,
        });
    }
};

const sendReport = async (req, res, next) => {
    try {
        const { attemptId } = req.params;
        const attempt = await Attempt.findById(attemptId)
            .populate('trainee_id', 'name email phone')
            .populate({ path: 'course_id', select: 'title created_by', populate: { path: 'created_by', select: 'name phone' } })
            .populate({
                path: 'test_id',
                select: 'title passing_score test_type questions module_id lesson_id',
                populate: [
                    { path: 'module_id', select: 'title order' },
                    { path: 'lesson_id', select: 'title' },
                ],
            });
        if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
        const { results, errors } = await wahaService.notifyAssessmentComplete({
            attempt,
            trainee: attempt.trainee_id,
            trainer: attempt.course_id?.created_by,
            course: attempt.course_id,
            test: attempt.test_id,
        });
        const success = results.trainee !== null || results.trainer !== null;
        res.json({ success, message: success ? 'Report sent' : 'No messages sent', results, errors: errors.length ? errors : undefined });
    } catch (err) { next(err); }
};

const sendBulkReports = async (req, res, next) => {
    try {
        const { test_id } = req.body;
        if (!test_id) return res.status(400).json({ success: false, message: 'test_id required' });
        const attempts = await Attempt.find({ test_id, status: 'scored' })
            .populate('trainee_id', 'name email phone')
            .populate({ path: 'course_id', select: 'title created_by', populate: { path: 'created_by', select: 'name phone' } })
            .populate({
                path: 'test_id',
                select: 'title passing_score test_type questions module_id lesson_id',
                populate: [
                    { path: 'module_id', select: 'title order' },
                    { path: 'lesson_id', select: 'title' },
                ],
            });
        const results = [];
        for (const attempt of attempts) {
            const row = { trainee: attempt.trainee_id?.name, sent: false, error: null };
            try {
                await wahaService.notifyAssessmentComplete({ attempt, trainee: attempt.trainee_id, trainer: attempt.course_id?.created_by, course: attempt.course_id, test: attempt.test_id });
                row.sent = true;
            } catch (err) { row.error = err.message; }
            results.push(row);
            await new Promise(r => setTimeout(r, 300));
        }
        const sentCount = results.filter(r => r.sent).length;
        res.json({ success: true, message: `Sent ${sentCount}/${results.length} reports`, results });
    } catch (err) { next(err); }
};

const testMessage = async (req, res, next) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.status(400).json({ success: false, message: 'phone required' });
        const text = `✅ *AhlaiTeam LMS - WhatsApp Connected!*\n\nHello ${req.user.name}! 👋\n\nYour WhatsApp integration is working correctly.\n\n_Sent via AhlaiTeam LMS_`;
        const result = await wahaService.sendMessage(phone, text);
        res.json({ success: true, message: 'Test message sent', result });
    } catch (err) {
        console.error('[WAHA] Test message failed:', err.message);
        if (err.response) console.error('[WAHA] Response:', err.response.status, JSON.stringify(err.response.data));
        res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = { getStatus, sendReport, sendBulkReports, testMessage };
