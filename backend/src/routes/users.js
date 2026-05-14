const router = require('express').Router();
const User = require('../models/User');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const { authenticate, authorize, authorizeRoleManagement } = require('../middleware/auth');
const { getUserRoles, updateUserRoles, addUserRole, removeUserRole } = require('../controllers/roleController');

const getRawId = (field) => {
  if (!field) return null;
  return field._id ? field._id.toString() : field.toString();
};

router.get('/', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { role, search, department_id, category_id } = req.query;
    const filter = { is_active: { $ne: false } };

    if (req.user.role === 'trainer') {
      filter.role = 'trainee';
      // Support both category_ids array and legacy category_id
      const trainerCatIds = req.user.category_ids?.length
        ? req.user.category_ids.map(id => getRawId(id))
        : [getRawId(req.user.category_id)].filter(Boolean);

      if (!trainerCatIds.length) return res.json({ success: true, users: [] });

      // Match trainees who share any of the trainer's categories
      filter.$or = [
        { category_ids: { $in: trainerCatIds } },
        { category_id: { $in: trainerCatIds } },
      ];
    } else {
      if (role) filter.role = role;
      if (category_id) {
        filter.$or = [
          { category_ids: category_id },
          { category_id: category_id },
        ];
      }
    }

    if (search) {
      const searchFilter = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
      // Merge search with any existing $or
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchFilter }];
        delete filter.$or;
      } else {
        filter.$or = searchFilter;
      }
    }

    if (department_id) filter.department_ids = department_id;

    const users = await User.find(filter)
      .select('-password')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false })
      .populate({ path: 'category_ids', select: 'name', strictPopulate: false })
      .sort({ createdAt: -1 });

    res.json({ success: true, users });
  } catch (err) { next(err); }
});

router.get('/departments', authenticate, async (req, res, next) => {
  try {
    const departments = await Department.find().sort({ name: 1 });
    res.json({ success: true, departments });
  } catch (err) { next(err); }
});

router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ user_id: req.user._id })
      .sort({ createdAt: -1 }).limit(20);
    const unread = await Notification.countDocuments({ user_id: req.user._id, is_read: false });
    res.json({ success: true, notifications, unread_count: unread });
  } catch (err) { next(err); }
});

router.put('/notifications/read-all', authenticate, async (req, res, next) => {
  try {
    await Notification.updateMany({ user_id: req.user._id, is_read: false }, { is_read: true });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/password', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('+plain_password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, password: user.plain_password || '(not available)' });
  } catch (err) { next(err); }
});

// ── Role Management ──────────────────────────────────────────────────────────
router.get('/:id/roles', authenticate, authorizeRoleManagement, getUserRoles);
router.put('/:id/roles', authenticate, authorizeRoleManagement, updateUserRoles);
router.post('/:id/roles/add', authenticate, authorizeRoleManagement, addUserRole);
router.delete('/:id/roles/remove', authenticate, authorizeRoleManagement, removeUserRole);
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false })
      .populate({ path: 'category_ids', select: 'name', strictPopulate: false });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && !req.user._id.equals(req.params.id))
      return res.status(403).json({ success: false, message: 'Access denied' });

    const { name, email, avatar_url, phone } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, avatar_url, phone },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

// Legacy single-category assign (kept for compat)
router.put('/:id/category', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { category_id } = req.body;
    const catIds = category_id ? [category_id] : [];
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.category_ids = catIds;
    // pre-save hook syncs category_id from category_ids[0]
    await user.save();
    await user.populate({ path: 'category_id', select: 'name', strictPopulate: false });
    await user.populate({ path: 'category_ids', select: 'name', strictPopulate: false });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

// Multi-category assign — set the full list of categories for a user
router.put('/:id/categories', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { category_ids } = req.body;
    if (!Array.isArray(category_ids))
      return res.status(400).json({ success: false, message: 'category_ids must be an array' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.category_ids = category_ids;
    // pre-save hook syncs category_id from category_ids[0]
    await user.save();
    await user.populate({ path: 'category_id', select: 'name', strictPopulate: false });
    await user.populate({ path: 'category_ids', select: 'name', strictPopulate: false });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

router.put('/:id/toggle-active', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.is_active = !user.is_active;
    await user.save();
    res.json({ success: true, is_active: user.is_active });
  } catch (err) { next(err); }
});

router.put('/:id/departments', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { department_ids: req.body.department_ids || [] },
      { new: true }
    ).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString())
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
});

module.exports = router;