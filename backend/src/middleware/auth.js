const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(payload.id)
      .select('-password')
      .populate({ path: 'category_id', select: 'name', strictPopulate: false });

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Checks BOTH role string AND roles array — whichever has the real value wins
const authorize = (...roles) => (req, res, next) => {
  const hasRole =
    roles.includes(req.user?.role) ||
    req.user?.roles?.some((r) => roles.includes(r));

  if (!hasRole) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

const authorizeRoleManagement = (req, res, next) => {
  const isAdmin =
    req.user?.role === 'admin' || req.user?.roles?.includes('admin');
  const isTrainer =
    req.user?.role === 'trainer' || req.user?.roles?.includes('trainer');

  if (isAdmin) {
    req.allowedTargetRoles = ['trainer', 'trainee'];
    return next();
  }
  if (isTrainer) {
    req.allowedTargetRoles = ['trainee'];
    return next();
  }

  return res.status(403).json({ success: false, message: 'Access denied' });
};

module.exports = { authenticate, authorize, authorizeRoleManagement };