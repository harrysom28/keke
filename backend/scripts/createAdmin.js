import mongoose from 'mongoose';
import User from '../src/models/User.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const createAdminUser = async () => {
  try {
    // Connect to MongoDB (use the same connection string as the backend)
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@keke.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      console.log('Email:', existingAdmin.email);
      console.log('Role:', existingAdmin.role);
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@keke.com',
      phone: '+2348000000000',
      password: 'Admin@123456',
      role: 'admin',
      isActive: true,
      isVerified: true,
      isRegVerified: true,
      isRegCompleted: true,
      gender: 'other',
      currentLocation: {
        type: 'Point',
        coordinates: [0, 0], // Default coordinates
        address: null,
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password: Admin@123456');
    console.log('👤 Role:', admin.role);
    console.log('');
    console.log('You can now login to the admin dashboard!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    process.exit(1);
  }
};

createAdminUser();
