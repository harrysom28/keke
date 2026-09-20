/**
 * Create or update an admin-panel user (email + password).
 *
 *   node scripts/createAdminUser.js "Samuel Uzor" samuel@example.com <password> agents_manager
 *
 * Role defaults to admin. Existing users with that email are updated.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const ADMIN_PANEL_ROLES = ['admin', 'agents_manager'];

export async function createAdminUser({
  name = 'Admin User',
  email = 'admin@keke.com',
  password = 'Admin@123456',
  role = 'admin',
} = {}) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedRole = String(role || 'admin').trim();
  if (!normalizedEmail || !password) {
    throw new Error('Email and password are required');
  }
  if (!ADMIN_PANEL_ROLES.includes(normalizedRole)) {
    throw new Error(`Role must be one of: ${ADMIN_PANEL_ROLES.join(', ')}`);
  }

  let user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (user) {
    user.name = name || user.name;
    user.password = password;
    user.role = normalizedRole;
    user.isActive = true;
    user.isVerified = true;
    user.isRegVerified = true;
    user.isRegCompleted = true;
    await user.save();
    console.log('✅ Updated existing admin-panel user');
  } else {
    user = await User.create({
      name: name || 'Admin User',
      email: normalizedEmail,
      password,
      role: normalizedRole,
      isActive: true,
      isVerified: true,
      isRegVerified: true,
      isRegCompleted: true,
    });
    console.log('✅ Admin-panel user created');
  }

  console.log('');
  console.log('📧 Email:', user.email);
  console.log('👤 Role:', user.role);
  console.log('');
  return user;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const [, , name, email, password, role] = process.argv;
  if (!name || !email || !password) {
    console.error('Usage: node scripts/createAdminUser.js <name> <email> <password> [role]');
    console.error('  role defaults to admin; use agents_manager for Agents-only access.');
    process.exit(1);
  }
  createAdminUser({ name, email, password, role: role || 'admin' })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Error creating admin user:', error.message);
      process.exit(1);
    });
}
