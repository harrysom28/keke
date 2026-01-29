import mongoose from 'mongoose';
import dotenv from 'dotenv';
import VehicleType from '../src/models/VehicleType.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

// Vehicle types: keke, bike, taxi
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
    colors: [
      { name: 'Yellow', code: '#FFD700', isActive: true },
      { name: 'Green', code: '#008000', isActive: true },
      { name: 'Blue', code: '#0000FF', isActive: true },
    ],
    years: Array.from({ length: 10 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
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
    colors: [
      { name: 'Black', code: '#000000', isActive: true },
      { name: 'Red', code: '#FF0000', isActive: true },
      { name: 'Blue', code: '#0000FF', isActive: true },
      { name: 'White', code: '#FFFFFF', isActive: true },
    ],
    models: [
      { name: 'Honda', make: 'Honda', year: 2020, isActive: true },
      { name: 'Yamaha', make: 'Yamaha', year: 2020, isActive: true },
      { name: 'Bajaj', make: 'Bajaj', year: 2020, isActive: true },
    ],
    years: Array.from({ length: 10 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
  },
  {
    name: 'taxi',
    displayName: 'Taxi',
    description: 'Comfortable car rides',
    baseFare: 2.50,
    perKmRate: 1.50,
    perMinuteRate: 0.30,
    multiplier: 1.0,
    capacity: 4,
    order: 3,
    isActive: true,
    colors: [
      { name: 'Black', code: '#000000', isActive: true },
      { name: 'White', code: '#FFFFFF', isActive: true },
      { name: 'Silver', code: '#C0C0C0', isActive: true },
      { name: 'Blue', code: '#0000FF', isActive: true },
    ],
    models: [
      { name: 'Toyota Corolla', make: 'Toyota', year: 2020, isActive: true },
      { name: 'Honda Civic', make: 'Honda', year: 2020, isActive: true },
      { name: 'Nissan Altima', make: 'Nissan', year: 2020, isActive: true },
    ],
    years: Array.from({ length: 10 }, (_, i) => ({
      value: new Date().getFullYear() - i,
      isActive: true,
    })),
  },
];

const seedVehicleTypes = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    let createdCount = 0;
    let updatedCount = 0;

    for (const vehicleTypeData of vehicleTypes) {
      const existingType = await VehicleType.findOne({ name: vehicleTypeData.name });

      if (existingType) {
        // Update existing vehicle type
        Object.assign(existingType, vehicleTypeData);
        await existingType.save();
        logger.info(`Updated vehicle type: ${vehicleTypeData.displayName}`);
        updatedCount++;
      } else {
        // Create new vehicle type
        await VehicleType.create(vehicleTypeData);
        logger.info(`Created vehicle type: ${vehicleTypeData.displayName}`);
        createdCount++;
      }
    }

    logger.info(`✅ Vehicle types seeding completed: ${createdCount} created, ${updatedCount} updated`);

    // List all vehicle types
    const allTypes = await VehicleType.find().sort({ order: 1 });
    logger.info(`Total vehicle types in database: ${allTypes.length}`);
    allTypes.forEach((type) => {
      logger.info(`  - ${type.displayName} (${type.name}) - Active: ${type.isActive}`);
    });

    process.exit(0);
  } catch (error) {
    logger.error(`Failed to seed vehicle types: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

seedVehicleTypes();
