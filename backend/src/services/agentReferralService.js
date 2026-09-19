import Agent from '../models/Agent.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n) {
  let out = '';
  for (let i = 0; i < n; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function namePrefix(name) {
  return String(name || '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

export async function generateUniqueAgentReferralCode(name) {
  const prefix = namePrefix(name);
  for (let i = 0; i < 16; i += 1) {
    const code = prefix.length >= 2 ? `${prefix}${randomChars(4)}` : randomChars(6);
    const [agentHit, userHit] = await Promise.all([
      Agent.findOne({ referralCode: code }).select('_id').lean(),
      User.findOne({ referralCode: code }).select('_id').lean(),
    ]);
    if (!agentHit && !userHit) return code;
  }
  return `A${randomChars(7)}`;
}

export async function ensureAgentReferralCode(agent) {
  if (!agent || agent.referralCode) return agent;
  if (agent.status !== 'active') return agent;
  agent.referralCode = await generateUniqueAgentReferralCode(agent.name);
  await agent.save();
  return agent;
}

/**
 * A signup code may be an agent's dedicated code, or a passenger invite code
 * belonging to someone who is also an agent (the 5 existing field agents were
 * sharing their user invite codes before agent codes existed).
 */
export async function resolveReferralCode(code) {
  const cleaned = String(code || '').trim();
  if (!cleaned) return { userReferrer: null, agent: null };

  const upper = normalizeCode(cleaned);
  const agentByCode = await Agent.findOne({ referralCode: upper, status: 'active' });
  if (agentByCode) return { userReferrer: null, agent: agentByCode };

  const userReferrer = await User.findOne({
    referralCode: { $regex: `^${escapeRegex(cleaned)}$`, $options: 'i' },
  }).select('_id');
  if (!userReferrer) return { userReferrer: null, agent: null };

  const agentForUser = await Agent.findOne({ user: userReferrer._id, status: 'active' });
  return { userReferrer, agent: agentForUser || null };
}

export function applyReferralToUserData(userData, resolved) {
  if (!userData || !resolved) return userData;
  if (resolved.userReferrer) userData.referredBy = resolved.userReferrer._id;
  if (resolved.agent) userData.referredByAgentId = resolved.agent._id;
  return userData;
}

/**
 * Point Driver rows at the Agent when the rider signed up with that agent's
 * passenger invite code (User.referredBy) or when User.referredByAgentId is set
 * but Driver.create ran before that field was copied across.
 */
export async function syncReferredDriversForAgents(agents) {
  const active = (agents || []).filter((a) => a && a.status === 'active');
  if (!active.length) return;

  const userToAgent = new Map();
  for (const agent of active) {
    const userId = agent.user?._id || agent.user;
    if (userId) userToAgent.set(String(userId), agent._id);
  }
  const agentUserIds = [...userToAgent.keys()];
  const agentIds = active.map((a) => a._id);

  const [viaPassengerCode, viaUserField] = await Promise.all([
    agentUserIds.length
      ? User.find({ referredBy: { $in: agentUserIds } }).select('_id referredBy').lean()
      : [],
    agentIds.length
      ? User.find({ referredByAgentId: { $in: agentIds } }).select('_id referredByAgentId').lean()
      : [],
  ]);

  const ops = [];
  for (const user of viaPassengerCode) {
    const agentId = userToAgent.get(String(user.referredBy));
    if (!agentId) continue;
    ops.push({
      updateMany: {
        filter: { user: user._id, referredByAgentId: null },
        update: { $set: { referredByAgentId: agentId } },
      },
    });
  }
  for (const user of viaUserField) {
    if (!user.referredByAgentId) continue;
    ops.push({
      updateMany: {
        filter: { user: user._id, referredByAgentId: null },
        update: { $set: { referredByAgentId: user.referredByAgentId } },
      },
    });
  }
  if (ops.length) await Driver.bulkWrite(ops, { ordered: false });
}
