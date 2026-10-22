#!/usr/bin/env node
/**
 * Read-only: approved drivers whose vehicleDetails.vehicleType is null, missing,
 * or not a valid VehicleType _id.
 *
 *   cd backend && node scripts/findDriversWithoutVehicleType.js
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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/keke-ride-hailing';

const Driver = (await import('../src/models/Driver.js')).default;
const VehicleType = (await import('../src/models/VehicleType.js')).default;

await mongoose.connect(MONGODB_URI);
console.log(`Connected to ${mongoose.connection.db.databaseName} (read-only)`);

const validTypeIds = new Set(
  (await VehicleType.find({}).select('_id').lean()).map((vt) => String(vt._id))
);

const drivers = await Driver.find({ verificationStatus: 'approved' })
  .populate('user', 'name phone')
  .select('_id user vehicleDetails.vehicleType isOnline isAvailable')
  .lean();

const bad = [];
for (const d of drivers) {
  const vt = d.vehicleDetails?.vehicleType;
  let reason = null;
  if (vt == null) reason = 'null/missing';
  else if (!mongoose.Types.ObjectId.isValid(vt)) reason = `invalid ObjectId (${vt})`;
  else if (!validTypeIds.has(String(vt))) reason = `orphan VehicleType id ${vt}`;

  if (reason) bad.push({ d, reason });
}

if (bad.length === 0) {
  console.log('All approved drivers have a valid vehicleType.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log(`Found ${bad.length} approved driver(s) without a valid vehicle type:\n`);
for (const { d, reason } of bad) {
  console.log(
    [
      `_id=${d._id}`,
      `name=${d.user?.name || '?'}`,
      `phone=${d.user?.phone || '?'}`,
      `online=${d.isOnline}`,
      `available=${d.isAvailable}`,
      `reason=${reason}`,
    ].join('  ')
  );
}

await mongoose.disconnect();
process.exit(0);
