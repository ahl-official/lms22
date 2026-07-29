/** Shared role-play style options for categories (Step 1+). */
const ROLEPLAY_TYPES = [
  {
    value: 'auto',
    label: 'Let AI choose',
    description: 'AI picks trainee and counterpart roles from the course and lesson.',
  },
  {
    value: 'sales',
    label: 'Sales / Consultation',
    description: 'Trainee is a consultant/salesperson; AI is a customer.',
  },
  {
    value: 'technical_service',
    label: 'Technical service',
    description: 'Trainee is a technician/stylist; AI is a client receiving service.',
  },
  {
    value: 'content',
    label: 'Content / Creative',
    description: 'Trainee is a content/design creator; AI is a manager or stakeholder.',
  },
  {
    value: 'support',
    label: 'Customer support',
    description: 'Trainee handles queries or complaints; AI is a customer/user.',
  },
  {
    value: 'internal',
    label: 'Internal / Operations',
    description: 'Trainee is staff; AI is a colleague, manager, or process partner.',
  },
];

const ROLEPLAY_TYPE_VALUES = ROLEPLAY_TYPES.map((t) => t.value);
const DEFAULT_ROLEPLAY_TYPE = 'auto';

const isValidRolePlayType = (value) => ROLEPLAY_TYPE_VALUES.includes(value);

const normalizeRolePlayType = (value) =>
  (isValidRolePlayType(value) ? value : DEFAULT_ROLEPLAY_TYPE);

const rolePlayTypeLabel = (value) =>
  ROLEPLAY_TYPES.find((t) => t.value === normalizeRolePlayType(value))?.label
  || ROLEPLAY_TYPES[0].label;

/**
 * Framing used by persona/scenario/turn/summary prompts.
 * character = AI role; trainee = student role.
 */
