require('dotenv').config();
const { connect } = require('../config/db');
const User = require('../models/User');
const Department = require('../models/Department');

async function seed() {
  await connect();

  // Default admin
  const existing = await User.findOne({ email: 'admin@lms.com' });
  if (!existing) {
    await User.create({
      name: 'Admin',
      email: 'admin@lms.com',
      password: 'Admin@123',
      roles: ['admin'],
      role: 'admin',
    });
    console.log('✅ Default admin created: admin@lms.com / Admin@123');
  } else {
    if (!existing.roles?.includes('admin') || existing.role !== 'admin') {
      existing.roles = ['admin'];
      existing.role = 'admin';
      await existing.save();
      console.log('✅ Existing admin role repaired: admin@lms.com');
    }
    console.log('ℹ️  Admin already exists');
  }

  // Sample departments
  const deptNames = ['Sales', 'Operations', 'Customer Support', 'Product'];
  for (const name of deptNames) {
    await Department.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
  }
  console.log('✅ Departments seeded');

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
