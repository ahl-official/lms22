const axios = require('axios');

const WAHA_BASE = process.env.WAHA_URL || 'https://waha.amankhan.space';
const WAHA_SESSION = process.env.WAHA_SESSION || 'ahlaiteam';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';

const wahaClient = axios.create({
    baseURL: WAHA_BASE,
    headers: {
        'Content-Type': 'application/json',
        ...(WAHA_API_KEY && { 'X-Api-Key': WAHA_API_KEY }),
    },
    timeout: 15000,
});

const formatChatId = (phone) => {
    const digits = phone.replace(/\D/g, '');
    return `${digits}@c.us`;
};

const checkSession = async () => {
    const res = await wahaClient.get(`/api/sessions/${WAHA_SESSION}`);
    return res.data;
};

const sendMessage = async (phone, text) => {
    const chatId = formatChatId(phone);
    const res = await wahaClient.post('/api/sendText', {
        session: WAHA_SESSION,
        chatId,
        text,
    });
    return res.data;
};

const buildTraineeReport = ({ traineeName, courseName, testTitle, score, passingScore, status, testType, aiFeedback, submittedAt }) => {
    const passed = score !== null && score >= passingScore;
    const emoji = passed ? '✅' : '❌';
    const statusText = passed ? 'PASSED' : 'NEEDS IMPROVEMENT';
    const date = submittedAt
        ? new Date(submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    let msg = `${emoji} *Test Report - ${statusText}*\n\n`;
    msg += `Hello ${traineeName}! 👋\n\n`;
    msg += `Here is your test result:\n\n`;
    msg += `📚 *Course:* ${courseName}\n`;
    msg += `📝 *Test:* ${testTitle}\n`;
    msg += `🎯 *Your Score:* ${score !== null ? score + '%' : 'Pending'}\n`;
    msg += `📊 *Passing Score:* ${passingScore}%\n`;
    msg += `🗂️ *Test Type:* ${testType === 'voice' ? '🎤 Voice' : '✏️ Written'}\n`;
    msg += `📅 *Date:* ${date}\n\n`;

    if (aiFeedback && testType === 'voice') {
        msg += `💬 *AI Feedback:*\n${aiFeedback}\n\n`;
    }

    if (passed) {
        msg += `🎉 Congratulations! You have passed the test. Keep up the great work!\n`;
    } else {
        msg += `💪 Don't give up! Review the course material and try again. You can do it!\n`;
    }

    msg += `\n_Sent via AhlaiTeam LMS_`;
    return msg;
};

const buildTrainerReport = ({ trainerName, traineeName, traineePhone, courseName, testTitle, score, passingScore, testType, submittedAt }) => {
    const passed = score !== null && score >= passingScore;
    const emoji = passed ? '✅' : '⚠️';
    const date = submittedAt
        ? new Date(submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : 'N/A';

    let msg = `${emoji} *Trainee Test Result Notification*\n\n`;
    msg += `Hello ${trainerName}! 👋\n\n`;
    msg += `A trainee has completed a test:\n\n`;
    msg += `👤 *Trainee:* ${traineeName}\n`;
    msg += `📱 *Phone:* ${traineePhone || 'N/A'}\n`;
    msg += `📚 *Course:* ${courseName}\n`;
    msg += `📝 *Test:* ${testTitle}\n`;
    msg += `🎯 *Score:* ${score !== null ? score + '%' : 'Pending'}\n`;
    msg += `📊 *Passing Score:* ${passingScore}%\n`;
    msg += `🗂️ *Test Type:* ${testType === 'voice' ? '🎤 Voice' : '✏️ Written'}\n`;
    msg += `📅 *Date:* ${date}\n`;
    msg += `📌 *Result:* ${passed ? '✅ PASSED' : '❌ NOT PASSED'}\n`;
    msg += `\n_Sent via AhlaiTeam LMS_`;
    return msg;
};

const buildRolePlayLockTrainerReport = ({
    trainerName,
    traineeId,
    traineeName,
    traineeEmail,
    traineePhone,
    courseName,
    moduleName,
    lessonName,
    attemptsUsed,
    threshold,
    lockedAt,
}) => {
    const date = lockedAt
        ? new Date(lockedAt).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        : 'N/A';

    let msg = `*Roleplay Lock Alert*\n\n`;
    msg += `Hello ${trainerName || 'Trainer'},\n\n`;
    msg += `A trainee has failed to pass the roleplay section after ${attemptsUsed} attempts and is now temporarily locked.\n\n`;
    msg += `*Trainee:* ${traineeName || 'N/A'}\n`;
    msg += `*Trainee ID:* ${traineeId || 'N/A'}\n`;
    msg += `*Email:* ${traineeEmail || 'N/A'}\n`;
    msg += `*Phone:* ${traineePhone || 'N/A'}\n`;
    msg += `*Course:* ${courseName || 'N/A'}\n`;
    msg += `*Module:* ${moduleName || 'N/A'}\n`;
    msg += `*Lesson:* ${lessonName || 'N/A'}\n`;
    msg += `*Required Score:* ${threshold}%\n`;
    msg += `*Status:* Locked - trainer review/unlock required\n`;
    msg += `*Locked At:* ${date}\n\n`;
    msg += `Please review the trainee and unlock from Trainer > Trainees > Course Progress > Unlock Course when appropriate.`;
    msg += `\n\n_Sent via AhlaiTeam LMS_`;
    return msg;
};

/**
 * Auto-send WhatsApp notifications to trainee and trainer after an assessment.
 * Best-effort — never throws, so it never breaks the attempt save flow.
 *
 * @param {Object} attempt  - saved Attempt document
 * @param {Object} trainee  - User document { name, phone }
 * @param {Object} trainer  - User document { name, phone } (course creator)
 * @param {Object} course   - Course document { title }
 * @param {Object} test     - Test document { title, passing_score } (can be null for voice-test flow)
 */
const notifyAssessmentComplete = async ({ attempt, trainee, trainer, course, test }) => {
    const results = { trainee: null, trainer: null };
    const errors = [];

    const passingScore = attempt.passing_score || test?.passing_score || 60;
    const testTitle = test?.title || 'Assessment';
    const courseTitle = course?.title || 'Course';

    // Send to trainee
    if (trainee?.phone) {
        try {
            const msg = buildTraineeReport({
                traineeName: trainee.name,
                courseName: courseTitle,
                testTitle,
                score: attempt.score,
                passingScore,
                status: attempt.status,
                testType: attempt.test_type,
                aiFeedback: attempt.ai_feedback,
                submittedAt: attempt.submitted_at,
            });
            results.trainee = await sendMessage(trainee.phone, msg);
        } catch (err) {
            errors.push(`Trainee WhatsApp failed: ${err.message}`);
            console.warn('WhatsApp to trainee failed:', err.message);
        }
    }

    // Send to trainer
    if (trainer?.phone) {
        try {
            const msg = buildTrainerReport({
                trainerName: trainer.name,
                traineeName: trainee?.name || 'A trainee',
                traineePhone: trainee?.phone,
                courseName: courseTitle,
                testTitle,
                score: attempt.score,
                passingScore,
                testType: attempt.test_type,
                submittedAt: attempt.submitted_at,
            });
            results.trainer = await sendMessage(trainer.phone, msg);
        } catch (err) {
            errors.push(`Trainer WhatsApp failed: ${err.message}`);
            console.warn('WhatsApp to trainer failed:', err.message);
        }
    }

    return { results, errors };
};

/**
 * Notify trainer when a trainee exhausts roleplay attempts and gets locked.
 * Best-effort - never throws, so roleplay progress saving is not blocked.
 */
const notifyRolePlayLocked = async ({ progress, trainee, trainer, course, module, lesson, threshold = 80 }) => {
    const results = { trainer: null };
    const errors = [];

    if (!trainer?.phone) {
        errors.push('Trainer phone not available');
        return { results, errors };
    }

    try {
        const msg = buildRolePlayLockTrainerReport({
            trainerName: trainer.name,
            traineeId: trainee?._id?.toString(),
            traineeName: trainee?.name,
            traineeEmail: trainee?.email,
            traineePhone: trainee?.phone,
            courseName: course?.title,
            moduleName: module?.title,
            lessonName: lesson?.title,
            attemptsUsed: progress?.attempts_used,
            threshold,
            lockedAt: progress?.last_attempt_at || new Date(),
        });

        results.trainer = await sendMessage(trainer.phone, msg);
    } catch (err) {
        errors.push(`Roleplay lock WhatsApp failed: ${err.message}`);
        console.warn('WhatsApp roleplay lock alert failed:', err.message);
    }

    return { results, errors };
};

module.exports = {
    sendMessage,
    checkSession,
    buildTraineeReport,
    buildTrainerReport,
    buildRolePlayLockTrainerReport,
    notifyAssessmentComplete,
    notifyRolePlayLocked,
    formatChatId,
};