const getRolePlayFrame = (type, { courseTitle = '', categoryName = '', lessonTitle = '' } = {}) => {
  const roleplayType = normalizeRolePlayType(type);
  const contextLine = [
    categoryName && `Category: ${categoryName}`,
    courseTitle && `Course: ${courseTitle}`,
    lessonTitle && `Lesson: ${lessonTitle}`,
  ].filter(Boolean).join(' | ');

  const frames = {
    sales: {
      roleplay_type: 'sales',
      trainee_role: 'consultant / salesperson',
      trainee_label: 'Consultant',
      character_kind: 'customer / client',
      character_label: 'Customer',
      mode_label: 'Sales / Consultation',
      persona_rules: `
- Each persona must be a CUSTOMER or CLIENT.
- Never make the persona a trainer, consultant, or salesperson.
- Focus on buying questions, objections, trust, price, timing, and next steps.`,
      scenario_rules: `
- The CHARACTER is a CUSTOMER/CLIENT.
- The TRAINEE is a consultant/salesperson.
- opening_line must be a customer question, concern, or objection — not a sales pitch.
- Goal: what the trainee (consultant) must accomplish using the lesson.`,
      turn_rules: `
- YOU are the CUSTOMER. The trainee is the consultant/salesperson.
- React as a cooperative customer: ask one follow-up, accept helpful answers, move toward next steps.
- Do NOT roleplay as a consultant.
- Score whether a real client would feel helped.`,
      fallback_personas: (title) => ([
        {
          key: 'curious-client',
          label: 'Curious Client',
          customer_name: 'Riya',
          customer_role: `a first-time client learning about ${title}`,
          situation: 'They are interested but need a simple explanation before moving forward.',
          concern: 'They want to understand the service, cost, and next step clearly.',
          goal: 'Help the client feel informed and guide them toward the right next step.',
          focus_areas: ['explain simply', 'reassure', 'guide next step'],
        },
        {
          key: 'cautious-buyer',
          label: 'Cautious Buyer',
          customer_name: 'Raj',
          customer_role: `a cautious client comparing options from ${title}`,
          situation: 'They are interested but worried about choosing the wrong option.',
          concern: 'They need confidence and a reason to trust the recommendation.',
          goal: 'Answer their concern, connect it to the lesson, and offer a next step.',
          focus_areas: ['build trust', 'clarify concern', 'recommend next step'],
        },
      ]),
    },
    technical_service: {
      roleplay_type: 'technical_service',
      trainee_role: 'technician / stylist / service expert',
      trainee_label: 'Technician',
      character_kind: 'client receiving the service',
      character_label: 'Client',
      mode_label: 'Technical service',
      persona_rules: `
- Each persona must be a CLIENT receiving or preparing for a technical service.
- Never make the persona the technician or trainer.
- Focus on process, safety, results, aftercare, timing, and comfort.`,
      scenario_rules: `
- The CHARACTER is a CLIENT receiving technical service.
- The TRAINEE is the technician/stylist/service expert.
- opening_line must be a client question about procedure, result, risk, aftercare, or preparation.
- Goal: what the trainee (technician) must explain or do using the lesson.`,
      turn_rules: `
- YOU are the CLIENT. The trainee is the technician/service expert.
- Ask practical questions about the service, results, and aftercare.
- Accept clear technical explanations and move forward.
- Score whether the trainee applied the lesson's technical knowledge clearly and safely.`,
      fallback_personas: (title) => ([
        {
          key: 'first-time-client',
          label: 'First-time Client',
          customer_name: 'Ananya',
          customer_role: `a first-time client asking about ${title}`,
          situation: 'They want to understand the procedure before starting.',
          concern: 'They worry about safety, steps, and what happens after.',
          goal: 'Explain the process clearly using the lesson and reassure the client.',
          focus_areas: ['process steps', 'safety', 'aftercare'],
        },
        {
          key: 'results-focused-client',
          label: 'Results-focused Client',
          customer_name: 'Vikram',
          customer_role: `a client focused on outcomes for ${title}`,
          situation: 'They want realistic expectations about results and maintenance.',
          concern: 'They need clarity on results timeline and care.',
          goal: 'Set realistic expectations and guide correct aftercare from the lesson.',
          focus_areas: ['results', 'timeline', 'maintenance'],
        },
      ]),
    },
    content: {
      roleplay_type: 'content',
      trainee_role: 'content creator / designer / creative team member',
      trainee_label: 'Content Creator',
      character_kind: 'manager / brand stakeholder / editor / brief owner',
      character_label: 'Stakeholder',
      mode_label: 'Content / Creative',
      persona_rules: `
- Each persona must be a MANAGER, EDITOR, BRAND STAKEHOLDER, or BRIEF OWNER.
- Never make the persona a sales customer buying a salon service.
- Focus on briefs, revisions, brand tone, deadlines, platforms, and creative feedback.`,
      scenario_rules: `
- The CHARACTER is a stakeholder (manager/editor/brand owner).
- The TRAINEE is a content creator/designer applying the lesson.
- opening_line must be a brief, revision request, or feedback question — not a purchase objection.
- Goal: what the trainee (creator) must deliver or clarify using the lesson.`,
      turn_rules: `
- YOU are the STAKEHOLDER. The trainee is the content creator.
- Give briefs, ask for revisions, or challenge creative choices using workplace language.
- Do NOT act like a retail customer.
- Score whether the trainee applied lesson rules for content/creative work.`,
      fallback_personas: (title) => ([
        {
          key: 'brand-manager',
          label: 'Brand Manager',
          customer_name: 'Meera',
          customer_role: `a brand manager reviewing work related to ${title}`,
          situation: 'They need content that matches brand tone and the brief.',
          concern: 'They are unsure the draft follows the required style and message.',
          goal: 'Apply the lesson to revise or defend the content clearly.',
          focus_areas: ['brand tone', 'brief fit', 'clear revision'],
        },
        {
          key: 'tight-deadline-editor',
          label: 'Editor on Deadline',
          customer_name: 'Kabir',
          customer_role: `an editor needing a quick turnaround on ${title}`,
          situation: 'They need a corrected version before publishing.',
          concern: 'They need fast, accurate changes without losing quality.',
          goal: 'Use the lesson to prioritize fixes and deliver a clean update.',
          focus_areas: ['priority fixes', 'clarity', 'publish readiness'],
        },
      ]),
    },
    support: {
      roleplay_type: 'support',
      trainee_role: 'customer / front-desk / compliance support agent',
      trainee_label: 'Support Agent',
      character_kind: 'customer or user with a problem',
      character_label: 'Customer',
      mode_label: 'Customer support',
      persona_rules: `
- Each persona must be a CUSTOMER/USER with a support issue, complaint, or request.
- Never make the persona the support agent.
- Focus on issues, escalation, policy, empathy, and resolution steps.`,
      scenario_rules: `
- The CHARACTER is a customer/user with a problem.
- The TRAINEE is the support/front-desk agent.
- opening_line must describe a support issue or complaint.
- Goal: what the trainee must resolve using the lesson.`,
      turn_rules: `
- YOU are the CUSTOMER with a support issue. The trainee is the support agent.
- Stay realistic: share details, ask for resolution, accept clear help.
- Score empathy, policy accuracy, and useful next steps from the lesson.`,
      fallback_personas: (title) => ([
        {
          key: 'confused-user',
          label: 'Confused User',
          customer_name: 'Neha',
          customer_role: `a customer needing help with ${title}`,
          situation: 'They are stuck and need clear guidance.',
          concern: 'They do not understand what to do next.',
          goal: 'Guide them step-by-step using the lesson process.',
          focus_areas: ['clarify issue', 'explain steps', 'confirm resolution'],
        },
        {
          key: 'upset-complainant',
          label: 'Upset Customer',
          customer_name: 'Arjun',
          customer_role: `a customer raising a complaint related to ${title}`,
          situation: 'They are frustrated and want a fair resolution.',
          concern: 'They feel unheard and want action.',
          goal: 'Acknowledge, follow policy, and offer a correct next step from the lesson.',
          focus_areas: ['empathy', 'policy', 'resolution'],
        },
      ]),
    },
    internal: {
      roleplay_type: 'internal',
      trainee_role: 'internal staff / operations / process owner',
      trainee_label: 'Team Member',
      character_kind: 'colleague / manager / process partner',
      character_label: 'Colleague',
      mode_label: 'Internal / Operations',
      persona_rules: `
- Each persona must be an INTERNAL colleague, manager, or process partner.
- Never make the persona an external retail customer unless the lesson is clearly about external clients.
- Focus on workflows, handoffs, approvals, data, deadlines, and coordination.`,
      scenario_rules: `
- The CHARACTER is an internal colleague/manager/process partner.
- The TRAINEE is internal staff applying the lesson.
- opening_line must be a workplace request, handoff question, or process issue.
- Goal: what the trainee must accomplish using the lesson process.`,
      turn_rules: `
- YOU are an INTERNAL colleague/manager. The trainee is staff applying the lesson.
- Use workplace language about process, ownership, and deadlines.
- Do NOT act like a salon retail customer.
- Score whether the trainee followed the lesson's internal process correctly.`,
      fallback_personas: (title) => ([
        {
          key: 'process-owner',
          label: 'Process Owner',
          customer_name: 'Sana',
          customer_role: `a process owner checking handoff quality for ${title}`,
          situation: 'They need confirmation that the correct process was followed.',
          concern: 'They worry a step was skipped or ownership is unclear.',
          goal: 'Confirm the process steps from the lesson and clarify ownership.',
          focus_areas: ['process steps', 'ownership', 'handoff'],
        },
        {
          key: 'manager-checkin',
          label: 'Manager Check-in',
          customer_name: 'Rohit',
          customer_role: `a manager asking for a status update on ${title}`,
          situation: 'They need a clear update and next action.',
          concern: 'They need accuracy and accountability.',
          goal: 'Give a clear status and next step using the lesson.',
          focus_areas: ['status clarity', 'accuracy', 'next action'],
        },
      ]),
    },
    auto: {
      roleplay_type: 'auto',
      trainee_role: 'the professional role this course trains (infer from category/course/lesson)',
      trainee_label: 'Trainee',
      character_kind: 'the realistic workplace counterpart for that role (infer; may be customer, manager, colleague, etc.)',
      character_label: 'Counterpart',
      mode_label: 'Let AI choose',
      persona_rules: `
- Infer the TRAINEE's real job from category/course/lesson.
- Infer realistic COUNTERPART personas that person would talk to while applying this lesson.
- Do NOT default to sales consultant vs customer unless the content is clearly sales.
- For content/design courses, prefer manager/editor/stakeholder counterparts.
- For technician courses, prefer clients receiving service.
- For support courses, prefer customers with issues.
- For ops/HR/accounts/MIS, prefer internal colleagues/managers.`,
      scenario_rules: `
- Infer trainee role and character role from category/course/lesson.
- Do NOT force sales roles if the course is not sales.
- opening_line must match the inferred counterpart and test the lesson content.
- Goal must match what the trainee in that job must accomplish.`,
      turn_rules: `
- Stay consistent with the inferred trainee and character roles in the scenario.
- Do NOT switch into unrelated sales consulting unless the scenario is sales.
- Score whether the trainee applied the lesson correctly in that workplace role.`,
      fallback_personas: (title) => ([
        {
          key: 'workplace-counterpart',
          label: 'Workplace Counterpart',
          customer_name: 'Aisha',
          customer_role: `a realistic workplace counterpart for ${title}`,
          situation: 'They need help applying the lesson topic at work.',
          concern: 'They need a clear, practical answer tied to the lesson.',
          goal: 'Use the lesson to help them move forward correctly.',
          focus_areas: ['lesson application', 'clarity', 'next step'],
        },
        {
          key: 'detail-checker',
          label: 'Detail Checker',
          customer_name: 'Imran',
          customer_role: `someone verifying understanding of ${title}`,
          situation: 'They want confirmation that the important details are correct.',
          concern: 'They are unsure about a key point from the lesson.',
          goal: 'Explain the key point accurately using the lesson.',
          focus_areas: ['accuracy', 'key detail', 'confidence'],
        },
      ]),
    },
  };

  const frame = frames[roleplayType] || frames.auto;
  return {
    ...frame,
    context_line: contextLine || 'No extra course context',
  };
};

module.exports = {
  ROLEPLAY_TYPES,
  ROLEPLAY_TYPE_VALUES,
  DEFAULT_ROLEPLAY_TYPE,
  isValidRolePlayType,
  normalizeRolePlayType,
  rolePlayTypeLabel,
  getRolePlayFrame,
};
