const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Attempt = require('../models/Attempt');
const RolePlayAttempt = require('../models/RolePlayAttempt');
const LessonProgress = require('../models/LessonProgress');
const Lesson = require('../models/Lesson');
const Module = require('../models/Module');
const { getModuleCompletionSnapshot } = require('./courseProgressService');

const valueOrNA = (value) => {
  if (value === null || value === undefined || value === '') return 'N/A';
  return String(value);
};

const percent = (value) => {
  if (value === null || value === undefined || value === '') return 'N/A';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : 'N/A';
};

const formatDate = (value) => {
  if (!value) return 'N/A';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
};

const PAGE = {
  left: 48,
  right: 48,
  bottom: 56,
  width: 499,
};

const ensureRoom = (doc, height = 120) => {
  if (doc.y + height > doc.page.height - PAGE.bottom) {
    doc.addPage();
    doc.y = PAGE.left;
  }
};

const sectionTitle = (doc, title, minHeight = 60) => {
  ensureRoom(doc, minHeight);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14)
    .text(title, PAGE.left, doc.y, { width: PAGE.width });
  doc.moveDown(0.55);
};

const label = (doc, text) => {
  doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8)
    .text(String(text).toUpperCase(), PAGE.left, doc.y, { width: PAGE.width });
};

const body = (doc, text, options = {}) => {
  doc.fillColor('#111827').font('Helvetica').fontSize(options.size || 10)
    .text(valueOrNA(text), PAGE.left, doc.y, { width: PAGE.width, lineGap: 3 });
};

