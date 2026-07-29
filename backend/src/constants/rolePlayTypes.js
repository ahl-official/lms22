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

module.exports = {
  ROLEPLAY_TYPES,
  ROLEPLAY_TYPE_VALUES,
  DEFAULT_ROLEPLAY_TYPE,
  isValidRolePlayType,
  normalizeRolePlayType,
  rolePlayTypeLabel,
};
