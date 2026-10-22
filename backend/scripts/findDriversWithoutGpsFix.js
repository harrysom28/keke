#!/usr/bin/env node
/**
 * Read-only: approved online drivers whose GPS is missing, [0,0], or stale (>15 min).
 * Prints phone numbers so ops can call them.
 *
 *   cd backend && node scripts/findDriversWithoutGpsFix.js
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

const STALE_MS = 15 * 60 * 1000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const Driver = (await import('../src/models/Driver.js')).default;

await mongoose.connect(MONGODB_URI);
console.log(`Connected to ${mongoose.connection.db.databaseName} (read-only)`);

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

if (bad.length === 0) {
  console.log('All approved online drivers have a fresh GPS fix.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Found ${bad.length} driver(s) without a usable GPS fix:\n`);
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

await mongoose.disconnect();
process.exit(0);
