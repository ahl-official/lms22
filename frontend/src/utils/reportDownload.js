const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const slugify = (value) => String(value || 'report')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'report';

const formatDate = (value) => {
  if (!value) return 'Not recorded';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return 'Not recorded';
  }
};

const percent = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : 'N/A';
};

const derivedQuestionScore = (qa, attempt) => {
  const directScore = Number(qa?.score);
  if (qa?.score !== null && qa?.score !== undefined && qa?.score !== '' && Number.isFinite(directScore)) {
    return {
      value: Math.max(0, Math.min(10, directScore)),
      text: `${Math.round(directScore * 10) / 10}/10`,
      source: 'question',
    };
  }

  const earned = Number(qa?.earned_points);
  const points = Number(qa?.points);
  if (Number.isFinite(earned) && Number.isFinite(points) && points > 0) {
    const value = Math.max(0, Math.min(10, (earned / points) * 10));
    return {
      value,
      text: `${Math.round(value * 10) / 10}/10 (${qa.earned_points}/${qa.points} pts)`,
      source: 'points',
    };
  }

  if (typeof qa?.is_correct === 'boolean') {
    return {
      value: qa.is_correct ? 10 : 0,
      text: qa.is_correct ? '10/10' : '0/10',
      source: 'correctness',
    };
  }

  const overall = Number(attempt?.score);
  if (Number.isFinite(overall)) {
    return {
      value: overall / 10,
      text: `Overall ${Math.round(overall)}%`,
      source: 'overall',
    };
  }

  return { value: null, text: 'Score not saved', source: 'missing' };
};

const questionScoreText = (qa, attempt) => {
  return derivedQuestionScore(qa, attempt).text;
};

const buildStats = (attempt) => {
  const qas = attempt.qa || [];
  const answered = qas.filter(qa => String(qa.answer || '').trim() && qa.answer !== '(no response)').length;
  const scoredQuestions = qas
    .map((qa, index) => ({ qa, index, ...derivedQuestionScore(qa, attempt) }))
    .filter(item => Number.isFinite(item.value));
  const numericScores = scoredQuestions.map(item => item.value);
  const averageQuestionScore = numericScores.length
    ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
    : null;
  const strongest = scoredQuestions.length
    ? scoredQuestions.reduce((best, item) => item.value > best.value ? item : best)
    : null;
  const needsFocus = scoredQuestions.length
    ? scoredQuestions.reduce((low, item) => item.value < low.value ? item : low)
    : null;

  return {
    totalQuestions: qas.length,
    answered,
    unanswered: Math.max(0, qas.length - answered),
    averageQuestionScore,
    strongest,
    needsFocus,
  };
};

