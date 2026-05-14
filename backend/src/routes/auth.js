const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, authorize } = require('../middleware/auth');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() })
      .populate({ path: 'category_id', select: 'name', strictPopulate: false });

    if (!user || !(await user.comparePassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    if (!user.is_active)
      return res.status(403).json({ success: false, message: 'Account is deactivated' });

    user.last_login_at = new Date();
    await user.save();

    res.json({ success: true, token: signToken(user._id), user: user.toPublic() });
  } catch (err) { next(err); }
});

// POST /api/auth/register
router.post('/register', authenticate, authorize('admin', 'trainer'), async (req, res, next) => {
  try {
    const { name, email, password, role, department_ids, category_id, phone } = req.body;

    if (!name || !email || !password || !role)
      return res.status(400).json({ success: false, message: 'name, email, password, role required' });

    if (!['admin', 'trainer', 'trainee'].includes(role))
      return res.status(400).json({ success: false, message: 'Invalid role' });

    if (req.user.roles.includes('trainer') && role !== 'trainee')
      return res.status(403).json({ success: false, message: 'Trainers can only create trainee accounts' });

    if (req.user.roles.includes('trainer') && category_id) {
      const userCatId = req.user.category_id?._id
        ? req.user.category_id._id.toString()
        : req.user.category_id?.toString();
      if (userCatId !== category_id.toString())
        return res.status(403).json({ success: false, message: 'Cannot assign trainees to a different category' });
    }

    if (req.user.roles.includes('admin') && role !== 'admin' && !category_id)
      return res.status(400).json({ success: false, message: 'Category is required for trainers and trainees' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ success: false, message: 'Email already in use' });

    const user = await User.create({
      name,
      email,
      password,
      phone: phone || null,
      roles: [role],   // FIX: set roles array — pre-save hook syncs role from roles[0]
      department_ids: department_ids || [],
      category_id: role !== 'admin' ? (category_id || null) : null,
    });

    const populated = await User.findById(user._id)
      .select('-password')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false });

    res.status(201).json({ success: true, user: populated });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) { next(err); }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findById(req.user._id);
    if (!(await user.comparePassword(current_password)))
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    user.password = new_password;
    await user.save();
    res.json({ success: true, message: 'Password updated' });
  } catch (err) { next(err); }
});

module.exports = router;