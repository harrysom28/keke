#!/usr/bin/env node
/**
 * List online drivers stuck as isAvailable:false with no active ride.
 *
 * Dry-run by default. Pass --fix to reset them via restoreDriverAvailabilityAfterTrip.
 *
 *   cd backend && node scripts/findStuckDrivers.js
 *   cd backend && node scripts/findStuckDrivers.js --fix
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
import Ride from '../src/models/Ride.js';
import VehicleType from '../src/models/VehicleType.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { restoreDriverAvailabilityAfterTrip } from '../src/services/driverAvailabilityService.js';

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

  const candidates = await Driver.find({
    isOnline: true,
    isAvailable: false,
  })
    .populate('user', 'name phone')
    .select('_id user lastActiveAt isOnline isAvailable')
    .lean();

  const stuck = [];
  for (const d of candidates) {
    const active = await Ride.findActiveRideForDriver(d._id);
    if (active) continue;

    const lastRide = await Ride.findOne({ driver: d._id })
      .sort({ updatedAt: -1 })
      .select('_id status updatedAt cancelledAt completedAt')
      .lean();

    stuck.push({ driver: d, lastRide });
  }

  console.log(`Found ${stuck.length} stuck driver(s).`);
  if (stuck.length === 0) {
    await disconnectDB();
    process.exit(0);
  }

  console.log('');
  for (const { driver: d, lastRide } of stuck) {
    console.log(
      [
        `_id=${d._id}`,
        `name=${d.user?.name || '?'}`,
        `phone=${d.user?.phone || '?'}`,
        `lastActiveAt=${d.lastActiveAt?.toISOString?.() || d.lastActiveAt || 'n/a'}`,
        `lastRide=${lastRide ? `${lastRide._id} status=${lastRide.status}` : 'none'}`,
      ].join('  ')
    );

    if (doFix) {
      const ok = await restoreDriverAvailabilityAfterTrip(d._id);
      console.log(ok ? `  → restored` : `  → restore failed / missing`);
    }
  }

  if (!doFix) {
    console.log('\nRe-run with --fix to restore these drivers.');
  }

  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
