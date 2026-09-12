const router = require('express').Router();
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { authenticate, authorize } = require('../middleware/auth');
const { detectContentSource, detectVideoSource, fetchTranscript } = require('../services/transcriptService');

const getRawId = (field) => {
  if (!field) return null;
  return field._id ? field._id.toString() : field.toString();
};

// Get all category IDs for a user — checks both category_ids array and legacy category_id
const getUserCatIds = (user) => {
  if (user.category_ids?.length) return user.category_ids.map(id => getRawId(id));
  if (user.category_id) return [getRawId(user.category_id)];
  return [];
};

const userHasRole = (user, role) =>
  user?.role === role || user?.roles?.some((r) => r === role);

/** Resolve and validate category_id for create/update. Trainers may only use their assigned categories. */
const resolveCourseCategoryId = ({ user, categoryId, required = true }) => {
  const selected = categoryId ? getRawId(categoryId) : null;

  if (!selected) {
    if (required) return { error: { status: 400, message: 'Category is required' } };
    return { categoryId: null };
  }

  if (userHasRole(user, 'trainer') && !userHasRole(user, 'admin')) {
    const catIds = getUserCatIds(user);
    if (!catIds.length) {
      return { error: { status: 403, message: 'You have no category assigned — contact admin' } };
    }
    if (!catIds.includes(selected)) {
      return { error: { status: 403, message: 'You can only assign a category that belongs to you' } };
    }
  }

  return { categoryId: selected };
};

// GET /api/courses
router.get('/', authenticate, async (req, res, next) => {
  try {
    const filter = {};

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      if (!catIds.length) return res.json({ success: true, courses: [] });
      filter.category_id = { $in: catIds };
    }

    if (req.user.role === 'trainee') {
      filter.is_published = true;
      const catIds = getUserCatIds(req.user);
      if (!catIds.length) return res.json({ success: true, courses: [] });
      filter.category_id = { $in: catIds };
    }

    const courses = await Course.find(filter)
      .populate('created_by', 'name email')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false })
      .sort({ createdAt: -1 });

    res.json({ success: true, courses });
  } catch (err) { next(err); }
});

// GET /api/courses/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('created_by', 'name email')
      .populate({ path: 'category_id', select: 'name roleplay_type', strictPopulate: false });

    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      const courseCatId = getRawId(course.category_id);
      if (!catIds.includes(courseCatId))
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, course });
  } catch (err) { next(err); }
});

// POST /api/courses
router.post('/', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { title, description, video_url, requires_voice_test, passing_score, duration_hours, tags, department_ids, category_id, roleplay_notes } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

    const resolved = resolveCourseCategoryId({ user: req.user, categoryId: category_id, required: true });
    if (resolved.error) {
      return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
    }

    const video_source = video_url ? detectVideoSource(video_url) : 'unknown';

    const course = await Course.create({
      title, description, video_url, video_source,
      requires_voice_test: !!requires_voice_test,
      passing_score: passing_score || 60,
      duration_hours: duration_hours || null,
      tags: tags || [],
      department_ids: department_ids || [],
      created_by: req.user._id,
      // Explicit category from create form (drives Role Play type via category.roleplay_type)
      category_id: resolved.categoryId,
      roleplay_notes: typeof roleplay_notes === 'string' ? roleplay_notes.trim().slice(0, 2000) : '',
    });

    await course.populate({ path: 'category_id', select: 'name roleplay_type', strictPopulate: false });
    res.status(201).json({ success: true, course });
  } catch (err) { next(err); }
});

// PUT /api/courses/:id
router.put('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (userHasRole(req.user, 'trainer') && !userHasRole(req.user, 'admin')) {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    const { title, description, video_url, requires_voice_test, passing_score, duration_hours, tags, department_ids, category_id, roleplay_notes } = req.body;

    if (video_url && video_url !== course.video_url) {
      course.video_url = video_url;
      course.video_source = detectVideoSource(video_url);
      course.transcript = null;
      course.transcript_status = 'none';
    }
    if (title !== undefined) course.title = title;
    if (description !== undefined) course.description = description;
    if (requires_voice_test !== undefined) course.requires_voice_test = requires_voice_test;
    if (passing_score !== undefined) course.passing_score = passing_score;
    if (duration_hours !== undefined) course.duration_hours = duration_hours;
    if (tags !== undefined) course.tags = tags;
    if (department_ids !== undefined) course.department_ids = department_ids;
    if (roleplay_notes !== undefined) {
      course.roleplay_notes = typeof roleplay_notes === 'string'
        ? roleplay_notes.trim().slice(0, 2000)
        : '';
    }
    if (category_id !== undefined) {
      const resolved = resolveCourseCategoryId({ user: req.user, categoryId: category_id, required: true });
      if (resolved.error) {
        return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
      }
      course.category_id = resolved.categoryId;
    }

    await course.save();
    await course.populate({ path: 'category_id', select: 'name roleplay_type', strictPopulate: false });
    res.json({ success: true, course });
  } catch (err) { next(err); }
});

// DELETE /api/courses/:id
router.delete('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (userHasRole(req.user, 'trainer') && !userHasRole(req.user, 'admin')) {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    await Promise.all([
      Enrollment.deleteMany({ course_id: course._id }),
      course.deleteOne(),
    ]);
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) { next(err); }
});

// POST /api/courses/detect-video
router.post('/detect-video', authenticate, (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, message: 'URL required' });
  const detected = detectContentSource(url);
  res.json({ success: true, source: detected.video_source, detected });
});

// POST /api/courses/:id/fetch-transcript
router.post('/:id/fetch-transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    if (!course.video_url) return res.status(400).json({ success: false, message: 'No video URL set' });

    course.transcript_status = 'fetching';
    await course.save();

    try {
      const transcript = await fetchTranscript(course.video_url);
      course.transcript = transcript;
      course.transcript_status = 'ready';
    } catch (fetchErr) {
      course.transcript_status = 'error';
      await course.save();
      return res.status(422).json({ success: false, message: fetchErr.message });
    }

    await course.save();
    res.json({ success: true, transcript_status: course.transcript_status, transcript: course.transcript });
  } catch (err) { next(err); }
});

// PUT /api/courses/:id/publish
router.put('/:id/publish', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    course.is_published = req.body.publish !== false;
    await course.save();
    res.json({ success: true, is_published: course.is_published });
  } catch (err) { next(err); }
});

// PUT /api/courses/:id/transcript
router.put('/:id/transcript', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    course.transcript = req.body.transcript;
    course.transcript_status = 'ready';
    await course.save();
    res.json({ success: true, course });
  } catch (err) { next(err); }
});

module.exports = router;
