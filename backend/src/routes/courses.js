const router = require('express').Router();
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { authenticate, authorize } = require('../middleware/auth');
const { detectVideoSource, fetchTranscript } = require('../services/transcriptService');

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
      .populate({ path: 'category_id', select: 'name', strictPopulate: false });

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
    const { title, description, video_url, requires_voice_test, passing_score, duration_hours, tags, department_ids } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'Title is required' });

    const catIds = getUserCatIds(req.user);

    if (req.user.role === 'trainer' && !catIds.length)
      return res.status(403).json({ success: false, message: 'You have no category assigned — contact admin' });

    const video_source = video_url ? detectVideoSource(video_url) : 'unknown';

    const course = await Course.create({
      title, description, video_url, video_source,
      requires_voice_test: !!requires_voice_test,
      passing_score: passing_score || 60,
      duration_hours: duration_hours || null,
      tags: tags || [],
      department_ids: department_ids || [],
      created_by: req.user._id,
      // Trainer: stamp their primary category. Admin: use provided or null
      category_id: req.user.role === 'trainer' ? catIds[0] : (req.body.category_id || null),
    });

    await course.populate({ path: 'category_id', select: 'name', strictPopulate: false });
    res.status(201).json({ success: true, course });
  } catch (err) { next(err); }
});

// PUT /api/courses/:id
router.put('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
      const catIds = getUserCatIds(req.user);
      if (!catIds.includes(getRawId(course.category_id)))
        return res.status(403).json({ success: false, message: 'Not your category' });
    }

    const { title, description, video_url, requires_voice_test, passing_score, duration_hours, tags, department_ids } = req.body;

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

    await course.save();
    res.json({ success: true, course });
  } catch (err) { next(err); }
});

// DELETE /api/courses/:id
router.delete('/:id', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    if (req.user.role === 'trainer') {
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
  res.json({ success: true, source: detectVideoSource(url) });
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
