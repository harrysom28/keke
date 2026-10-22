#!/usr/bin/env node
/**
 * List online drivers stuck as isAvailable:false with no active ride.
 *
 * Dry-run by default. Pass --fix to reset them via restoreDriverAvailabilityAfterTrip.
 *
 *   cd backend && node scripts/findStuckDrivers.js
 *   cd backend && node scripts/findStuckDrivers.js --fix
 *
 * Uses MONGODB_URI from .env (or env).
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const doFix = process.argv.includes('--fix');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const Driver = (await import('../src/models/Driver.js')).default;
const Ride = (await import('../src/models/Ride.js')).default;
const { restoreDriverAvailabilityAfterTrip } = await import(
  '../src/services/driverAvailabilityService.js'
);

await mongoose.connect(MONGODB_URI);
console.log(`Connected to ${mongoose.connection.db.databaseName} (${doFix ? 'FIX' : 'dry-run'})`);

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

if (stuck.length === 0) {
  console.log('No stuck drivers found.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Found ${stuck.length} stuck driver(s):\n`);
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

await mongoose.disconnect();
process.exit(0);
