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

// ── Bulk report: all enrolled students for a course ───────────────────────────
const buildBulkCourseReportPdfBuffer = async ({ courseId }) => {
  const [course, modules, lessons, enrollments] = await Promise.all([
    Course.findById(courseId).select('title passing_score').lean(),
    Module.find({ course_id: courseId, is_published: true }).select('_id title order').sort({ order: 1 }).lean(),
    Lesson.find({ course_id: courseId, is_published: true }).select('_id title module_id order').sort({ order: 1 }).lean(),
    Enrollment.find({ course_id: courseId })
      .populate('trainee_id', 'name email phone')
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  if (!course) {
    const err = new Error('Course not found'); err.status = 404; throw err;
  }
  if (!enrollments.length) {
    const err = new Error('No students enrolled in this course'); err.status = 404; throw err;
  }

  const isAmericanHairline = (course.title || '').toLowerCase().includes('american hairline');

  const moduleIds = modules.map((m) => m._id);
  const traineeIds = enrollments.map((e) => e.trainee_id?._id || e.trainee_id).filter(Boolean);

  // Batch-fetch all data for the course in one round trip per collection
  const [allAttempts, allRolePlay, allLessonProgress] = await Promise.all([
    Attempt.find({ course_id: courseId, trainee_id: { $in: traineeIds }, status: 'scored' })
      .populate({ path: 'test_id', select: 'title passing_score module_id lesson_id' })
      .sort({ submitted_at: 1 })
      .lean(),
    RolePlayAttempt.find({ course_id: courseId, trainee_id: { $in: traineeIds } })
      .populate('lesson_id', 'title')
      .populate('module_id', 'title')
      .sort({ submitted_at: 1 })
      .lean(),
    LessonProgress.find({ course_id: courseId, trainee_id: { $in: traineeIds } })
      .populate('lesson_id', 'title')
      .lean(),
  ]);

  // Group by trainee
  const attemptsByTrainee = {};
  for (const a of allAttempts) {
    const tid = a.trainee_id.toString();
    (attemptsByTrainee[tid] = attemptsByTrainee[tid] || []).push(a);
  }
  const rolePlayByTrainee = {};
  for (const r of allRolePlay) {
    const tid = r.trainee_id.toString();
    (rolePlayByTrainee[tid] = rolePlayByTrainee[tid] || []).push(r);
  }
  const lessonProgressByTrainee = {};
  for (const lp of allLessonProgress) {
    const tid = lp.trainee_id.toString();
    (lessonProgressByTrainee[tid] = lessonProgressByTrainee[tid] || []).push(lp);
  }

  // Build per-student data
  const students = [];
  for (const enrollment of enrollments) {
    const trainee = enrollment.trainee_id;
    if (!trainee?._id) continue;
    const tid = trainee._id.toString();

    const snapshot = await getModuleCompletionSnapshot({ traineeId: trainee._id, moduleIds });
    const totalLessons = lessons.length;
    const completedLessonIds = snapshot.completedLessonIds || new Set();
    const completedLessons = lessons.filter((l) => completedLessonIds.has(l._id.toString())).length;
    const completedModules = modules.filter((mod) => {
      const key = mod._id.toString();
      return (snapshot.totalByModule[key] || 0) === 0 || (snapshot.completedByModule[key] || 0) >= (snapshot.totalByModule[key] || 0);
    }).length;
    const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : (enrollment.progress || 0);

    const attempts = attemptsByTrainee[tid] || [];
    const rolePlayAttempts = rolePlayByTrainee[tid] || [];
    const lessonProgress = lessonProgressByTrainee[tid] || [];

    const assessmentScores = attempts.map((a) => a.score).filter((s) => s != null);
    const rolePlayScores = rolePlayAttempts.map((a) => a.score).filter((s) => s != null);

    // Assessment rounds (summary only)
    const assessmentRoundByTest = {};
    const assessmentRounds = attempts.map((attempt) => {
      const testKey = attempt.test_id?._id?.toString() || 'unknown';
      assessmentRoundByTest[testKey] = (assessmentRoundByTest[testKey] || 0) + 1;
      return {
        round: assessmentRoundByTest[testKey],
        testTitle: attempt.test_id?.title || 'Assessment',
        score: attempt.score,
        passingScore: attempt.passing_score || attempt.test_id?.passing_score || 60,
        passed: attempt.score != null ? attempt.score >= (attempt.passing_score || attempt.test_id?.passing_score || 60) : false,
        submittedAt: attempt.submitted_at,
        feedback: attempt.ai_feedback || null,
        rubric: attempt.ai_rubric_breakdown || null,
      };
    });

    // Role play rounds (summary only)
    const rolePlayRoundByLesson = {};
    const rolePlayRounds = rolePlayAttempts.map((attempt) => {
      const lessonKey = attempt.lesson_id?._id?.toString() || 'unknown';
      rolePlayRoundByLesson[lessonKey] = (rolePlayRoundByLesson[lessonKey] || 0) + 1;
      return {
        round: attempt.attempt_number || rolePlayRoundByLesson[lessonKey],
        lessonTitle: attempt.lesson_id?.title || 'Role Play',
        moduleTitle: attempt.module_id?.title || null,
        score: attempt.score,
        grade: attempt.grade,
        passed: !!attempt.passed,
        submittedAt: attempt.submitted_at,
        summary: attempt.summary?.summary || attempt.summary?.summary_display || null,
        strengths: attempt.summary?.strengths_display || attempt.summary?.strengths || [],
        improvements: attempt.summary?.improvements || [],
        recommendedFocus: attempt.summary?.recommended_focus_display || attempt.summary?.recommended_focus || null,
      };
    });

    // Lesson rows
    const progressByLessonId = {};
    for (const item of lessonProgress) {
      const key = item.lesson_id?._id?.toString() || item.lesson_id?.toString();
      if (key) progressByLessonId[key] = item;
    }
    const lessonRows = lessons.map((lesson) => {
      const key = lesson._id.toString();
      const prog = progressByLessonId[key];
      const completed = completedLessonIds.has(key) || prog?.status === 'completed';
      return {
        title: lesson.title,
        status: completed ? 'completed' : (prog?.status || 'not_started'),
        watchPercent: prog?.watch_percent ?? (completed ? 100 : 0),
      };
    });

    // Custom for American Hairline
    let chapterRounds = [];
    if (isAmericanHairline) {
      chapterRounds = lessons.map(lesson => {
        const lessonKey = lesson._id.toString();
        let bestRP = null;
        let rpCount = 0;
        rolePlayAttempts.forEach(rp => {
           if ((rp.lesson_id?._id?.toString() || rp.lesson_id?.toString()) === lessonKey) {
               rpCount++;
               if (!bestRP || rp.score > bestRP.score) bestRP = rp;
           }
        });
        let bestAssessment = null;
        let assessCount = 0;
        attempts.forEach(a => {
           if ((a.test_id?.lesson_id?._id?.toString() || a.test_id?.lesson_id?.toString()) === lessonKey) {
               assessCount++;
               if (!bestAssessment || a.score > bestAssessment.score) bestAssessment = a;
           }
        });

        const attemptsCount = rpCount + assessCount;
        if (attemptsCount === 0) {
            return { lessonTitle: lesson.title, attemptsCount: 0, scoreLabel: 'N/A', passed: false };
        }

        let scoreLabel = 'N/A';
        let passed = false;
        let confidence = null;
        let behavioral = null;
        let fumbling = null;
        let weakPoints = [];

        if (bestRP) {
            scoreLabel = percent(bestRP.score);
            passed = !!bestRP.passed;
            if (bestRP.summary) weakPoints = bestRP.summary.improvements || [];
            if (bestRP.rubric && typeof bestRP.rubric === 'object') {
                for (const [k, v] of Object.entries(bestRP.rubric)) {
                    const lk = k.toLowerCase();
                    if (lk.includes('confidence')) confidence = v;
                    if (lk.includes('behavioral') || lk.includes('behavior')) behavioral = v;
                    if (lk.includes('fumbling')) fumbling = v;
                }
            }
        } else if (bestAssessment) {
            scoreLabel = percent(bestAssessment.score);
            passed = bestAssessment.score >= (bestAssessment.passing_score || bestAssessment.test_id?.passing_score || 60);
            if (bestAssessment.ai_feedback) weakPoints = [{ area: 'Feedback', tip: bestAssessment.ai_feedback }];
        }

        return { lessonTitle: lesson.title, attemptsCount, scoreLabel, passed, confidence, behavioral, fumbling, weakPoints };
      });
    }

    students.push({
      name: trainee.name || 'Unknown',
      email: trainee.email || '',
      phone: trainee.phone || null,
      enrollmentStatus: enrollment.status || 'not_started',
      enrolledAt: enrollment.createdAt || null,
      completedAt: enrollment.completed_at || null,
      progress,
      totalLessons,
      completedLessons,
      totalModules: modules.length,
      completedModules,
      assessmentBest: assessmentScores.length ? Math.max(...assessmentScores) : null,
      assessmentAvg: avg(assessmentScores),
      assessmentCount: attempts.length,
      rolePlayBest: rolePlayScores.length ? Math.max(...rolePlayScores) : null,
      rolePlayAvg: avg(rolePlayScores),
      rolePlayCount: rolePlayAttempts.length,
      lessonRows,
      assessmentRounds,
      rolePlayRounds,
      chapterRounds,
    });
  }

  // ── PDF generation ─────────────────────────────────────────────────────────
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const generatedAt = new Date();

    // Cover header
    doc.rect(0, 0, doc.page.width, 120).fill('#111827');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
      .text('Enrolled Students Report', PAGE.left, 30, { width: PAGE.width });
    doc.font('Helvetica').fontSize(11).fillColor('#94a3b8')
      .text(course.title, PAGE.left, 58, { width: PAGE.width });
    doc.font('Helvetica').fontSize(9).fillColor('#64748b')
      .text(`Generated on ${formatDate(generatedAt)}  ·  ${students.length} student${students.length !== 1 ? 's' : ''} enrolled`, PAGE.left, 80, { width: PAGE.width });

    doc.y = 144;

    // ── Summary table ───────────────────────────────────────────────────────
    sectionTitle(doc, 'Enrollment Summary', 80);
    const colWidths = [160, 52, 52, 52, 52, 65, 66];
    const headers = ['Student', 'Progress', 'Lessons', 'Assess', 'RP Best', 'Status', 'Completed'];
    const tableX = PAGE.left;
    const rowH = 22;

    // Header row
    ensureRoom(doc, rowH + 10);
    doc.rect(tableX, doc.y, PAGE.width, rowH).fill('#f1f5f9');
    let cx = tableX + 6;
    headers.forEach((h, i) => {
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8)
        .text(h.toUpperCase(), cx, doc.y + 7, { width: colWidths[i] - 4, align: i > 0 ? 'center' : 'left' });
      cx += colWidths[i];
    });
    doc.y += rowH;

    students.forEach((s, idx) => {
      ensureRoom(doc, rowH);
      if (idx % 2 === 0) doc.rect(tableX, doc.y, PAGE.width, rowH).fill('#f8fafc');
      let x = tableX + 6;
      const rowY = doc.y + 6;
      const cols = [
        s.name,
        percent(s.progress),
        `${s.completedLessons}/${s.totalLessons}`,
        s.assessmentBest != null ? percent(s.assessmentBest) : '—',
        s.rolePlayBest != null ? percent(s.rolePlayBest) : '—',
        s.enrollmentStatus.replace('_', ' '),
        s.completedAt ? formatDate(s.completedAt).split(',')[0] : '—',
      ];
      cols.forEach((val, i) => {
        doc.fillColor('#111827').font('Helvetica').fontSize(9)
          .text(String(val), x, rowY, { width: colWidths[i] - 4, align: i > 0 ? 'center' : 'left' });
        x += colWidths[i];
      });
      doc.y += rowH;
    });

    doc.moveDown(1.2);

    // ── Per-student detail sections ─────────────────────────────────────────
    students.forEach((s) => {
      ensureRoom(doc, 180);

      // Student header bar
      doc.rect(PAGE.left, doc.y, PAGE.width, 34).fill('#1e293b');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13)
        .text(s.name, PAGE.left + 10, doc.y + 6, { width: 300 });
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
        .text(`${s.email}${s.phone ? '  ·  ' + s.phone : ''}`, PAGE.left + 10, doc.y + 22, { width: 300 });
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
        .text(`${percent(s.progress)} complete  ·  ${s.enrollmentStatus.replace('_', ' ')}`, PAGE.left + 315, doc.y + 6, { width: 180, align: 'right' });
      doc.y += 46;

      // Snapshot cards
      const snapCards = [
        ['Progress', percent(s.progress)],
        ['Lessons', `${s.completedLessons}/${s.totalLessons}`],
        ['Modules', `${s.completedModules}/${s.totalModules}`],
        ['Assess best', percent(s.assessmentBest)],
        ['RP best', percent(s.rolePlayBest)],
        ['Assess attempts', String(s.assessmentCount)],
      ];
      ensureRoom(doc, 80);
      const snapTop = doc.y + 6;
      snapCards.forEach(([cardLabel, value], index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = PAGE.left + col * 168;
        const y = snapTop + row * 58;
        doc.roundedRect(x, y, 156, 48, 5).fillAndStroke('#f8fafc', '#e5e7eb');
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(13).text(value, x + 8, y + 8, { width: 140 });
        doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(cardLabel.toUpperCase(), x + 8, y + 30, { width: 140 });
      });
      doc.y = snapTop + (Math.ceil(snapCards.length / 3)) * 58 + 10;

      if (isAmericanHairline) {
         if (s.chapterRounds && s.chapterRounds.length) {
            sectionTitle(doc, 'Chapter Progress & Analysis', 60);
            s.chapterRounds.forEach(chapter => {
               ensureRoom(doc, 100);
               doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
                  .text(chapter.lessonTitle, PAGE.left, doc.y, { width: PAGE.width });
               doc.moveDown(0.2);

               const statusLine = [
                 `Best Score: ${chapter.scoreLabel}`,
                 `Attempts: ${chapter.attemptsCount}`,
                 `Result: ${chapter.attemptsCount === 0 ? 'Pending' : (chapter.passed ? 'Passed ✓' : 'Not passed')}`
               ].join('  |  ');

               doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9)
                  .text(statusLine, PAGE.left, doc.y, { width: PAGE.width });
               doc.moveDown(0.3);

               if (chapter.attemptsCount > 0) {
                  if (chapter.confidence || chapter.behavioral || chapter.fumbling) {
                      label(doc, 'QUALITATIVE ASPECTS');
                      if (chapter.confidence) body(doc, `  Confidence:        ${chapter.confidence}`, { size: 9 });
                      if (chapter.behavioral) body(doc, `  Behavioral Skills: ${chapter.behavioral}`, { size: 9 });
                      if (chapter.fumbling)   body(doc, `  Fumbling:          ${chapter.fumbling}`, { size: 9 });
                      doc.moveDown(0.3);
                  }

                  if (chapter.weakPoints && chapter.weakPoints.length) {
                      label(doc, 'WEAK POINTS');
                      chapter.weakPoints.forEach(wp => {
                          const tip = wp.tip_display || wp.tip || wp;
                          const area = wp.area_display || wp.area || 'Area';
                          if (typeof wp === 'string') {
                             body(doc, `• ${wp}`, { size: 9 });
                          } else {
                             body(doc, `• ${area}: ${tip}`, { size: 9 });
                          }
                      });
                      doc.moveDown(0.3);
                  }
               }
               doc.moveDown(0.4);
            });
         }
      } else {
        // Lesson progress
      if (s.lessonRows.length) {
        sectionTitle(doc, 'Lesson Progress', 50);
        s.lessonRows.forEach((lesson, index) => {
          ensureRoom(doc, 22);
          const completed = lesson.status === 'completed';
          doc.fillColor(completed ? '#16a34a' : '#9ca3af').font('Helvetica').fontSize(9)
            .text(`${index + 1}. ${lesson.title}`, PAGE.left, doc.y, { width: 370 });
          doc.fillColor(completed ? '#16a34a' : '#9ca3af').font('Helvetica-Bold').fontSize(9)
            .text(`${lesson.status}  ${percent(lesson.watchPercent)}`, PAGE.left + 370, doc.y - 12, { width: 129, align: 'right' });
          doc.moveDown(0.3);
        });
        doc.moveDown(0.4);
      }

      // Assessment rounds
      if (s.assessmentRounds.length) {
        sectionTitle(doc, `Assessment Rounds (${s.assessmentRounds.length})`, 60);
        s.assessmentRounds.forEach((round) => {
          ensureRoom(doc, 100);
          doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
            .text(`${round.testTitle} — Round ${round.round}`, PAGE.left, doc.y, { width: PAGE.width });
          doc.moveDown(0.2);
          doc.fillColor('#374151').font('Helvetica').fontSize(9)
            .text([
              `Score: ${percent(round.score)} (need ${percent(round.passingScore)})`,
              `Result: ${round.passed ? 'Passed ✓' : 'Not passed'}`,
              `Submitted: ${formatDate(round.submittedAt)}`,
            ].join('  ·  '), PAGE.left, doc.y, { width: PAGE.width });
          doc.moveDown(0.3);
          if (round.feedback) {
            label(doc, 'AI Feedback');
            body(doc, round.feedback);
            doc.moveDown(0.3);
          }
          if (round.rubric && typeof round.rubric === 'object') {
            label(doc, 'Rubric');
            body(doc, Object.entries(round.rubric).map(([k, v]) => `${k}: ${typeof v === 'number' ? Math.round(v) : v}`).join('  |  '));
            doc.moveDown(0.3);
          }
          doc.moveDown(0.3);
        });
      }

      // Role play rounds
      if (s.rolePlayRounds.length) {
        sectionTitle(doc, `Role Play Rounds (${s.rolePlayRounds.length})`, 60);
        s.rolePlayRounds.forEach((round) => {
          ensureRoom(doc, 100);
          doc.fillColor('#111827').font('Helvetica-Bold').fontSize(10)
            .text(`${round.lessonTitle} — Round ${round.round}`, PAGE.left, doc.y, { width: PAGE.width });
          doc.moveDown(0.2);
          doc.fillColor('#374151').font('Helvetica').fontSize(9)
            .text([
              `Score: ${percent(round.score)}`,
              round.grade ? `Grade: ${round.grade}` : null,
              `Result: ${round.passed ? 'Passed ✓' : 'Not passed'}`,
              `Submitted: ${formatDate(round.submittedAt)}`,
            ].filter(Boolean).join('  ·  '), PAGE.left, doc.y, { width: PAGE.width });
          doc.moveDown(0.3);
          if (round.summary) { label(doc, 'AI Summary'); body(doc, round.summary); doc.moveDown(0.25); }
          if (round.strengths?.length) {
            label(doc, 'Strengths');
            round.strengths.forEach((item) => body(doc, `• ${item}`));
            doc.moveDown(0.2);
          }
          if (round.improvements?.length) {
            label(doc, 'Improvements');
            round.improvements.forEach((item) => {
              const tip = item.tip_display || item.tip || '';
              const area = item.area_display || item.area || 'Area';
              body(doc, `• ${area}: ${tip}`);
            });
            doc.moveDown(0.2);
          }
          if (round.recommendedFocus) { label(doc, 'Recommended Focus'); body(doc, round.recommendedFocus); doc.moveDown(0.2); }
          doc.moveDown(0.4);
        });
      }
      } // End of !isAmericanHairline block

      doc.moveDown(0.8);
      // Divider between students
      ensureRoom(doc, 20);
      doc.moveTo(PAGE.left, doc.y).lineTo(PAGE.left + PAGE.width, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.moveDown(0.8);
    });

    doc.end();
  });
};

const bulkCourseReportFilename = (courseTitle) => {
  const slug = (courseTitle || 'course')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug}-all-students-report.pdf`;
};

module.exports = {
  buildCourseReportData,
  createCourseReportPdfBuffer,
  courseReportFilename,
  buildBulkCourseReportPdfBuffer,
  bulkCourseReportFilename,
};
