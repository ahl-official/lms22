const Enrollment = require('../models/Enrollment');
const Course = require('../models/Course');
const Module = require('../models/Module');
const {
  getModuleCompletionSnapshot,
  recalculateEnrollmentProgress,
} = require('../services/courseProgressService');

/**
 * @desc    Enroll a single trainee
 * @route   POST /api/enrollments
 * @access  Private (Admin, Trainer)
 */
exports.enrollTrainee = async (req, res, next) => {
  try {
    const { trainee_id, course_id } = req.body;
    if (!trainee_id || !course_id) {
      return res.status(400).json({ success: false, message: 'trainee_id and course_id required' });
    }

    const enrollment = await Enrollment.findOneAndUpdate(
      { trainee_id, course_id },
      { $setOnInsert: { trainee_id, course_id, enrolled_by: req.user._id } },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, enrollment });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Bulk enroll trainees
 * @route   POST /api/enrollments/bulk
 * @access  Private (Admin, Trainer)
 */
exports.bulkEnroll = async (req, res, next) => {
  try {
    const { trainee_ids, course_id } = req.body;
    if (!trainee_ids?.length || !course_id) {
      return res.status(400).json({ success: false, message: 'trainee_ids array and course_id required' });
    }

    const ops = trainee_ids.map(trainee_id => ({
      updateOne: {
        filter: { trainee_id, course_id },
        update: { $setOnInsert: { trainee_id, course_id, enrolled_by: req.user._id } },
        upsert: true,
      },
    }));
    await Enrollment.bulkWrite(ops);
    res.json({ success: true, message: `${trainee_ids.length} trainees enrolled` });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get current trainee's enrollments
 * @route   GET /api/enrollments/my
 * @access  Private (Trainee)
 */
exports.getMyEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ trainee_id: req.user._id })
      .populate({
        path: 'course_id',
        match: { is_published: true },
        select: 'title description video_url video_source requires_voice_test passing_score duration_hours tags thumbnail_url',
      })
      .sort({ createdAt: -1 })
      .lean();

    const visibleEnrollments = enrollments.filter(e => !!e.course_id);
    const courseIds = visibleEnrollments.map(e => e.course_id._id);
    const modules = await Module.find({ course_id: { $in: courseIds }, is_published: true })
      .select('_id course_id')
      .lean();
    const moduleIds = modules.map(module => module._id);

    const { totalByModule, completedByModule } = await getModuleCompletionSnapshot({
      traineeId: req.user._id,
      moduleIds,
    });

    const modulesByCourse = {};
    for (const module of modules) {
      const key = module.course_id.toString();
      if (!modulesByCourse[key]) modulesByCourse[key] = [];
      modulesByCourse[key].push(module);
    }

    const result = [];
    const staleUpdates = [];

    for (const e of visibleEnrollments) {
        const courseModules = modulesByCourse[e.course_id._id.toString()] || [];
        const completedModules = courseModules.filter((module) => {
          const key = module._id.toString();
          const total = totalByModule[key] || 0;
          return total > 0 && (completedByModule[key] || 0) >= total;
        }).length;
        const moduleProgress = courseModules.length
          ? Math.round((completedModules / courseModules.length) * 100)
          : e.progress;
        const derivedStatus = courseModules.length
          ? moduleProgress === 100
            ? 'completed'
            : moduleProgress > 0
              ? 'in_progress'
              : 'not_started'
          : e.status;

        if (courseModules.length && (e.progress !== moduleProgress || e.status !== derivedStatus)) {
          staleUpdates.push(recalculateEnrollmentProgress({ traineeId: req.user._id, courseId: e.course_id._id }));
        }

        result.push({
        ...e,
        course_title: e.course_id.title,
        requires_voice_test: e.course_id.requires_voice_test,
        duration_hours: e.course_id.duration_hours,
          module_count: courseModules.length,
          completed_modules: completedModules,
          progress: moduleProgress,
          status: derivedStatus,
        });
      }

    if (staleUpdates.length) {
      Promise.all(staleUpdates).catch(err => {
        console.warn('[progress] Enrollment sync failed:', err.message);
      });
    }

    res.json({ success: true, enrollments: result });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Get enrollments for a specific course
 * @route   GET /api/enrollments/course/:courseId
 * @access  Private (Admin, Trainer)
 */
exports.getCourseEnrollments = async (req, res, next) => {
  try {
    const enrollments = await Enrollment.find({ course_id: req.params.courseId })
      .populate('trainee_id', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, enrollments });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Update enrollment progress
 * @route   PUT /api/enrollments/:id/progress
 * @access  Private
 */
exports.updateProgress = async (req, res, next) => {
  try {
    const { progress } = req.body;
    const enr = await Enrollment.findById(req.params.id);
    if (!enr) return res.status(404).json({ success: false, message: 'Enrollment not found' });
    
    if (req.user.role === 'trainee' && !enr.trainee_id.equals(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    enr.progress = Math.min(100, Math.max(0, progress));
    if (enr.progress > 0 && enr.status === 'not_started') enr.status = 'in_progress';
    if (enr.progress === 100) {
      enr.status = 'completed';
      enr.completed_at = enr.completed_at || new Date();
    }
    await enr.save();
    res.json({ success: true, enrollment: enr });
  } catch (err) {
    next(err);
  }
};

/**
 * @desc    Delete an enrollment
 * @route   DELETE /api/enrollments/:id
 * @access  Private (Admin, Trainer)
 */
exports.deleteEnrollment = async (req, res, next) => {
  try {
    await Enrollment.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Enrollment removed' });
  } catch (err) {
    next(err);
  }
};
