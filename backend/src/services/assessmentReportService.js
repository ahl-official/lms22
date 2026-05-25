const PDFDocument = require('pdfkit');

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

const scoreValue = (qa, attempt) => {
  const direct = qa?.answer_score ?? qa?.score;
  const directNumber = Number(direct);
  if (direct !== null && direct !== undefined && direct !== '' && Number.isFinite(directNumber)) {
    return Math.max(0, Math.min(10, directNumber));
  }

  const earned = Number(qa?.earned_points);
  const points = Number(qa?.points);
  if (Number.isFinite(earned) && Number.isFinite(points) && points > 0) {
    return Math.max(0, Math.min(10, (earned / points) * 10));
  }

  if (typeof qa?.is_correct === 'boolean') {
    return qa.is_correct ? 10 : 0;
  }

  if (attempt?.score !== null && attempt?.score !== undefined && attempt?.score !== '') {
    const overall = Number(attempt.score);
    if (Number.isFinite(overall)) return overall / 10;
  }
  return null;
};

const scoreText = (qa, attempt) => {
  const direct = qa?.answer_score ?? qa?.score;
  const directNumber = Number(direct);
  if (direct !== null && direct !== undefined && direct !== '' && Number.isFinite(directNumber)) {
    return `${Math.round(directNumber * 10) / 10}/10`;
  }

  const earned = Number(qa?.earned_points);
  const points = Number(qa?.points);
  if (Number.isFinite(earned) && Number.isFinite(points) && points > 0) {
    const score = Math.max(0, Math.min(10, (earned / points) * 10));
    return `${Math.round(score * 10) / 10}/10 (${earned}/${points} pts)`;
  }

  if (typeof qa?.is_correct === 'boolean') return qa.is_correct ? '10/10' : '0/10';

  if (attempt?.score !== null && attempt?.score !== undefined && attempt?.score !== '') {
    const overall = Number(attempt.score);
    if (Number.isFinite(overall)) return `Overall ${Math.round(overall)}%`;
  }
  return 'N/A';
};

const parseTranscriptPairs = (voiceTranscript) => {
  if (!voiceTranscript) return [];
  const pairs = [];
  const regex = /Q:\s*([\s\S]*?)\nA:\s*([\s\S]*?)(?=\n\nQ:|$)/g;
  let match;
  while ((match = regex.exec(voiceTranscript)) !== null) {
    pairs.push({
      question: (match[1] || '').trim(),
      answer: (match[2] || '').trim(),
    });
  }
  return pairs;
};

const buildQuestionRows = (attempt, test) => {
  if (Array.isArray(attempt?.questions_snapshot) && attempt.questions_snapshot.length) {
    return attempt.questions_snapshot.map((question, index) => ({
      question: question.question || question.prompt || `Question ${index + 1}`,
      answer: question.user_answer ?? '',
      score: scoreText(question, attempt),
      numericScore: scoreValue(question, attempt),
      feedback: question.feedback || question.spoken_feedback || null,
      correctAnswer: question.correct_answer || question.expected_answer || null,
      earnedPoints: question.earned_points ?? null,
      points: question.points ?? null,
    }));
  }

  const transcriptRows = parseTranscriptPairs(attempt?.voice_transcript);
  if (transcriptRows.length) {
    return transcriptRows.map((row, index) => ({
      ...row,
      score: scoreText(row, attempt),
      numericScore: scoreValue(row, attempt),
      feedback: null,
      correctAnswer: test?.questions?.[index]?.correct_answer || test?.questions?.[index]?.expected_answer || null,
    }));
  }

  const questions = test?.questions || [];
  const answers = attempt?.answers || {};
  return questions.map((question, index) => {
    const answer = answers[index] ?? answers[String(index)] ?? answers[question._id] ?? '';
    const row = {
      question: question.question || question.prompt || `Question ${index + 1}`,
      answer,
      correct_answer: question.correct_answer || null,
      points: question.points ?? null,
    };
    return {
      question: row.question,
      answer,
      score: scoreText(row, attempt),
      numericScore: scoreValue(row, attempt),
      feedback: null,
      correctAnswer: row.correct_answer,
      points: row.points,
    };
  });
};

const buildAssessmentReportData = ({ attempt, trainee, trainer, course, test }) => {
  const questionRows = buildQuestionRows(attempt, test);
  const answered = questionRows.filter(row => {
    const answer = String(row.answer || '').trim();
    return answer && answer !== '(no response)';
  }).length;
  const numericScores = questionRows
    .map(row => row.numericScore)
    .filter(score => Number.isFinite(score));
  const averageQuestionScore = numericScores.length
    ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
    : null;
  const strongestIndex = numericScores.length
    ? questionRows.reduce((best, row, index) => (
      Number.isFinite(row.numericScore) && row.numericScore > questionRows[best].numericScore ? index : best
    ), questionRows.findIndex(row => Number.isFinite(row.numericScore)))
    : -1;
  const needsFocusIndex = numericScores.length
    ? questionRows.reduce((low, row, index) => (
      Number.isFinite(row.numericScore) && row.numericScore < questionRows[low].numericScore ? index : low
    ), questionRows.findIndex(row => Number.isFinite(row.numericScore)))
    : -1;

  const passingScore = attempt?.passing_score || test?.passing_score || 60;
  const overallScore = Number.isFinite(Number(attempt?.score)) ? Number(attempt.score) : null;

  return {
    generatedAt: new Date(),
    traineeName: trainee?.name || 'Trainee',
    traineeEmail: trainee?.email || null,
    traineePhone: trainee?.phone || null,
    trainerName: trainer?.name || null,
    courseTitle: course?.title || 'Course',
    moduleTitle: test?.module_id?.title || null,
    lessonTitle: test?.lesson_id?.title || null,
    testTitle: test?.title || 'Assessment',
    testType: attempt?.test_type || test?.test_type || 'assessment',
    submittedAt: attempt?.submitted_at,
    overallScore,
    passingScore,
    passed: overallScore !== null ? overallScore >= passingScore : false,
    feedback: attempt?.ai_feedback || null,
    questionRows,
    stats: {
      totalQuestions: questionRows.length,
      answered,
      unanswered: Math.max(0, questionRows.length - answered),
      averageQuestionScore,
      strongest: strongestIndex >= 0 ? strongestIndex + 1 : null,
      needsFocus: needsFocusIndex >= 0 ? needsFocusIndex + 1 : null,
    },
  };
};

