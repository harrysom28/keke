/**
 * Assign shareable referral codes to active agents and point existing Driver
 * rows at those agents when the rider signed up with the agent's invite code.
 *
 *   cd backend && npm run backfill:agent-referrals
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Agent from '../src/models/Agent.js';
import {
  ensureAgentReferralCode,
  syncReferredDriversForAgents,
} from '../src/services/agentReferralService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';
  await mongoose.connect(mongoUri);
  const agents = await Agent.find({}).populate('user', 'name phone email');
  for (const agent of agents) {
    const before = agent.referralCode;
    await ensureAgentReferralCode(agent);
    console.log(
      agent.status,
      agent.name || agent.user?.name || agent._id.toString(),
      before ? `(had ${before})` : `→ ${agent.referralCode || 'no code'}`
    );
  }
  await syncReferredDriversForAgents(agents);
  console.log('Backfill complete for', agents.length, 'agents');
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
