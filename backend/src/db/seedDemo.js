require('dotenv').config();
const mongoose = require('mongoose');

const User = require('../models/User');
const Category = require('../models/Category');
const Course = require('../models/Course');
const Module = require('../models/Module');
const Lesson = require('../models/Lesson');
const Test = require('../models/Test');
const Enrollment = require('../models/Enrollment');
const RolePlayProgress = require('../models/RolePlayProgress');

const DEMO_TRAINEE_EMAIL = 'demo.trainee@lms.local';
const DEMO_TRAINEE_PASSWORD = 'Demo@12345';

const DEMO_COURSES = [
  {
    title: 'Demo Hindi Voice Assessment Course',
    description: 'A ready-to-run course for testing English and Hindi AI voice assessments.',
    moduleTitle: 'Demo Customer Conversation Module',
    lessonTitle: 'Demo Consultative Selling Voice Lesson',
    testTitle: 'Demo Consultative Selling — Voice Assessment',
  },
  {
    title: 'Demo Hindi Voice Assessment Course 2',
    description: 'Fresh demo course for final Hindi/Hinglish voice assessment testing before deploy.',
    moduleTitle: 'Demo Objection Handling Module',
    lessonTitle: 'Demo Value Selling Voice Lesson',
    testTitle: 'Demo Value Selling — Voice Assessment',
  },
];

const TRANSCRIPT = [
  'A good sales conversation begins by understanding the customer\'s needs.',
  'Ask an open-ended question before recommending a product or service.',
  'Explain the most relevant benefit clearly and connect it to the customer\'s goal.',
  'When a customer says the price is high, acknowledge the concern and explain the value.',
  'Always finish with a clear next step, such as booking a consultation or sending more information.',
].join(' ');

const QUESTIONS = [
  {
    question: 'What should you do before recommending a product or service to a customer?',
    type: 'short_answer',
    expected_answer: 'Understand the customer\'s needs by asking an open-ended question.',
    key_points: ['understand needs', 'ask an open-ended question'],
    difficulty: 'basics',
    points: 2,
  },
  {
    question: 'How should you respond when a customer says the price is high?',
    type: 'short_answer',
    expected_answer: 'Acknowledge the concern and explain the value related to the customer\'s goal.',
    key_points: ['acknowledge concern', 'explain value', 'customer goal'],
    difficulty: 'basics',
    is_objection: true,
    points: 2,
  },
  {
    question: 'What is a strong way to finish a sales conversation?',
    type: 'short_answer',
    expected_answer: 'Give the customer a clear next step, such as booking a consultation or sending information.',
    key_points: ['clear next step', 'booking consultation', 'send information'],
    difficulty: 'field-ready',
    points: 2,
  },
];

const seedDemoCourse = async ({ trainer, category, demoTrainee, spec }) => {
  const course = await Course.findOneAndUpdate(
    { title: spec.title },
    {
      title: spec.title,
      description: spec.description,
      passing_score: 60,
      tags: ['demo', 'voice', 'hindi', 'sales'],
      is_published: true,
      created_by: trainer._id,
      category_id: category._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const module = await Module.findOneAndUpdate(
    { course_id: course._id, title: spec.moduleTitle },
    {
      course_id: course._id,
      title: spec.moduleTitle,
      description: 'Practice explaining value and responding to a customer.',
      requires_voice_test: true,
      passing_score: 60,
      order: 0,
      is_published: true,
      created_by: trainer._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const lesson = await Lesson.findOneAndUpdate(
    { module_id: module._id, title: spec.lessonTitle },
    {
      module_id: module._id,
      course_id: course._id,
      title: spec.lessonTitle,
      description: 'Watch the demo lesson, then answer the spoken questions in English or Hindi.',
      order: 0,
      content_url: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
      content_type: 'video',
      content_source: 'youtube',
      embed_url: 'https://www.youtube.com/embed/ysz5S6PUM-U',
      video_url: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
      video_source: 'youtube',
      transcript: TRANSCRIPT,
      transcript_status: 'ready',
      study_notes: 'Focus on needs discovery, value explanation, objection handling, and the next step.',
      duration_minutes: 8,
      is_published: true,
      created_by: trainer._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const test = await Test.findOneAndUpdate(
    { lesson_id: lesson._id },
    {
      course_id: course._id,
      module_id: module._id,
      lesson_id: lesson._id,
      title: spec.testTitle,
      test_type: 'voice',
      questions: QUESTIONS,
      passing_score: 60,
      max_attempts: 10,
      is_active: true,
      order: 0,
      created_by: trainer._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Lesson.findByIdAndUpdate(lesson._id, { test_id: test._id });

  await Enrollment.findOneAndUpdate(
    { trainee_id: demoTrainee._id, course_id: course._id },
    {
      trainee_id: demoTrainee._id,
      course_id: course._id,
      status: 'not_started',
      progress: 0,
      enrolled_by: trainer._id,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Unlock assessment immediately with fresh attempt budget for voice testing.
  await RolePlayProgress.findOneAndUpdate(
    { trainee_id: demoTrainee._id, lesson_id: lesson._id },
    {
      trainee_id: demoTrainee._id,
      lesson_id: lesson._id,
      course_id: course._id,
      attempts_used: 0,
      best_score: 100,
      last_score: 100,
      passed: true,
      unlocked_by_trainer: true,
      unlocked_at: new Date(),
      trainer_unlocked_by: trainer._id,
      trainer_unlock_note: 'Demo seed unlock for voice testing',
      last_attempt_at: null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return {
    course_id: course._id.toString(),
    module_id: module._id.toString(),
    lesson_id: lesson._id.toString(),
    test_id: test._id.toString(),
    title: course.title,
  };
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const trainer = await User.findOne({ roles: 'trainer', is_active: true });
  if (!trainer) throw new Error('Create an active trainer before running the demo seed.');

  let category = await Category.findOne({ name: 'Sales' });
  if (!category) {
    category = await Category.create({
      name: 'Sales',
      description: 'Demo sales training category',
      created_by: trainer._id,
    });
  }

  const trainee = await User.findOne({ email: DEMO_TRAINEE_EMAIL });
  let demoTrainee = trainee;
  if (!demoTrainee) {
    demoTrainee = new User({
      name: 'Demo Hindi Trainee',
      email: DEMO_TRAINEE_EMAIL,
      password: DEMO_TRAINEE_PASSWORD,
      phone: null,
      roles: ['trainee'],
      category_ids: [category._id],
      category_id: category._id,
      is_active: true,
    });
  } else {
    demoTrainee.name = 'Demo Hindi Trainee';
    demoTrainee.password = DEMO_TRAINEE_PASSWORD;
    demoTrainee.roles = ['trainee'];
    demoTrainee.role = 'trainee';
    demoTrainee.category_ids = [category._id];
    demoTrainee.category_id = category._id;
    demoTrainee.is_active = true;
  }
  await demoTrainee.save();

  const courses = [];
  for (const spec of DEMO_COURSES) {
    courses.push(await seedDemoCourse({ trainer, category, demoTrainee, spec }));
  }

  console.log(JSON.stringify({
    trainee_email: DEMO_TRAINEE_EMAIL,
    trainee_password: DEMO_TRAINEE_PASSWORD,
    trainer_email: trainer.email,
    courses,
  }, null, 2));

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
