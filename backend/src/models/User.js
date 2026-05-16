const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  plain_password: { type: String, default: null },
  phone: { type: String, default: null, trim: true },

  roles: {
    type: [String],
    enum: ['admin', 'trainer', 'trainee'],
    default: ['trainee'],
    validate: {
      validator: (arr) => arr.length > 0,
      message: 'User must have at least one role.',
    },
  },

  // Legacy — mirrors roles[0], do not set manually
  role: {
    type: String,
    enum: ['admin', 'trainer', 'trainee'],
    default: 'trainee',
  },

  // Multi-category support — a user can belong to multiple categories (AI, CRM, Sales...)
  category_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
  }],

  // Legacy single category — kept in sync with category_ids[0] for backward compat
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null,
  },

  department_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  avatar_url: { type: String, default: null },
  is_active: { type: Boolean, default: true },
  last_login_at: { type: Date, default: null },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  // Sync legacy role field from roles array
  if (this.isModified('roles') || this.isNew) {
    this.role = this.roles[0];
  }

  // Sync legacy category_id from category_ids[0]
  if (this.isModified('category_ids')) {
    this.category_id = this.category_ids[0] || null;
  }

  // Hash password
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  next();
});

userSchema.methods.hasRole = function (role) {
  return this.roles.includes(role);
};

userSchema.methods.hasAnyRole = function (...roles) {
  return roles.some((r) => this.roles.includes(r));
};

// Returns all category IDs — checks both new array and legacy field
userSchema.methods.getCategoryIds = function () {
  if (this.category_ids?.length) return this.category_ids.map(id => id.toString());
  if (this.category_id) return [this.category_id.toString()];
  return [];
};

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

userSchema.index({ role: 1, is_active: 1, last_login_at: -1 });
userSchema.index({ roles: 1, is_active: 1, last_login_at: -1 });
userSchema.index({ category_id: 1, role: 1, is_active: 1 });
userSchema.index({ category_ids: 1, roles: 1, is_active: 1 });

module.exports = mongoose.model('User', userSchema);
