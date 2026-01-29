#!/usr/bin/env node

/**
 * Seed test drivers for development and testing
 * Creates test drivers around Abakaliki area with different vehicle types
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Driver from '../src/models/Driver.js';
import VehicleType from '../src/models/VehicleType.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

// Abakaliki center coordinates
const BASE_LAT = 6.32306;
const BASE_LNG = 8.11201;

// Vehicle types to create if they don't exist
const vehicleTypes = [
  {
    name: 'keke',
    displayName: 'Keke',
    description: 'Affordable three-wheeled rides',
    baseFare: 1.50,
    perKmRate: 0.80,
    perMinuteRate: 0.20,
    multiplier: 1.0,
    capacity: 3,
    order: 1,
    isActive: true,
  },
  {
    name: 'bike',
    displayName: 'Bike',
    description: 'Fast motorcycle rides',
    baseFare: 1.00,
    perKmRate: 0.50,
    perMinuteRate: 0.15,
    multiplier: 0.8,
    capacity: 2,
    order: 2,
    isActive: true,
  },
  {
    name: 'car',
    displayName: 'Car',
    description: 'Comfortable car rides',
    baseFare: 2.50,
    perKmRate: 1.50,
    perMinuteRate: 0.30,
    multiplier: 1.0,
    capacity: 4,
    order: 3,
    isActive: true,
  },
];

const seedVehicleTypes = async () => {
  try {
    let createdCount = 0;
    for (const vehicleTypeData of vehicleTypes) {
      const existingType = await VehicleType.findOne({ name: vehicleTypeData.name });

      if (existingType) {
        logger.info(`Vehicle type ${vehicleTypeData.name} already exists`);
        continue;
      }

      await VehicleType.create(vehicleTypeData);
      logger.info(`Created vehicle type: ${vehicleTypeData.displayName}`);
      createdCount++;
    }
    
    if (createdCount > 0) {
      logger.info(`✅ Created ${createdCount} vehicle types`);
    }
  } catch (error) {
    logger.error(`Failed to seed vehicle types: ${error.message}`);
    throw error;
  }
};

// Test drivers data - spread around Abakaliki area
const testDrivers = [
  {
    user: {
      name: 'John Driver',
      email: 'driver1@test.com',
      phone: '+2348012345678',
      password: 'Driver@123',
    },
    driver: {
      licenseNumber: 'DL-001-2024',
      vehicleDetails: {
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
        plateNumber: 'ABC-123-XY',
        color: 'White',
      },
      location: {
        lat: BASE_LAT + 0.005, // ~500m north
        lng: BASE_LNG + 0.003, // ~300m east
      },
      rating: { average: 4.8, count: 150 },
    },
  },
  {
    user: {
      name: 'Mary Driver',
      email: 'driver2@test.com',
      phone: '+2348012345679',
      password: 'Driver@123',
    },
    driver: {
      licenseNumber: 'DL-002-2024',
      vehicleDetails: {
        make: 'Honda',
        model: 'Civic',
        year: 2021,
        plateNumber: 'DEF-456-YZ',
        color: 'Black',
      },
      location: {
        lat: BASE_LAT - 0.004, // ~400m south
        lng: BASE_LNG + 0.006, // ~600m east
      },
      rating: { average: 4.6, count: 120 },
    },
  },
  {
    user: {
      name: 'David Keke',
      email: 'driver3@test.com',
      phone: '+2348012345680',
      password: 'Driver@123',
    },
    driver: {
      licenseNumber: 'DL-003-2024',
      vehicleDetails: {
        make: 'Tuk-Tuk',
        model: 'Auto Rickshaw',
        year: 2023,
        plateNumber: 'KEK-789-AB',
        color: 'Yellow',
      },
      location: {
        lat: BASE_LAT + 0.003, // ~300m north
        lng: BASE_LNG - 0.005, // ~500m west
      },
      rating: { average: 4.7, count: 200 },
    },
  },
  {
    user: {
      name: 'Sarah Bike',
      email: 'driver4@test.com',
      phone: '+2348012345681',
      password: 'Driver@123',
    },
    driver: {
      licenseNumber: 'DL-004-2024',
      vehicleDetails: {
        make: 'Yamaha',
        model: 'Motorbike',
        year: 2024,
        plateNumber: 'BIK-321-CD',
        color: 'Red',
      },
      location: {
        lat: BASE_LAT - 0.006, // ~600m south
        lng: BASE_LNG - 0.002, // ~200m west
      },
      rating: { average: 4.5, count: 80 },
    },
  },
  {
    user: {
      name: 'Michael Car',
      email: 'driver5@test.com',
      phone: '+2348012345682',
      password: 'Driver@123',
    },
    driver: {
      licenseNumber: 'DL-005-2024',
      vehicleDetails: {
        make: 'Nissan',
        model: 'Altima',
        year: 2023,
        plateNumber: 'CAR-654-EF',
        color: 'Silver',
      },
      location: {
        lat: BASE_LAT + 0.008, // ~800m north
        lng: BASE_LNG + 0.007, // ~700m east
      },
      rating: { average: 4.9, count: 250 },
    },
  },
];

const seedTestDrivers = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Seed vehicle types if they don't exist
    logger.info('Checking vehicle types...');
    await seedVehicleTypes();
    
    // Get ALL vehicle types from database (don't create new ones, use existing)
    const availableVehicleTypes = await VehicleType.find({ isActive: true }).sort({ order: 1 });
    
    if (availableVehicleTypes.length === 0) {
      logger.error('❌ No vehicle types found. Please run: npm run init:db first');
      await mongoose.connection.close();
      process.exit(1);
    }

    logger.info(`Found ${availableVehicleTypes.length} vehicle types: ${availableVehicleTypes.map(vt => vt.name).join(', ')}`);
    
    // Create at least one driver for EACH vehicle type
    const getVehicleTypeId = (index) => {
      // Distribute drivers across all available vehicle types
      return availableVehicleTypes[index % availableVehicleTypes.length]._id;
    };

    let createdCount = 0;
    let skippedCount = 0;

    // Create additional drivers to ensure each vehicle type has at least one driver
    const driversToCreate = Math.max(testDrivers.length, availableVehicleTypes.length);
    
    for (let i = 0; i < driversToCreate; i++) {
      // Use existing driver data or create new one
      const driverIndex = i % testDrivers.length;
      const { user: userData, driver: driverData } = testDrivers[driverIndex];
      
      // Modify user data to make each unique
      const uniqueUserData = {
        ...userData,
        email: `driver${i + 1}@test.com`,
        phone: `+2348012345${String(i + 1).padStart(3, '0')}`,
        name: `${userData.name.split(' ')[0]} ${i + 1}`,
      };
      
      const uniqueDriverData = {
        ...driverData,
        licenseNumber: `DL-${String(i + 1).padStart(3, '0')}-2024`,
        vehicleDetails: {
          ...driverData.vehicleDetails,
          plateNumber: `${driverData.vehicleDetails.plateNumber.split('-')[0]}-${String(i + 1).padStart(3, '0')}-${driverData.vehicleDetails.plateNumber.split('-')[2]}`,
        },
      };

      try {
        // Check if user already exists
        let user = await User.findOne({
          $or: [
            { email: uniqueUserData.email },
            { phone: uniqueUserData.phone },
          ],
        });

        // Create user if doesn't exist
        if (!user) {
          const hashedPassword = await bcrypt.hash(uniqueUserData.password, 12);
          user = await User.create({
            ...uniqueUserData,
            password: hashedPassword,
            role: 'driver',
            isVerified: true,
            isRegCompleted: true,
            isRegVerified: true,
            isActive: true,
          });
          logger.info(`✅ Created user: ${user.name} (${user.email})`);
        } else {
          logger.info(`⚠️  User already exists: ${user.email}`);
        }

        // Check if driver already exists
        const existingDriver = await Driver.findOne({ user: user._id });

        if (existingDriver) {
          logger.info(`⚠️  Driver already exists for user ${user.email}, updating...`);
          
          // Update driver to be online and available with test location
          existingDriver.isOnline = true;
          existingDriver.isAvailable = true;
          existingDriver.documentsVerified = true;
          existingDriver.verificationStatus = 'approved';
          
          // Update location with variation
          const latOffset = (Math.random() - 0.5) * 0.01;
          const lngOffset = (Math.random() - 0.5) * 0.01;
          existingDriver.currentLocation = {
            type: 'Point',
            coordinates: [BASE_LNG + lngOffset, BASE_LAT + latOffset],
            address: `Test Location ${i + 1}, Abakaliki`,
            lastUpdated: new Date(),
          };
          
          // Update vehicle type to ensure distribution
          const vehicleTypeId = getVehicleTypeId(i);
          if (existingDriver.vehicleDetails) {
            existingDriver.vehicleDetails.vehicleType = vehicleTypeId;
          }
          
          // Update rating if provided
          if (uniqueDriverData.rating) {
            existingDriver.rating = uniqueDriverData.rating;
          }
          
          await existingDriver.save();
          skippedCount++;
          const vehicleTypeName = (await VehicleType.findById(vehicleTypeId))?.name || 'Unknown';
          logger.info(`✅ Updated driver: ${user.name} (${vehicleTypeName})`);
        } else {
          // Create driver
          const vehicleTypeId = getVehicleTypeId(i);
          const vehicleType = await VehicleType.findById(vehicleTypeId);
          
          // Add location variation
          const latOffset = (Math.random() - 0.5) * 0.01;
          const lngOffset = (Math.random() - 0.5) * 0.01;
          
          const driver = await Driver.create({
            user: user._id,
            licenseNumber: uniqueDriverData.licenseNumber,
            licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            vehicleDetails: {
              ...uniqueDriverData.vehicleDetails,
              vehicleType: vehicleTypeId,
            },
            currentLocation: {
              type: 'Point',
              coordinates: [BASE_LNG + lngOffset, BASE_LAT + latOffset],
              address: `Test Location ${i + 1}, Abakaliki`,
              lastUpdated: new Date(),
            },
            isOnline: true,
            isAvailable: true,
            documentsVerified: true,
            verificationStatus: 'approved',
            rating: uniqueDriverData.rating || { average: 4.5, count: 100 },
            acceptanceRate: 85 + (i % 15), // Random acceptance rate 85-99
            totalRides: 50 + (i * 20),
          });

          createdCount++;
          logger.info(`✅ Created driver: ${user.name} (${uniqueDriverData.vehicleDetails.plateNumber}) - ${vehicleType?.name || 'Unknown'}`);
        }
      } catch (error) {
        logger.error(`❌ Failed to create driver ${uniqueUserData.name}: ${error.message}`);
      }
    }

    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📊 Test Drivers Seeding Summary');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`✅ Created: ${createdCount} new drivers`);
    logger.info(`🔄 Updated: ${skippedCount} existing drivers`);
    logger.info(`📍 Location: Abakaliki area (${BASE_LAT}, ${BASE_LNG})`);
    logger.info('');
    logger.info('🧪 Test Driver Credentials:');
    logger.info('   Email: driver1@test.com - driver5@test.com');
    logger.info('   Password: Driver@123');
    logger.info('');
    logger.info('✅ Test drivers seeding completed!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Failed to seed test drivers: ${error.message}`);
    logger.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run seeding
seedTestDrivers();
