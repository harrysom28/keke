#!/usr/bin/env node

/**
 * Database initialization script
 * Creates initial data like vehicle types, admin user, etc.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import VehicleType from '../src/models/VehicleType.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const vehicleTypes = [
  {
    name: 'standard',
    displayName: 'Standard',
    description: 'Affordable everyday rides',
    baseFare: 2.50,
    perKmRate: 1.50,
    perMinuteRate: 0.30,
    multiplier: 1.0,
    capacity: 4,
    order: 1,
    isActive: true,
    colors: [
      { name: 'Black', code: '#000000', isActive: true },
      { name: 'White', code: '#FFFFFF', isActive: true },
      { name: 'Silver', code: '#C0C0C0', isActive: true },
      { name: 'Red', code: '#FF0000', isActive: true },
    ],
    years: Array.from({ length: 10 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
  },
  {
    name: 'premium',
    displayName: 'Premium',
    description: 'Comfortable premium rides',
    baseFare: 4.00,
    perKmRate: 2.00,
    perMinuteRate: 0.40,
    multiplier: 1.2,
    capacity: 4,
    order: 2,
    isActive: true,
    colors: [
      { name: 'Black', code: '#000000', isActive: true },
      { name: 'White', code: '#FFFFFF', isActive: true },
      { name: 'Silver', code: '#C0C0C0', isActive: true },
    ],
    years: Array.from({ length: 5 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
  },
  {
    name: 'luxury',
    displayName: 'Luxury',
    description: 'Luxurious premium rides',
    baseFare: 6.00,
    perKmRate: 3.00,
    perMinuteRate: 0.50,
    multiplier: 1.5,
    capacity: 4,
    order: 3,
    isActive: true,
    colors: [
      { name: 'Black', code: '#000000', isActive: true },
      { name: 'White', code: '#FFFFFF', isActive: true },
    ],
    years: Array.from({ length: 3 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
  },
];

const createAdminUser = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ride-hailing.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const existingAdmin = await User.findOne({ email: adminEmail, role: 'admin' });

    if (existingAdmin) {
      logger.info('Admin user already exists');
      return existingAdmin;
    }

    const hashedPassword = await bcrypt.hash(adminPassword, 12);

    const admin = await User.create({
      name: 'Admin User',
      email: adminEmail,
      phone: '+1234567890',
      password: hashedPassword,
      role: 'admin',
      isVerified: true,
      isRegCompleted: true,
      isRegVerified: true,
      isActive: true,
    });

    logger.info(`Admin user created: ${adminEmail}`);
    logger.info(`Default password: ${adminPassword}`);
    logger.warn('⚠️  Please change the admin password after first login!');

    return admin;
  } catch (error) {
    logger.error(`Failed to create admin user: ${error.message}`);
    throw error;
  }
};

const seedVehicleTypes = async () => {
  try {
    for (const vehicleTypeData of vehicleTypes) {
      const existingType = await VehicleType.findOne({ name: vehicleTypeData.name });

      if (existingType) {
        logger.info(`Vehicle type ${vehicleTypeData.name} already exists`);
        continue;
      }

      await VehicleType.create(vehicleTypeData);
      logger.info(`Created vehicle type: ${vehicleTypeData.displayName}`);
    }
  } catch (error) {
    logger.error(`Failed to seed vehicle types: ${error.message}`);
    throw error;
  }
};

const initializeDatabase = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    logger.info('Initializing database...');

    // Create admin user
    await createAdminUser();

    // Seed vehicle types
    await seedVehicleTypes();

    logger.info('✅ Database initialization completed successfully!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error(`Database initialization failed: ${error.message}`);
    process.exit(1);
  }
};

// Run initialization
initializeDatabase();
