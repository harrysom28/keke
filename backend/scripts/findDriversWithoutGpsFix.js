#!/usr/bin/env node
/**
 * Read-only: approved online drivers whose GPS is missing, [0,0], or stale (>15 min).
 * Prints phone numbers so ops can call them.
 *
 *   cd backend && node scripts/findDriversWithoutGpsFix.js
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

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const STALE_MS = 15 * 60 * 1000;
const allowTestDb = process.argv.includes('--allow-test-db');

const run = async () => {
  await connectDB();
  const dbName = mongoose.connection.name;
  console.log(`Connected to ${dbName} (read-only)`);

  if (dbName === 'test' && !allowTestDb) {
    console.error(
      'Refusing to run against database "test". Check MONGODB_URI in backend/.env, ' +
        'or pass --allow-test-db if you really mean it.'
    );
    await disconnectDB();
    process.exit(2);
  }

  const staleBefore = new Date(Date.now() - STALE_MS);
  const drivers = await Driver.find({
    verificationStatus: 'approved',
    isOnline: true,
  })
    .populate('user', 'name phone')
    .select('_id user currentLocation isAvailable lastActiveAt')
    .lean();

  const bad = [];
  for (const d of drivers) {
    const coords = d.currentLocation?.coordinates;
    const lng = coords?.[0];
    const lat = coords?.[1];
    const lastUpdated = d.currentLocation?.lastUpdated
      ? new Date(d.currentLocation.lastUpdated)
      : null;

    let reason = null;
    if (!coords || coords.length < 2) reason = 'missing coordinates';
    else if (lng === 0 && lat === 0) reason = '[0,0]';
    else if (!lastUpdated) reason = 'no lastUpdated';
    else if (lastUpdated < staleBefore) {
      const ageMin = Math.round((Date.now() - lastUpdated.getTime()) / 60000);
      reason = `stale (${ageMin}m)`;
    }

    if (reason) bad.push({ d, reason, lastUpdated });
  }

  console.log(`Found ${bad.length} driver(s) without a usable GPS fix.`);
  if (bad.length === 0) {
    console.log('All approved online drivers have a fresh GPS fix.');
    await disconnectDB();
    process.exit(0);
  }

  console.log('');
  for (const { d, reason, lastUpdated } of bad) {
    console.log(
      [
        `_id=${d._id}`,
        `name=${d.user?.name || '?'}`,
        `phone=${d.user?.phone || '?'}`,
        `available=${d.isAvailable}`,
        `reason=${reason}`,
        `lastUpdated=${lastUpdated?.toISOString?.() || 'n/a'}`,
      ].join('  ')
    );
  }

  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
