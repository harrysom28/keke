/**
 * One-off migration: normalize legacy role and gender values in `users`.
 *
 * Run (production example):
 *   MONGODB_URI="mongodb+srv://..." node backend/scripts/fix-stale-roles.js
 *
 * From repo root with .env:
 *   node backend/scripts/fix-stale-roles.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

await mongoose.connect(uri);

const result = await mongoose.connection.db.collection('users').updateMany(
  { role: { $nin: ['passenger', 'driver', 'admin', 'agents_manager'] } },
  { $set: { role: 'passenger' } }
);

console.log(`Fixed ${result.modifiedCount} users with stale role values`);

const genderFix = await mongoose.connection.db.collection('users').updateMany(
  { gender: { $nin: [null, 'male', 'female', 'other'] } },
  { $unset: { gender: '' } }
);
console.log(`Fixed ${genderFix.modifiedCount} users with stale gender values`);

await mongoose.disconnect();
