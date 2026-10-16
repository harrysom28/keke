/**
 * One-off backfill. Soft-deleted users created before phone/email were
 * released still occupy the unique indexes. This rewrites only those
 * already-deleted records:
 *
 *   phone +234... -> deleted_<id>_+234...
 *   email a@b.co  -> deleted_<id>_a@b.co
 *
 * Active users are not loaded. Run against a copy first.
 *
 *   cd backend && node scripts/releaseDeletedUserIdentifiers.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('Set MONGODB_URI or MONGO_URI');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  const ghosts = await User.find({ deletedAt: { $ne: null } }).setOptions({ includeDeleted: true });
  let updated = 0;
  for (const user of ghosts) {
    let changed = false;
    if (user.phone && !String(user.phone).startsWith('deleted_')) {
      user.phone = `deleted_${user._id}_${user.phone}`;
      changed = true;
    }
    if (user.email && !String(user.email).startsWith('deleted_')) {
      user.email = `deleted_${user._id}_${user.email}`;
      changed = true;
    }
    if (!changed) continue;
    await user.save({ validateBeforeSave: false });
    updated += 1;
    console.log(`released ${user._id}`);
  }
  console.log(`${updated} of ${ghosts.length} deleted users updated`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