const addLabelValue = (doc, label, value, x, y, width = 250) => {
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#64748b').text(label.toUpperCase(), x, y, { width });
  doc.font('Helvetica').fontSize(11).fillColor('#111827').text(valueOrNA(value), x, y + 13, { width });
};

const ensureRoom = (doc, height = 120) => {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
};

const createAssessmentReportPdfBuffer = (report) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true });
  const chunks = [];
  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  doc.rect(0, 0, doc.page.width, 110).fill('#111827');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24).text('Assessment Report', 48, 36);
  doc.font('Helvetica').fontSize(10).fillColor('#cbd5e1')
    .text(`Generated on ${formatDate(report.generatedAt)}`, 48, 69);

  doc.y = 140;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Student and Assessment');
  const metaTop = doc.y + 14;
  addLabelValue(doc, 'Student', report.traineeName, 48, metaTop);
  addLabelValue(doc, 'Phone', report.traineePhone, 315, metaTop);
  addLabelValue(doc, 'Course', report.courseTitle, 48, metaTop + 48);
  addLabelValue(doc, 'Module', report.moduleTitle, 315, metaTop + 48);
  addLabelValue(doc, 'Lesson / Chapter', report.lessonTitle, 48, metaTop + 96);
  addLabelValue(doc, 'Assessment', report.testTitle, 315, metaTop + 96);
  addLabelValue(doc, 'Type', report.testType, 48, metaTop + 144);
  addLabelValue(doc, 'Submitted', formatDate(report.submittedAt), 315, metaTop + 144);

  doc.y = metaTop + 205;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Score Snapshot');
  const scoreTop = doc.y + 12;
  const scoreCards = [
    ['Overall', percent(report.overallScore)],
    ['Result', report.passed ? 'Passed' : 'Not passed'],
    ['Answered', `${report.stats.answered}/${report.stats.totalQuestions}`],
    ['Avg Question', report.stats.averageQuestionScore == null ? 'N/A' : `${report.stats.averageQuestionScore}/10`],
  ];
  scoreCards.forEach(([label, value], index) => {
    const x = 48 + index * 126;
    doc.roundedRect(x, scoreTop, 112, 58, 6).fillAndStroke('#f8fafc', '#e5e7eb');
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(value, x + 10, scoreTop + 13, { width: 92 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(8).text(label.toUpperCase(), x + 10, scoreTop + 37, { width: 92 });
  });

  doc.y = scoreTop + 84;
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Bot Summary');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#374151')
    .text(report.feedback || 'No summary feedback saved for this assessment.', { lineGap: 3 });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10)
    .text(`Strongest question: ${report.stats.strongest ? `Question ${report.stats.strongest}` : 'N/A'}`);
  doc.text(`Needs focus: ${report.stats.needsFocus ? `Question ${report.stats.needsFocus}` : 'N/A'}`);

  doc.moveDown(1);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(14).text('Question and Answer Breakdown');
  if (!report.questionRows.length) {
    doc.moveDown(0.5).font('Helvetica').fontSize(10).fillColor('#374151')
      .text('No questions and answers were saved for this assessment.');
  }

  report.questionRows.forEach((row, index) => {
    ensureRoom(doc, 150);
    doc.moveDown(0.8);
    const startY = doc.y;
    doc.roundedRect(48, startY, doc.page.width - 96, 1, 0).fill('#e5e7eb');
    doc.y = startY + 12;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
      .text(`Question ${index + 1}`, 48, doc.y, { continued: true });
    doc.fillColor('#2563eb').text(`    ${row.score}`, { align: 'right' });
    doc.moveDown(0.4);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('QUESTION');
    doc.fillColor('#111827').font('Helvetica').fontSize(10).text(valueOrNA(row.question), { lineGap: 3 });
    doc.moveDown(0.4);
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('STUDENT ANSWER');
    doc.fillColor('#111827').font('Helvetica').fontSize(10).text(valueOrNA(row.answer || 'No answer saved'), { lineGap: 3 });
    if (row.feedback) {
      doc.moveDown(0.4);
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('BOT FEEDBACK');
      doc.fillColor('#111827').font('Helvetica').fontSize(10).text(row.feedback, { lineGap: 3 });
    }
    if (row.correctAnswer) {
      doc.moveDown(0.4);
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(8).text('EXPECTED ANSWER');
      doc.fillColor('#111827').font('Helvetica').fontSize(10).text(row.correctAnswer, { lineGap: 3 });
    }
  });

  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i += 1) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
      .text(`AhlaiTeam LMS - Page ${i + 1} of ${pageCount}`, 48, doc.page.height - 32, { align: 'center' });
  }

  doc.end();
});

const reportFilename = (report) => {
  const slug = `${report.traineeName}-${report.testTitle}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'assessment-report';
  return `${slug}-report.pdf`;
};

module.exports = {
  buildAssessmentReportData,
  createAssessmentReportPdfBuffer,
  reportFilename,
  scoreText,
};
