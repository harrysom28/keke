#!/usr/bin/env node
/**
 * Manually accept a ride by directly updating the database
 * This bypasses authentication for testing purposes
 * 
 * Usage: node manually-accept-ride.js <ride_id>
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../backend/.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const rideId = process.argv[2];

if (!rideId) {
  console.error('Usage: node manually-accept-ride.js <ride_id>');
  console.error('Example: node manually-accept-ride.js 69737a4badcdf2da0b0226ff');
  process.exit(1);
}

async function manuallyAcceptRide() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Import models
    const Ride = mongoose.model('Ride', new mongoose.Schema({}, { strict: false }));
    const Driver = mongoose.model('Driver', new mongoose.Schema({}, { strict: false }));

    // Find the ride
    const ride = await Ride.findById(rideId);
    if (!ride) {
      console.error(`❌ Ride ${rideId} not found`);
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`📋 Found ride: ${rideId}`);
    console.log(`   Status: ${ride.status}`);
    console.log(`   Vehicle Type: ${ride.vehicleType}`);
    console.log(`   Driver: ${ride.driver || 'None'}\n`);

    if (ride.status !== 'requested' || ride.driver) {
      console.log('⚠️  Ride already has a driver or is not in requested status');
      console.log(`   Current status: ${ride.status}`);
      console.log(`   Current driver: ${ride.driver || 'None'}\n`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Find an available driver matching the vehicle type
    let driver = await Driver.findOne({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
      'vehicleDetails.vehicleType': ride.vehicleType,
    }).populate('user');

    // If no matching vehicle type, find any available driver
    if (!driver) {
      console.log('⚠️  No driver with matching vehicle type, finding any available driver...');
      driver = await Driver.findOne({
        isOnline: true,
        isAvailable: true,
        documentsVerified: true,
        verificationStatus: 'approved',
      }).populate('user');

      if (driver && driver.vehicleDetails) {
        // Temporarily update vehicle type to match
        driver.vehicleDetails.vehicleType = ride.vehicleType;
        await driver.save();
        console.log(`✅ Updated driver vehicle type to match ride\n`);
      }
    }

    if (!driver) {
      console.error('❌ No available drivers found');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log(`✅ Found driver: ${driver.user?.name || driver._id}`);
    console.log(`   Driver ID: ${driver._id}\n`);

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

    console.log('✅ Ride accepted successfully!');
    console.log(`   Driver: ${driver.user?.name || driver._id}`);
    console.log(`   Status: accepted\n`);

    await mongoose.connection.close();
    console.log('🎉 Done! The ride should now progress in the app.\n');
    process.exit(0);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

manuallyAcceptRide();