export function downloadAssessmentReport({ student, attempt, portal = 'LMS' }) {
  const stats = buildStats(attempt);
  const generatedAt = new Date();
  const passStatus = attempt.passed ? 'Passed' : 'Not passed';
  const rows = (attempt.qa || []).map((qa, index) => `
    <section class="qa">
      <div class="qa-head">
        <h3>Question ${index + 1}</h3>
        <span>${escapeHtml(questionScoreText(qa, attempt))}</span>
      </div>
      <p class="label">Question</p>
      <p>${escapeHtml(qa.question || 'Question not saved')}</p>
      <p class="label">Student Answer</p>
      <p>${escapeHtml(qa.answer || 'No answer saved')}</p>
      ${qa.feedback ? `<p class="label">Bot Feedback</p><p>${escapeHtml(qa.feedback)}</p>` : ''}
      ${qa.correct_answer ? `<p class="label">Expected Answer</p><p>${escapeHtml(qa.correct_answer)}</p>` : ''}
    </section>
  `).join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(student.name)} - Assessment Report</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#172033;background:#f6f7fb;margin:0;padding:32px}
    main{max-width:920px;margin:0 auto;background:#fff;border:1px solid #e6e8ef;border-radius:16px;overflow:hidden}
    header{padding:32px;background:#172033;color:#fff}
    h1{margin:0;font-size:28px} h2{margin:0 0 12px;font-size:18px} h3{margin:0;font-size:15px}
    .muted{color:#cbd5e1;margin-top:8px}.section{padding:24px 32px;border-top:1px solid #eef1f6}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{background:#f8fafc;border:1px solid #e6e8ef;border-radius:12px;padding:14px}
    .stat b{display:block;font-size:22px;color:#172033}.stat span{font-size:12px;color:#64748b}
    .meta{display:grid;grid-template-columns:180px 1fr;gap:8px 16px;font-size:14px}.meta b{color:#64748b}
    .summary{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px;line-height:1.5}
    .muted-note{font-size:12px;color:#64748b;margin:12px 0 0}
    .qa{padding:18px 0;border-top:1px solid #eef1f6}.qa:first-child{border-top:0}
    .qa-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.qa-head span{font-weight:800;color:#2563eb}
    .label{margin:14px 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:800}
    p{line-height:1.55}.footer{padding:18px 32px;color:#64748b;font-size:12px;border-top:1px solid #eef1f6}
    @media print{body{background:#fff;padding:0}main{border:0;border-radius:0}.section{break-inside:avoid}.qa{break-inside:avoid}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Assessment Report</h1>
      <p class="muted">Generated by ${escapeHtml(portal)} on ${escapeHtml(formatDate(generatedAt))}</p>
    </header>
    <section class="section">
      <h2>Student and Assessment</h2>
      <div class="meta">
        <b>Student</b><span>${escapeHtml(student.name || 'Unknown student')}</span>
        <b>Email</b><span>${escapeHtml(student.email || 'N/A')}</span>
        <b>Phone</b><span>${escapeHtml(student.phone || 'N/A')}</span>
        <b>Course</b><span>${escapeHtml(attempt.course_title || 'N/A')}</span>
        <b>Module</b><span>${escapeHtml(attempt.module_title || 'N/A')}</span>
        <b>Lesson / Chapter</b><span>${escapeHtml(attempt.lesson_title || attempt.title || 'N/A')}</span>
        <b>Assessment</b><span>${escapeHtml(attempt.title || 'Assessment')}</span>
        <b>Submitted</b><span>${escapeHtml(formatDate(attempt.date))}</span>
      </div>
    </section>
    <section class="section">
      <h2>Score Snapshot</h2>
      <div class="grid">
        <div class="stat"><b>${escapeHtml(percent(attempt.score))}</b><span>Overall score</span></div>
        <div class="stat"><b>${escapeHtml(passStatus)}</b><span>Status</span></div>
        <div class="stat"><b>${stats.answered}/${stats.totalQuestions}</b><span>Answered</span></div>
        <div class="stat"><b>${stats.averageQuestionScore == null ? 'N/A' : `${stats.averageQuestionScore}/10`}</b><span>Avg question score</span></div>
      </div>
      ${(attempt.qa || []).some(qa => derivedQuestionScore(qa, attempt).source === 'overall')
        ? '<p class="muted-note">Some question-level scores were not stored on older attempts, so the report shows the overall assessment score for those rows.</p>'
        : ''}
    </section>
    <section class="section">
      <h2>Bot Summary</h2>
      <div class="summary">${escapeHtml(attempt.feedback || attempt.summary || 'No summary feedback saved for this assessment.')}</div>
      <p><b>Strongest question:</b> ${stats.strongest ? `Question ${stats.strongest.index + 1} (${questionScoreText(stats.strongest.qa, attempt)})` : 'N/A'}</p>
      <p><b>Needs focus:</b> ${stats.needsFocus ? `Question ${stats.needsFocus.index + 1} (${questionScoreText(stats.needsFocus.qa, attempt)})` : 'N/A'}</p>
    </section>
    <section class="section">
      <h2>Question and Answer Breakdown</h2>
      ${rows || '<p>No questions and answers saved for this assessment.</p>'}
    </section>
    <div class="footer">This report is generated from saved LMS assessment history.</div>
  </main>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(student.name)}-${slugify(attempt.title)}-assessment-report.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
