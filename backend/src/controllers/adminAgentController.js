import User from '../models/User.js';
import Agent from '../models/Agent.js';
import AgentTarget from '../models/AgentTarget.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import { logAdminAction } from '../services/auditLogService.js';
import { findUserByIdentifier } from '../utils/loginIdentifier.js';
import { statsForAgentIds, ratesFromStats, loadReferredDrivers } from '../services/agentStatsService.js';
import { ensureAgentReferralCode, syncReferredDriversForAgents } from '../services/agentReferralService.js';
import logger from '../utils/logger.js';

function formatAdminAgent(agent, stats, user) {
  const u = user || agent.user || {};
  const s = ratesFromStats(stats);
  return {
    agent_id: agent._id.toString(),
    user_id: (u._id || agent.user)?.toString?.() || null,
    name: agent.name || u.name || null,
    phone: u.phone || null,
    email: u.email || null,
    zone: agent.zone,
    park: agent.park,
    status: agent.status,
    reason: agent.notes || null,
    bounty_rate: agent.bountyRate,
    referral_code: agent.referralCode || null,
    start_date: agent.startDate,
    stats: s,
    verification_rate: s.verification_rate,
    activation_rate: s.activation_rate,
  };
}

export const listAdminAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({}).populate('user', 'name email phone isActive referralCode').sort({ createdAt: -1 });
  await Promise.all(agents.map((agent) => ensureAgentReferralCode(agent)));
  await syncReferredDriversForAgents(agents);
  const statsMap = await statsForAgentIds(agents.map((a) => a._id));
  const rows = agents.map((agent) =>
    formatAdminAgent(agent, statsMap.get(String(agent._id)), agent.user)
  );
  rows.sort((a, b) => (b.stats.active || 0) - (a.stats.active || 0));
  res.json({
    status: 'success',
    data: { agents: rows, count: rows.length },
  });
});

export const getAdminAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.id).populate('user', 'name email phone isActive referralCode');
  if (!agent) throw new NotFoundError('Agent');
  await ensureAgentReferralCode(agent);
  await syncReferredDriversForAgents([agent]);
  const [statsMap, target, drivers] = await Promise.all([
    statsForAgentIds([agent._id]),
    AgentTarget.findOne({ agent: agent._id, status: 'active' }).sort({ deadline: 1 }),
    loadReferredDrivers(agent._id),
  ]);

  res.json({
    status: 'success',
    data: {
      agent: formatAdminAgent(agent, statsMap.get(String(agent._id)), agent.user),
      cycle: target,
      drivers,
    },
  });
});

export const listAdminAgentDrivers = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.id).populate('user', 'name email phone isActive referralCode');
  if (!agent) throw new NotFoundError('Agent');
  await ensureAgentReferralCode(agent);
  await syncReferredDriversForAgents([agent]);
  const [drivers, statsMap] = await Promise.all([
    loadReferredDrivers(agent._id),
    statsForAgentIds([agent._id]),
  ]);
  res.json({
    status: 'success',
    data: {
      agent: formatAdminAgent(agent, statsMap.get(String(agent._id)), agent.user),
      stats: ratesFromStats(statsMap.get(String(agent._id))),
      drivers,
      count: drivers.length,
    },
  });
});

export const createAdminAgent = asyncHandler(async (req, res) => {
  const { email_phone_number, name, zone, park, bountyRate, targetCount, targetDeadline, cycleName } = req.body;
  if (!email_phone_number) throw new ValidationError('Email or phone number is required');

  let { user, parsed } = await findUserByIdentifier(User, email_phone_number);
  if (!user) {
    if (!parsed.phone && !parsed.email) {
      throw new ValidationError('A valid email or phone number is required');
    }
    user = await User.create({
      name: name || 'Agent',
      phone: parsed.phone || undefined,
      email: parsed.email || undefined,
      role: 'passenger',
      isActive: true,
      isVerified: false,
      isRegCompleted: true,
    });
  }

  const existing = await Agent.findOne({ user: user._id });
  let agent;
  if (existing) {
    if (existing.status !== 'pending') {
      throw new ConflictError('This account is already an agent.');
    }
    existing.status = 'active';
    existing.startDate = new Date();
    if (name) existing.name = name;
    if (zone) existing.zone = zone;
    if (park) existing.park = park;
    if (bountyRate != null && bountyRate !== '') existing.bountyRate = Number(bountyRate) || 0;
    await existing.save();
    agent = existing;
  } else {
    agent = await Agent.create({
      user: user._id,
      name: name || user.name || null,
      zone: zone || null,
      park: park || null,
      bountyRate: Number(bountyRate) || 0,
      startDate: new Date(),
      status: 'active',
    });
  }

  if (targetCount && targetDeadline) {
    await AgentTarget.create({
      agent: agent._id,
      cycleName: cycleName || 'Recruitment cycle',
      targetCount: Number(targetCount),
      deadline: new Date(targetDeadline),
      bountyRate: Number(bountyRate) || 0,
      status: 'active',
    });
  }

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'agent_create',
    resourceType: 'agent',
    resourceId: agent._id,
    details: { userId: user._id, email_phone_number },
    req,
  });
  logger.info(`Admin ${req.user._id} created agent ${agent._id} for user ${user._id}`);

  await agent.populate('user', 'name email phone isActive referralCode');
  res.status(201).json({
    status: 'success',
    message: 'Agent created. They can sign in with their existing email or phone.',
    data: { agent: formatAdminAgent(agent, null, agent.user) },
  });
});

export const updateAdminAgent = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.id);
  if (!agent) throw new NotFoundError('Agent');
  const { name, zone, park, bountyRate, status, notes } = req.body;
  if (name !== undefined) agent.name = name;
  if (zone !== undefined) agent.zone = zone;
  if (park !== undefined) agent.park = park;
  if (bountyRate !== undefined) agent.bountyRate = Number(bountyRate) || 0;
  if (notes !== undefined) agent.notes = notes;
  if (status && ['pending', 'active', 'inactive', 'flagged'].includes(status)) {
    if (status === 'active' && agent.status === 'pending') {
      agent.startDate = new Date();
    }
    agent.status = status;
  }
  await agent.save();

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'agent_update',
    resourceType: 'agent',
    resourceId: agent._id,
    details: { status: agent.status },
    req,
  });

  await agent.populate('user', 'name email phone isActive referralCode');
  const statsMap = await statsForAgentIds([agent._id]);
  res.json({
    status: 'success',
    data: { agent: formatAdminAgent(agent, statsMap.get(String(agent._id)), agent.user) },
  });
});

export const createAdminAgentTarget = asyncHandler(async (req, res) => {
  const agent = await Agent.findById(req.params.id);
  if (!agent) throw new NotFoundError('Agent');
  const { cycleName, targetCount, deadline, bountyRate } = req.body;
  if (!targetCount || !deadline) throw new ValidationError('targetCount and deadline are required');

  await AgentTarget.updateMany({ agent: agent._id, status: 'active' }, { $set: { status: 'completed' } });
  const target = await AgentTarget.create({
    agent: agent._id,
    cycleName: cycleName || 'Recruitment cycle',
    targetCount: Number(targetCount),
    deadline: new Date(deadline),
    bountyRate: bountyRate != null ? Number(bountyRate) : agent.bountyRate,
    status: 'active',
  });

  res.status(201).json({ status: 'success', data: { target } });
});
