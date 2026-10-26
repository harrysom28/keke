#!/usr/bin/env node
/**
 * Give legacy approved drivers a verified KYC and vehicle record.
 *
 * Drivers approved through the old single-step Verify button often have no
 * DriverKyc / DriverVehicle, or those records are still pending. The next
 * per-document approve used to recompute them as not fully verified and take
 * them offline. This backfill marks the missing or pending sub-documents
 * verified so they match the driver who is already approved.
 *
 * Rejected sub-documents are left alone and printed for a human to review.
 *
 * Dry-run by default. Pass --fix to write.
 *
 *   cd backend && node scripts/backfillLegacyKycVerified.js
 *   cd backend && node scripts/backfillLegacyKycVerified.js --fix
 */
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import Driver from '../src/models/Driver.js';
import DriverKyc from '../src/models/DriverKyc.js';
import DriverVehicle from '../src/models/DriverVehicle.js';
import User from '../src/models/User.js';
import { connectDB, disconnectDB } from '../src/config/database.js';

const LEGACY_DOC = 'legacy-approved';

export async function backfillLegacyKycVerified({ fix = false } = {}) {
  const drivers = await Driver.find({ verificationStatus: 'approved' })
    .select('user licenseNumber vehicleDetails documentsVerified')
    .lean();

  const summary = {
    approvedDrivers: drivers.length,
    kycVerified: 0,
    kycCreated: 0,
    vehicleVerified: 0,
    vehicleCreated: 0,
    vehicleSkipped: 0,
    rejectedLeft: 0,
    documentsFlagged: 0,
    userKycUpdated: 0,
  };

  for (const driver of drivers) {
    const userId = driver.user;
    if (!userId) continue;

    const [kyc, vehicle] = await Promise.all([
      DriverKyc.findOne({ userId }).select('verificationStatus').lean(),
      DriverVehicle.findOne({ userId }).select('verificationStatus').lean(),
    ]);
    let leftRejected = false;

    if (!kyc) {
      summary.kycCreated += 1;
      if (fix) {
        await DriverKyc.create({
          userId,
          idType: 'drivers_license',
          idNumber: driver.licenseNumber || `LEGACY-${userId}`,
          idImageUrl: LEGACY_DOC,
          selfieUrl: LEGACY_DOC,
          verificationStatus: 'verified',
          rejectionReason: null,
          reviewRequestedAt: null,
        });
      }
    } else if (kyc.verificationStatus === 'pending') {
      summary.kycVerified += 1;
      if (fix) {
        await DriverKyc.updateOne(
          { _id: kyc._id },
          { $set: { verificationStatus: 'verified', rejectionReason: null, reviewRequestedAt: null } }
        );
      }
    } else if (kyc.verificationStatus === 'rejected') {
      summary.rejectedLeft += 1;
      leftRejected = true;
      console.log(`  leave rejected KYC for user ${userId}`);
    }

    const details = driver.vehicleDetails || {};
    const vehicleType = details.vehicleType;
    const plate = details.plateNumber ? String(details.plateNumber).toUpperCase().trim() : '';

    if (!vehicle) {
        const yearNum = Number(details.year);
        const year = yearNum >= 1900 && yearNum <= new Date().getFullYear() + 1
          ? yearNum
          : new Date().getFullYear();
        if (!vehicleType || !plate) {
        summary.vehicleSkipped += 1;
        console.log(`  skip vehicle create for user ${userId}: missing ${!vehicleType ? 'vehicle type' : 'plate'}`);
      } else {
        summary.vehicleCreated += 1;
        if (fix) {
          await DriverVehicle.create({
            userId,
            vehicleType,
            plateNumber: plate,
            make: details.make || null,
            model: details.model || null,
            year,
            color: details.color || null,
            verificationStatus: 'verified',
            rejectionReason: null,
            reviewRequestedAt: null,
          });
        }
      }
    } else if (vehicle.verificationStatus === 'pending') {
      summary.vehicleVerified += 1;
      if (fix) {
        await DriverVehicle.updateOne(
          { _id: vehicle._id },
          { $set: { verificationStatus: 'verified', rejectionReason: null, reviewRequestedAt: null } }
        );
      }
    } else if (vehicle.verificationStatus === 'rejected') {
      summary.rejectedLeft += 1;
      leftRejected = true;
      console.log(`  leave rejected vehicle for user ${userId}`);
    }

    if (!driver.documentsVerified) {
      summary.documentsFlagged += 1;
      if (fix) {
        await Driver.updateOne({ _id: driver._id }, { $set: { documentsVerified: true } });
      }
    }

    const user = await User.findById(userId).select('kycStatus').lean();
    if (!leftRejected && user && user.kycStatus !== 'verified') {
      summary.userKycUpdated += 1;
      if (fix) {
        await User.updateOne({ _id: userId }, { $set: { kycStatus: 'verified' } });
      }
    }
  }

  return summary;
}

async function main() {
  dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

  const fix = process.argv.includes('--fix');
  const allowTestDb = process.argv.includes('--allow-test-db');

  await connectDB();
  const dbName = mongoose.connection.name;
  console.log(`Connected to ${dbName} (${fix ? 'FIX' : 'dry-run'})`);

  if (dbName === 'test' && !allowTestDb) {
    console.error(
      'Refusing to run against database "test". Check MONGODB_URI in backend/.env, ' +
        'or pass --allow-test-db if you really mean it.'
    );
    await disconnectDB();
    process.exit(2);
  }

  const summary = await backfillLegacyKycVerified({ fix });
  console.log(JSON.stringify(summary, null, 2));
  if (!fix) {
    console.log('\nRe-run with --fix to write verified sub-documents.');
  }

  await disconnectDB();
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch(async (err) => {
    console.error(err);
    try { await disconnectDB(); } catch (_) {}
    process.exit(1);
  });
}
