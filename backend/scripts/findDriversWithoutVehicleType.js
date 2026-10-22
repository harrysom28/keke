#!/usr/bin/env node
/**
 * Read-only: approved drivers whose vehicleDetails.vehicleType is null, missing,
 * or not a valid VehicleType _id.
 *
 *   cd backend && node scripts/findDriversWithoutVehicleType.js
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

  console.log(`Found ${bad.length} approved driver(s) without a valid vehicle type.`);
  if (bad.length === 0) {
    console.log('All approved drivers have a valid vehicleType.');
    await disconnectDB();
    process.exit(0);
  }

  console.log('');
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

  await disconnectDB();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
