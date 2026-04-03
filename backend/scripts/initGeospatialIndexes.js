#!/usr/bin/env node
/**
 * Initialize MongoDB geospatial indexes for Keke ride-hailing
 * Run: node scripts/initGeospatialIndexes.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke';

async function initIndexes() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;

    // drivers: 2dsphere index for location (dispatch queries)
    try {
      await db.collection('drivers').createIndex(
        { currentLocation: '2dsphere' },
        { name: 'location_2dsphere' }
      );
      console.log('✅ drivers.location 2dsphere index created');
    } catch (e) {
      if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
        console.log('✅ drivers.location 2dsphere index already exists');
      } else throw e;
    }

    // rides: 2dsphere indexes for pickup/dropoff
    for (const field of ['pickupLocation', 'dropoffLocation']) {
      try {
        await db.collection('rides').createIndex(
          { [field]: '2dsphere' },
          { name: `${field}_2dsphere` }
        );
        console.log(`✅ rides.${field} 2dsphere index created`);
      } catch (e) {
        if (e.code === 85 || e.codeName === 'IndexOptionsConflict') {
          console.log(`✅ rides.${field} 2dsphere index already exists`);
        } else throw e;
      }
    }

    console.log('\nGeospatial indexes initialized.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

initIndexes();
