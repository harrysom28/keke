#!/usr/bin/env node
/**
 * Assign a referral code to every user who does not have one.
 *
 * Dry-run by default. Pass --fix to write codes.
 *
 *   cd backend && node scripts/backfillReferralCodes.js
 *   cd backend && node scripts/backfillReferralCodes.js --fix
 *
 * Connects via MONGODB_URI from backend/.env (connectDB). Refuses a database
 * literally named "test" unless --allow-test-db is passed.
 */
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import { connectDB, disconnectDB } from '../src/config/database.js';
import { generateUniqueReferralCode } from '../src/utils/referralCode.js';

const missingReferralCode = {
  $or: [
    { referralCode: { $exists: false } },
    { referralCode: null },
    { referralCode: '' },
  ],
};

export async function backfillReferralCodes({ fix = false } = {}) {
  const total = await User.countDocuments();
  const missing = await User.countDocuments(missingReferralCode);
  let assigned = 0;
  let skipped = 0;

  if (fix && missing > 0) {
    const cursor = User.find(missingReferralCode).select('_id').cursor();
    for await (const user of cursor) {
      const code = await generateUniqueReferralCode();
      const result = await User.updateOne(
        { _id: user._id, referralCode: { $in: [null, undefined, ''] } },
        { $set: { referralCode: code } }
      );
      if (result.modifiedCount > 0) assigned += 1;
      else skipped += 1;
    }
  }

  const remaining = await User.countDocuments(missingReferralCode);
  return { total, missing, assigned, skipped, remaining };
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

  const counts = await backfillReferralCodes({ fix });
  console.log(`Users: ${counts.total}`);
  console.log(`Missing referral code: ${counts.missing}`);
  console.log(`Assigned: ${counts.assigned}`);
  console.log(`Still missing: ${counts.remaining}`);
  if (counts.skipped) console.log(`Skipped (already had a code): ${counts.skipped}`);

  if (!fix && counts.missing > 0) {
    console.log('\nRe-run with --fix to assign codes.');
  }

  await disconnectDB();
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