const addLabelValue = (doc, fieldLabel, value, x, y, width = 225) => {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text(fieldLabel.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fontSize(11).fillColor('#111827').text(valueOrNA(value), x, y + 13, { width });
};

const avg = (values) => {
  const nums = values.filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
};

const buildCourseReportData = async ({ traineeId, courseId }) => {
  const [trainee, course, enrollment, modules, lessons, attempts, rolePlayAttempts, lessonProgress] = await Promise.all([
    User.findById(traineeId).select('name email phone').lean(),
    Course.findById(courseId).select('title passing_score').lean(),
    Enrollment.findOne({ trainee_id: traineeId, course_id: courseId }).lean(),
    Module.find({ course_id: courseId, is_published: true }).select('_id title order').sort({ order: 1 }).lean(),
    Lesson.find({ course_id: courseId, is_published: true }).select('_id title module_id order').sort({ order: 1 }).lean(),
    Attempt.find({ trainee_id: traineeId, course_id: courseId, status: 'scored' })
      .populate({
        path: 'test_id',
        select: 'title test_type passing_score questions module_id lesson_id',
        populate: [
          { path: 'module_id', select: 'title order' },
          { path: 'lesson_id', select: 'title' },
        ],
      })
      .sort({ submitted_at: 1 })
      .lean(),
    RolePlayAttempt.find({ trainee_id: traineeId, course_id: courseId })
      .populate('lesson_id', 'title')
      .populate('module_id', 'title')
      .sort({ submitted_at: 1 })
      .lean(),
    LessonProgress.find({ trainee_id: traineeId, course_id: courseId })
      .populate('lesson_id', 'title')
      .populate('module_id', 'title')
      .lean(),
  ]);

  if (!trainee) {
    const err = new Error('Trainee not found');
    err.status = 404;
    throw err;
  }
  if (!course) {
    const err = new Error('Course not found');
    err.status = 404;
    throw err;
  }
  if (!enrollment) {
    const err = new Error('Student is not enrolled in this course');
    err.status = 404;
    throw err;
  }

  const moduleIds = modules.map((m) => m._id);
  const snapshot = await getModuleCompletionSnapshot({ traineeId, moduleIds });
  const totalLessons = lessons.length;
  const completedLessonIds = snapshot.completedLessonIds || new Set();
  const completedLessons = lessons.filter((l) => completedLessonIds.has(l._id.toString())).length;
  const completedModules = modules.filter((mod) => {
    const key = mod._id.toString();
    const total = snapshot.totalByModule[key] || 0;
    const done = snapshot.completedByModule[key] || 0;
    return total === 0 || done >= total;
  }).length;

  const progress = totalLessons > 0
    ? Math.round((completedLessons / totalLessons) * 100)
    : (enrollment.progress || 0);

  const assessmentScores = attempts.map((a) => a.score).filter((s) => s != null);
  const rolePlayScores = rolePlayAttempts.map((a) => a.score).filter((s) => s != null);

  // Round numbers per test / lesson
  const assessmentRoundByTest = {};
  const assessmentRounds = attempts.map((attempt) => {
    const testKey = attempt.test_id?._id?.toString() || attempt.test_id?.toString() || 'unknown';
    assessmentRoundByTest[testKey] = (assessmentRoundByTest[testKey] || 0) + 1;
    return {
      round: assessmentRoundByTest[testKey],
      testTitle: attempt.test_id?.title || 'Assessment',
      testType: attempt.test_type,
      lessonTitle: attempt.test_id?.lesson_id?.title || null,
      moduleTitle: attempt.test_id?.module_id?.title || null,
      score: attempt.score,
      passingScore: attempt.passing_score || attempt.test_id?.passing_score || 60,
      passed: attempt.score != null
        ? attempt.score >= (attempt.passing_score || attempt.test_id?.passing_score || 60)
        : false,
      language: attempt.assessment_language || 'en',
      submittedAt: attempt.submitted_at,
      feedback: attempt.ai_feedback || null,
      rubric: attempt.ai_rubric_breakdown || null,
    };
  });

  const rolePlayRoundByLesson = {};
  const rolePlayRounds = rolePlayAttempts.map((attempt) => {
    const lessonKey = attempt.lesson_id?._id?.toString() || attempt.lesson_id?.toString() || 'unknown';
    rolePlayRoundByLesson[lessonKey] = (rolePlayRoundByLesson[lessonKey] || 0) + 1;
    const userTurns = (attempt.conversation || []).filter((t) => t.role === 'user');
    return {
      round: attempt.attempt_number || rolePlayRoundByLesson[lessonKey],
      lessonTitle: attempt.lesson_id?.title || 'Role Play',
      moduleTitle: attempt.module_id?.title || null,
      score: attempt.score,
      grade: attempt.grade,
      passed: !!attempt.passed,
      scenarioType: attempt.scenario_type || attempt.scenario?.persona_label || null,
      questionCount: attempt.question_count || userTurns.length,
      submittedAt: attempt.submitted_at,
      summary: attempt.summary?.summary || attempt.summary?.summary_display || null,
      strengths: attempt.summary?.strengths_display || attempt.summary?.strengths || [],
      improvements: attempt.summary?.improvements || [],
      recommendedFocus: attempt.summary?.recommended_focus_display
        || attempt.summary?.recommended_focus
        || null,
    };
  });

  const progressByLessonId = {};
  for (const item of lessonProgress) {
    const key = item.lesson_id?._id?.toString() || item.lesson_id?.toString();
    if (key) progressByLessonId[key] = item;
  }

  const lessonRows = lessons.map((lesson) => {
    const key = lesson._id.toString();
    const prog = progressByLessonId[key];
    const mod = modules.find((m) => m._id.toString() === (lesson.module_id?._id || lesson.module_id)?.toString());
    const completed = completedLessonIds.has(key) || prog?.status === 'completed';
    return {
      title: lesson.title,
      moduleTitle: mod?.title || null,
      status: completed ? 'completed' : (prog?.status || 'not_started'),
      score: prog?.score ?? null,
      watchPercent: prog?.watch_percent ?? (completed ? 100 : 0),
      completedAt: prog?.completed_at || null,
    };
  });

  return {
    generatedAt: new Date(),
    trainee: {
      id: trainee._id,
      name: trainee.name,
      email: trainee.email,
      phone: trainee.phone || null,
    },
    course: {
      id: course._id,
      title: course.title,
      passingScore: course.passing_score || 60,
    },
    enrollment: {
      status: enrollment.status || 'not_started',
      progress,
      bestScore: enrollment.best_score ?? null,
      enrolledAt: enrollment.createdAt || enrollment.enrolled_at || null,
      completedAt: enrollment.completed_at || null,
    },
    completion: {
      progress,
      totalLessons,
      completedLessons,
      totalModules: modules.length,
      completedModules,
      assessmentAttemptCount: attempts.length,
      assessmentBest: assessmentScores.length ? Math.max(...assessmentScores) : null,
      assessmentAvg: avg(assessmentScores),
      rolePlayAttemptCount: rolePlayAttempts.length,
      rolePlayBest: rolePlayScores.length ? Math.max(...rolePlayScores) : null,
      rolePlayAvg: avg(rolePlayScores),
    },
    lessonRows,
    assessmentRounds,
    rolePlayRounds,
  };
};

const createCourseReportPdfBuffer = (report) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  doc.rect(0, 0, doc.page.width, 110).fill('#111827');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
    .text('Detailed Course Report', PAGE.left, 34, { width: PAGE.width });
  doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1')
    .text(`Generated on ${formatDate(report.generatedAt)}`, PAGE.left, 68, { width: PAGE.width });

  doc.y = 136;
  sectionTitle(doc, 'Student & Course', 170);
  const metaTop = doc.y + 10;
  addLabelValue(doc, 'Student', report.trainee.name, PAGE.left, metaTop);
  addLabelValue(doc, 'Email', report.trainee.email, 315, metaTop);
  addLabelValue(doc, 'Phone', report.trainee.phone, PAGE.left, metaTop + 48);
  addLabelValue(doc, 'Course', report.course.title, 315, metaTop + 48);
  addLabelValue(doc, 'Enrollment status', report.enrollment.status, PAGE.left, metaTop + 96);
  addLabelValue(doc, 'Completed at', formatDate(report.enrollment.completedAt), 315, metaTop + 96);

  doc.y = metaTop + 160;
  sectionTitle(doc, 'Completion Snapshot', 110);
  const snapTop = doc.y + 8;
  const cards = [
    ['Progress', percent(report.completion.progress)],
    ['Lessons', `${report.completion.completedLessons}/${report.completion.totalLessons}`],
    ['Modules', `${report.completion.completedModules}/${report.completion.totalModules}`],
    ['Assess best', percent(report.completion.assessmentBest)],
    ['Assess avg', percent(report.completion.assessmentAvg)],
    ['Roleplay best', percent(report.completion.rolePlayBest)],
  ];
  cards.forEach(([cardLabel, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = PAGE.left + col * 168;
    const y = snapTop + row * 70;
    doc.roundedRect(x, y, 156, 58, 6).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(15).text(value, x + 10, y + 12, { width: 136 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(cardLabel.toUpperCase(), x + 10, y + 36, { width: 136 });
  });
  doc.y = snapTop + 160;

  sectionTitle(doc, 'Lesson Progress', 80);
  if (!report.lessonRows.length) {
    body(doc, 'No lessons found for this course.');
  } else {
    report.lessonRows.forEach((lesson, index) => {
      ensureRoom(doc, 54);
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
        .text(`${index + 1}. ${lesson.title}`, PAGE.left, doc.y, { width: 340 });
      doc.fillColor('#2563eb').font('Helvetica-Bold').fontSize(10)
        .text(`${lesson.status} · ${percent(lesson.watchPercent)}`, PAGE.left + 340, doc.y - 12, {
          width: 159,
          align: 'right',
        });
      if (lesson.moduleTitle) {
        doc.fillColor('#6b7280').font('Helvetica').fontSize(9)
          .text(`Module: ${lesson.moduleTitle}`, PAGE.left, doc.y, { width: PAGE.width });
      }
      doc.moveDown(0.45);
    });
  }

  doc.moveDown(0.6);
  sectionTitle(doc, `Assessment Rounds (${report.assessmentRounds.length})`, 90);
  if (!report.assessmentRounds.length) {
    body(doc, 'No assessment attempts recorded for this course.');
  }

  report.assessmentRounds.forEach((round) => {
    ensureRoom(doc, 140);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
      .text(`${round.testTitle} — Round ${round.round}`, PAGE.left, doc.y, { width: PAGE.width });
    doc.moveDown(0.25);
    doc.fillColor('#374151').font('Helvetica').fontSize(10)
      .text(
        [
          `Type: ${round.testType}`,
          `Score: ${percent(round.score)} (need ${percent(round.passingScore)})`,
          `Result: ${round.passed ? 'Passed' : 'Not passed'}`,
          `Submitted: ${formatDate(round.submittedAt)}`,
          round.lessonTitle ? `Lesson: ${round.lessonTitle}` : null,
          round.moduleTitle ? `Module: ${round.moduleTitle}` : null,
        ].filter(Boolean).join('  ·  '),
        PAGE.left,
        doc.y,
        { width: PAGE.width, lineGap: 2 },
      );
    doc.moveDown(0.35);
    if (round.feedback) {
      label(doc, 'AI Feedback');
      body(doc, round.feedback);
      doc.moveDown(0.35);
    }
    if (round.rubric && typeof round.rubric === 'object') {
      label(doc, 'Rubric');
      const rubricText = Object.entries(round.rubric)
        .map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v) : valueOrNA(v)}`)
        .join('  |  ');
      body(doc, rubricText || 'N/A');
      doc.moveDown(0.35);
    }

    doc.moveDown(0.4);
  });

  sectionTitle(doc, `Role Play Rounds (${report.rolePlayRounds.length})`, 90);
  if (!report.rolePlayRounds.length) {
    body(doc, 'No role play attempts recorded for this course.');
  }

  report.rolePlayRounds.forEach((round) => {
    ensureRoom(doc, 130);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12)
      .text(`${round.lessonTitle} — Round ${round.round}`, PAGE.left, doc.y, { width: PAGE.width });
    doc.moveDown(0.25);
    doc.fillColor('#374151').font('Helvetica').fontSize(10)
      .text(
        [
          `Score: ${percent(round.score)}`,
          round.grade ? `Grade: ${round.grade}` : null,
          `Result: ${round.passed ? 'Passed' : 'Not passed'}`,
          `Submitted: ${formatDate(round.submittedAt)}`,
          round.scenarioType ? `Persona: ${round.scenarioType}` : null,
        ].filter(Boolean).join('  ·  '),
        PAGE.left,
        doc.y,
        { width: PAGE.width },
      );
    doc.moveDown(0.35);
    if (round.summary) {
      label(doc, 'AI Summary');
      body(doc, round.summary);
      doc.moveDown(0.3);
    }
    if (round.strengths?.length) {
      label(doc, 'Strengths');
      round.strengths.forEach((item) => body(doc, `• ${item}`));
      doc.moveDown(0.25);
    }
    if (round.improvements?.length) {
      label(doc, 'Improvements');
      round.improvements.forEach((item) => {
        const tip = item.tip_display || item.tip || '';
        const area = item.area_display || item.area || 'Area';
        body(doc, `• ${area}: ${tip}`);
      });
      doc.moveDown(0.25);
    }
    if (round.recommendedFocus) {
      label(doc, 'Recommended Focus');
      body(doc, round.recommendedFocus);
      doc.moveDown(0.3);
    }

    doc.moveDown(0.35);
  });

  doc.end();
});

const courseReportFilename = (report) => {
  const slug = `${report.trainee.name}-${report.course.title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'course-report';
  return `${slug}-detailed-report.pdf`;
};

module.exports = {
  buildCourseReportData,
  createCourseReportPdfBuffer,
  courseReportFilename,
};
