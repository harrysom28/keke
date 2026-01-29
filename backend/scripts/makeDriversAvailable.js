#!/usr/bin/env node

/**
 * Make all drivers available and online for testing
 * Updates all existing drivers to be online, available, and verified
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Driver from '../src/models/Driver.js';
import VehicleType from '../src/models/VehicleType.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

// Abakaliki center coordinates (default location)
const BASE_LAT = 6.32306;
const BASE_LNG = 8.11201;

const makeDriversAvailable = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    // Find all drivers
    const allDrivers = await Driver.find({});

    if (allDrivers.length === 0) {
      logger.warn('⚠️  No drivers found in database. Please run: npm run seed:drivers');
      await mongoose.connection.close();
      process.exit(0);
    }

    logger.info(`Found ${allDrivers.length} drivers`);

    let updatedCount = 0;
    let locationUpdatedCount = 0;

    for (const driver of allDrivers) {
      let needsUpdate = false;
      let needsLocationUpdate = false;

      // Check if driver needs to be made available
      if (!driver.isOnline || !driver.isAvailable || !driver.documentsVerified || driver.verificationStatus !== 'approved') {
        needsUpdate = true;
      }

      // Check if driver needs location update
      if (!driver.currentLocation || 
          !driver.currentLocation.coordinates || 
          driver.currentLocation.coordinates[0] === 0 || 
          driver.currentLocation.coordinates[1] === 0) {
        needsLocationUpdate = true;
      }

      if (needsUpdate) {
        driver.isOnline = true;
        driver.isAvailable = true;
        driver.documentsVerified = true;
        driver.verificationStatus = 'approved';
        updatedCount++;
      }

      if (needsLocationUpdate) {
        // Set location near Abakaliki with some variation
        const latOffset = (Math.random() - 0.5) * 0.01; // ~500m variation
        const lngOffset = (Math.random() - 0.5) * 0.01;
        
        driver.currentLocation = {
          type: 'Point',
          coordinates: [BASE_LNG + lngOffset, BASE_LAT + latOffset],
          address: `Test Location, Abakaliki`,
          lastUpdated: new Date(),
        };
        locationUpdatedCount++;
      }

      // Ensure rating exists
      if (!driver.rating || !driver.rating.average) {
        driver.rating = {
          average: 4.5 + Math.random() * 0.5, // 4.5 to 5.0
          count: 50 + Math.floor(Math.random() * 200),
        };
      }

      if (needsUpdate || needsLocationUpdate) {
        await driver.save();
        // Get vehicle type name if populated, otherwise fetch it
        let vehicleTypeName = 'Unknown';
        if (driver.vehicleDetails?.vehicleType?.name) {
          vehicleTypeName = driver.vehicleDetails.vehicleType.name;
        } else if (driver.vehicleDetails?.vehicleType) {
          const vehicleType = await VehicleType.findById(driver.vehicleDetails.vehicleType);
          vehicleTypeName = vehicleType?.name || 'Unknown';
        }
        logger.info(`✅ Updated driver: ${driver.user?.name || driver._id} (${vehicleTypeName})`);
      }
    }

    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('📊 Driver Availability Update Summary');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`✅ Updated availability: ${updatedCount} drivers`);
    logger.info(`📍 Updated locations: ${locationUpdatedCount} drivers`);
    logger.info(`📋 Total drivers: ${allDrivers.length}`);
    logger.info('');
    
    // Show breakdown by vehicle type
    const driversByType = {};
    for (const driver of allDrivers) {
      let vehicleTypeName = 'Unknown';
      if (driver.vehicleDetails?.vehicleType?.name) {
        vehicleTypeName = driver.vehicleDetails.vehicleType.name;
      } else if (driver.vehicleDetails?.vehicleType) {
        const vehicleType = await VehicleType.findById(driver.vehicleDetails.vehicleType);
        vehicleTypeName = vehicleType?.name || 'Unknown';
      }
      driversByType[vehicleTypeName] = (driversByType[vehicleTypeName] || 0) + 1;
    }
    
    logger.info('📊 Drivers by Vehicle Type:');
    for (const [type, count] of Object.entries(driversByType)) {
      logger.info(`   ${type}: ${count}`);
    }
    logger.info('');
    logger.info('✅ All drivers are now online and available!');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Failed to update drivers: ${error.message}`);
    logger.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

// Run the script
makeDriversAvailable();
