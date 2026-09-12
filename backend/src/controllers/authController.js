const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const result = await query(
      'SELECT id, name, email, password_hash, role, department_ids, avatar_url, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user.id);
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token,
      user: userWithoutPassword
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/register
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password, role, department_ids = [] } = req.body;

    // Only admins can create any role; trainers can only create trainees
    if (req.user.role === 'trainer' && role !== 'trainee') {
      return res.status(403).json({ success: false, message: 'Trainers can only create trainees' });
    }
    if (req.user.role === 'trainee') {
      return res.status(403).json({ success: false, message: 'Trainees cannot create users' });
    }

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    if (!['admin', 'trainer', 'trainee'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role, department_ids)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, department_ids, created_at`,
      [name.trim(), email.toLowerCase().trim(), hash, role, department_ids]
    );

    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
  const { password_hash, ...user } = req.user;
  res.json({ success: true, user });
};

/**
 * PUT /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, register, getMe, changePassword };
