/**
 * Link an existing Keke user as a field agent.
 *
 *   MONGODB_URI="..." node backend/scripts/createAgent.js +2348012345678 "Abakaliki" "Hopewell Park"
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';
import Agent from '../src/models/Agent.js';
import { findUserByIdentifier } from '../src/utils/loginIdentifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const identifier = process.argv[2];
const zone = process.argv[3] || null;
const park = process.argv[4] || null;

if (!identifier) {
  console.error('Usage: node scripts/createAgent.js <email-or-phone> [zone] [park]');
  process.exit(1);
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';
  await mongoose.connect(mongoUri);
  const { user } = await findUserByIdentifier(User, identifier);
  if (!user) {
    console.error('No user found for', identifier, '— they need a Keke account first.');
    process.exit(1);
  }
  const existing = await Agent.findOne({ user: user._id });
  if (existing) {
    if (existing.status === 'pending') {
      existing.status = 'active';
      existing.startDate = new Date();
      if (zone) existing.zone = zone;
      if (park) existing.park = park;
      await existing.save();
      console.log('Pending application approved:', existing._id.toString(), user.email || user.phone);
      process.exit(0);
    }
    console.log('Already an agent:', existing._id.toString(), user.email || user.phone);
    process.exit(0);
  }
  const agent = await Agent.create({
    user: user._id,
    name: user.name || null,
    zone,
    park,
    status: 'active',
  });
  console.log('Agent created:', agent._id.toString());
  console.log('User:', user.name, user.email || user.phone);
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
