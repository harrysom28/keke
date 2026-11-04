#!/usr/bin/env node
/**
 * Unset currentLocation on drivers whose coordinates are the [0, 0] placeholder
 * so the 2dsphere index drops those points.
 *
 * Dry-run by default. Pass --fix to apply.
 *
 *   cd backend && node scripts/clearZeroZeroLocations.js
 *   cd backend && node scripts/clearZeroZeroLocations.js --fix
 *
 * Connects via MONGODB_URI from backend/.env (connectDB). Refuses a database
 * literally named "test" unless --allow-test-db is passed.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
// Register models before any populate() — schema refs alone are not enough.
import User from '../src/models/User.js';
import Driver from '../src/models/Driver.js';
import VehicleType from '../src/models/VehicleType.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const doFix = process.argv.includes('--fix');
const allowTestDb = process.argv.includes('--allow-test-db');

const run = async () => {
  await connectDB();
  const dbName = mongoose.connection.name;
  console.log(`Connected to ${dbName} (${doFix ? 'FIX' : 'dry-run'})`);

  if (dbName === 'test' && !allowTestDb) {
    console.error(
      'Refusing to run against database "test". Check MONGODB_URI in backend/.env, ' +
        'or pass --allow-test-db if you really mean it.'
    );
    await disconnectDB();
    process.exit(2);
  }

  const drivers = await Driver.find({
    'currentLocation.coordinates.0': 0,
    'currentLocation.coordinates.1': 0,
  })
    .populate('user', 'name phone')
    .select('_id user currentLocation isOnline')
    .lean();

  console.log(`Found ${drivers.length} driver(s) with [0,0] coordinates.`);
  if (drivers.length === 0) {
    await disconnectDB();
    process.exit(0);
  }

  console.log('');
  for (const d of drivers) {
    console.log(
      [
        `_id=${d._id}`,
        `name=${d.user?.name || '?'}`,
        `phone=${d.user?.phone || '?'}`,
        `online=${d.isOnline}`,
        `coordinates=${JSON.stringify(d.currentLocation?.coordinates)}`,
      ].join('  ')
    );

    if (doFix) {
      const res = await Driver.updateOne({ _id: d._id }, { $unset: { currentLocation: '' } });
      console.log(res.modifiedCount === 1 ? '  → unset currentLocation' : '  → unset failed / unchanged');
    }
  }

  if (!doFix) {
    console.log('\nRe-run with --fix to unset currentLocation on these drivers.');
  }

  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
