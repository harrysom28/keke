import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Agent from '../models/Agent.js';
import AgentTarget from '../models/AgentTarget.js';
import { ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import { logAdminAction } from '../services/auditLogService.js';
import { findUserByIdentifier } from '../utils/loginIdentifier.js';
import { statsForAgentIds } from '../services/agentStatsService.js';
import logger from '../utils/logger.js';

function formatAdminAgent(agent, stats, user) {
  const u = user || agent.user || {};
  const s = stats || { registered: 0, verified: 0, active: 0, rejected: 0, pending: 0 };
  const registered = s.registered || 0;
  const verified = s.verified || 0;
  const active = s.active || 0;
  return {
    agent_id: agent._id.toString(),
    user_id: (u._id || agent.user)?.toString?.() || null,
    name: agent.name || u.name || null,
    phone: u.phone || null,
    email: u.email || null,
    zone: agent.zone,
    park: agent.park,
    status: agent.status,
    bounty_rate: agent.bountyRate,
    start_date: agent.startDate,
    stats: s,
    verification_rate: registered ? verified / registered : 0,
    activation_rate: verified ? active / verified : 0,
  };
}

export const listAdminAgents = asyncHandler(async (req, res) => {
  const agents = await Agent.find({}).populate('user', 'name email phone isActive').sort({ createdAt: -1 });
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
  const agent = await Agent.findById(req.params.id).populate('user', 'name email phone isActive');
  if (!agent) throw new NotFoundError('Agent');
  const statsMap = await statsForAgentIds([agent._id]);
  const target = await AgentTarget.findOne({ agent: agent._id, status: 'active' }).sort({ deadline: 1 });
  const drivers = await Driver.find({ referredByAgentId: agent._id })
    .populate('user', 'name phone email')
    .populate('vehicleDetails.vehicleType', 'name displayName')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    status: 'success',
    data: {
      agent: formatAdminAgent(agent, statsMap.get(String(agent._id)), agent.user),
      cycle: target,
      drivers: drivers.map((d) => ({
        driver_id: d._id.toString(),
        name: d.user?.name || null,
        phone: d.user?.phone || null,
        verification_status: d.verificationStatus,
        plate_number: d.vehicleDetails?.plateNumber || null,
        created_at: d.createdAt,
        total_rides: d.totalRides || 0,
      })),
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
  if (existing) throw new ConflictError('This account is already an agent.');

  const agent = await Agent.create({
    user: user._id,
    name: name || user.name || null,
    zone: zone || null,
    park: park || null,
    bountyRate: Number(bountyRate) || 0,
    startDate: new Date(),
    status: 'active',
  });

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

  await agent.populate('user', 'name email phone isActive');
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
  if (status && ['active', 'inactive', 'flagged'].includes(status)) agent.status = status;
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

  await agent.populate('user', 'name email phone isActive');
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
