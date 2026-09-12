/** Preview/demo trainees that bypass Role Play gates for assessment access. */
const DEMO_FULL_ACCESS_EMAILS = new Set([
  'preview.hindi.demo@lms.local',
]);

const hasDemoFullAccess = (user) => {
  const email = (user?.email || '').toString().trim().toLowerCase();
  return DEMO_FULL_ACCESS_EMAILS.has(email);
};

module.exports = {
  DEMO_FULL_ACCESS_EMAILS,
  hasDemoFullAccess,
};
