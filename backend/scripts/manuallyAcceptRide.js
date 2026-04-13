#!/usr/bin/env node

/**
 * Manually accept a ride by directly updating the database
 * This bypasses authentication for testing purposes
 * 
 * Usage: node scripts/manuallyAcceptRide.js <ride_id>
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Ride from '../src/models/Ride.js';
import Driver from '../src/models/Driver.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const rideId = process.argv[2];

if (!rideId) {
  console.error('Usage: node scripts/manuallyAcceptRide.js <ride_id>');
  console.error('Example: node scripts/manuallyAcceptRide.js 69737a4badcdf2da0b0226ff');
  process.exit(1);
}

const manuallyAcceptRide = async () => {
  try {
    logger.info('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    logger.info('✅ Connected to MongoDB\n');

    // Find the ride
    const ride = await Ride.findById(rideId);
    if (!ride) {
      logger.error(`❌ Ride ${rideId} not found`);
      await mongoose.connection.close();
      process.exit(1);
    }

    const vehicleTypeId = ride.vehicleType?._id || ride.vehicleType;

    logger.info(`📋 Found ride: ${rideId}`);
    logger.info(`   Status: ${ride.status}`);
    logger.info(`   Vehicle Type: ${vehicleTypeId}`);
    logger.info(`   Driver: ${ride.driver || 'None'}\n`);

    if (!['requested', 'searching'].includes(ride.status) || ride.driver) {
      logger.warn('⚠️  Ride already has a driver or is not in requested status');
      logger.info(`   Current status: ${ride.status}`);
      logger.info(`   Current driver: ${ride.driver || 'None'}\n`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Find an available driver matching the vehicle type
    let driver = await Driver.findOne({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
      'vehicleDetails.vehicleType': vehicleTypeId,
    });

    // If no matching vehicle type, find any available driver
    if (!driver) {
      logger.warn('⚠️  No driver with matching vehicle type, finding any available driver...');
      driver = await Driver.findOne({
        isOnline: true,
        isAvailable: true,
        documentsVerified: true,
        verificationStatus: 'approved',
      });

      if (driver && driver.vehicleDetails) {
        // Temporarily update vehicle type to match
        driver.vehicleDetails.vehicleType = vehicleTypeId;
        await driver.save();
        logger.info(`✅ Updated driver vehicle type to match ride\n`);
      }
    }

    if (!driver) {
      logger.error('❌ No available drivers found');
      await mongoose.connection.close();
      process.exit(1);
    }

    logger.info(`✅ Found driver: ${driver._id}`);
    logger.info(`   Driver ID: ${driver._id}\n`);

    // Assign driver to ride
    ride.driver = driver._id;
    ride.status = 'accepted';
    ride.acceptedByDriver = true;
    ride.acceptedAt = new Date();
    
    if (!ride.statusHistory) {
      ride.statusHistory = [];
    }
    ride.statusHistory.push({
      status: 'accepted',
      timestamp: new Date(),
      note: `Manually assigned to driver ${driver._id} for testing`,
    });

    await ride.save();

    // Make driver unavailable
    driver.isAvailable = false;
    await driver.save();

    // Emit socket notification if available
    try {
      const { getSocketService } = await import('../src/services/socketService.js');
      const socketService = getSocketService();
      if (socketService) {
        // Populate for socket emission
        try {
          await ride.populate('rider', 'name phone');
          await ride.populate('driver.user', 'name phone');
        } catch (err) {
          // Continue without populate
        }
        socketService.emitRideAccepted(ride, driver);
        socketService.emitRideStatusUpdate(ride, 'accepted', driver);
        logger.info('✅ Sent real-time notifications\n');
      }
    } catch (err) {
      logger.warn('⚠️  Socket service not available, skipping notifications');
    }

    logger.info('✅ Ride accepted successfully!');
    logger.info(`   Driver: ${driver._id}`);
    logger.info(`   Status: accepted\n`);

    await mongoose.connection.close();
    logger.info('🎉 Done! The ride should now progress in the app.\n');
    process.exit(0);
  } catch (error) {
    logger.error(`❌ Error: ${error.message}`);
    logger.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
};

manuallyAcceptRide();
