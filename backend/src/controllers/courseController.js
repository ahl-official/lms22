const { query } = require('../config/db');
const transcriptService = require('../services/transcriptService');

/**
 * GET /api/courses
 */
const getAllCourses = async (req, res, next) => {
  try {
    const { role, id: userId, department_ids } = req.user;

    let sql, params;

    if (role === 'admin') {
      sql = `SELECT c.*, u.name as trainer_name,
               (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
             FROM courses c
             LEFT JOIN users u ON c.trainer_id = u.id
             ORDER BY c.created_at DESC`;
      params = [];
    } else if (role === 'trainer') {
      sql = `SELECT c.*, u.name as trainer_name,
               (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
             FROM courses c
             LEFT JOIN users u ON c.trainer_id = u.id
             WHERE c.trainer_id = $1
             ORDER BY c.created_at DESC`;
      params = [userId];
    } else {
      // Trainee: see published courses in their departments
      sql = `SELECT c.*, u.name as trainer_name,
               e.status as enrollment_status, e.progress_percent
             FROM courses c
             LEFT JOIN users u ON c.trainer_id = u.id
             LEFT JOIN enrollments e ON e.course_id = c.id AND e.trainee_id = $1
             WHERE c.is_published = TRUE
               AND (c.department_ids && $2::uuid[] OR array_length(c.department_ids, 1) = 0)
             ORDER BY c.created_at DESC`;
      params = [userId, department_ids || []];
    }

    const result = await query(sql, params);
    res.json({ success: true, courses: result.rows });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/courses/:id
 */
const getCourse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT c.*, u.name as trainer_name
       FROM courses c
       LEFT JOIN users u ON c.trainer_id = u.id
       WHERE c.id = $1`,
      [id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    // Fetch tests for this course
    const tests = await query(
      `SELECT id, title, test_type, time_limit_minutes, max_attempts, passing_score, is_active
       FROM tests WHERE course_id = $1 AND is_active = TRUE`,
      [id]
    );

    res.json({ success: true, course: { ...result.rows[0], tests: tests.rows } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/courses
 */
const createCourse = async (req, res, next) => {
  try {
    const {
      title, description, thumbnail_url, video_url,
      department_ids, requires_voice_test, passing_score,
      estimated_duration_minutes, tags, gumlet_asset_id
    } = req.body;

    if (!title || !video_url) {
      return res.status(400).json({ success: false, message: 'Title and video URL required' });
    }

    // Detect video source
    const detected = transcriptService.detectVideoSource(video_url);

    const result = await query(
      `INSERT INTO courses 
       (title, description, thumbnail_url, trainer_id, video_url, video_source,
        gumlet_asset_id, department_ids, requires_voice_test, passing_score,
        estimated_duration_minutes, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        title, description, thumbnail_url, req.user.id, video_url,
        detected.source, gumlet_asset_id || detected.videoId,
        department_ids || [], requires_voice_test || false,
        passing_score || 70, estimated_duration_minutes, tags || []
      ]
    );

    res.status(201).json({ success: true, course: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/courses/:id
 */
const updateCourse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title, description, thumbnail_url, video_url,
      department_ids, requires_voice_test, passing_score,
      estimated_duration_minutes, tags, gumlet_asset_id
    } = req.body;

    // Check ownership (trainers can only edit their own)
    if (req.user.role === 'trainer') {
      const own = await query('SELECT trainer_id FROM courses WHERE id = $1', [id]);
      if (!own.rows.length || own.rows[0].trainer_id !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
    }

    let videoSource = null;
    if (video_url) {
      const detected = transcriptService.detectVideoSource(video_url);
      videoSource = detected.source;
    }

    const result = await query(
      `UPDATE courses SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         thumbnail_url = COALESCE($3, thumbnail_url),
         video_url = COALESCE($4, video_url),
         video_source = COALESCE($5, video_source),
         gumlet_asset_id = COALESCE($6, gumlet_asset_id),
         department_ids = COALESCE($7, department_ids),
         requires_voice_test = COALESCE($8, requires_voice_test),
         passing_score = COALESCE($9, passing_score),
         estimated_duration_minutes = COALESCE($10, estimated_duration_minutes),
         tags = COALESCE($11, tags)
       WHERE id = $12
       RETURNING *`,
      [title, description, thumbnail_url, video_url, videoSource, gumlet_asset_id,
       department_ids, requires_voice_test, passing_score, estimated_duration_minutes, tags, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }

    res.json({ success: true, course: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/courses/:id
 */
const deleteCourse = async (req, res, next) => {
  try {
    await query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/courses/detect-video
 */
const detectVideoSource = async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: 'URL required' });
    const info = transcriptService.detectVideoSource(url);
    res.json({ success: true, ...info });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/courses/:id/fetch-transcript
 */
const fetchCourseTranscript = async (req, res, next) => {
  try {
    const { id } = req.params;
    const course = await query('SELECT * FROM courses WHERE id = $1', [id]);
    if (!course.rows.length) {
      return res.status(404).json({ success: false, message: 'Course not found' });
    }
    const c = course.rows[0];

    // Update status to processing
    await query('UPDATE courses SET transcript_status = $1 WHERE id = $2', ['processing', id]);

    try {
      const { transcript } = await transcriptService.fetchTranscript(c.video_url, c.gumlet_asset_id);
      await query(
        'UPDATE courses SET transcript = $1, transcript_status = $2 WHERE id = $3',
        [transcript, transcript ? 'ready' : 'failed', id]
      );
      res.json({ success: true, transcript, status: transcript ? 'ready' : 'failed' });
    } catch (fetchErr) {
      await query('UPDATE courses SET transcript_status = $1 WHERE id = $2', ['failed', id]);
      throw fetchErr;
    }
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/courses/:id/publish
 */
const publishCourse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { publish } = req.body;
    await query('UPDATE courses SET is_published = $1 WHERE id = $2', [!!publish, id]);
    res.json({ success: true, message: publish ? 'Course published' : 'Course unpublished' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllCourses, getCourse, createCourse, updateCourse,
  deleteCourse, detectVideoSource, fetchCourseTranscript, publishCourse
};
