import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import mongoose from 'mongoose';

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function driverLifecycleStatus(driver, isRecentlyActive) {
  const verification = driver.verificationStatus || 'pending';
  if (verification === 'rejected') return 'rejected';
  if (verification === 'approved') {
    if (isRecentlyActive) return 'active';
    return Number(driver.totalRides) > 0 ? 'inactive' : 'verified';
  }
  const created = driver.createdAt ? new Date(driver.createdAt).getTime() : 0;
  if (created && Date.now() - created < 24 * 60 * 60 * 1000) return 'submitted';
  return 'in_review';
}

export async function recentlyActiveDriverIds(driverIds, since = new Date(Date.now() - ACTIVE_WINDOW_MS)) {
  if (!driverIds.length) return new Set();
  const ids = await Ride.distinct('driver', {
    driver: { $in: driverIds },
    status: 'completed',
    completedAt: { $gte: since },
  });
  return new Set(ids.map((id) => String(id)));
}

export async function statsForAgentIds(agentIds) {
  const unique = [...new Set(agentIds.map((id) => String(id)))].filter((id) =>
    mongoose.Types.ObjectId.isValid(id)
  );
  const empty = {
    registered: 0,
    verified: 0,
    active: 0,
    rejected: 0,
    pending: 0,
  };
  if (!unique.length) return new Map();

  const drivers = await Driver.find({
    referredByAgentId: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('_id referredByAgentId verificationStatus totalRides')
    .lean();

  const byAgent = new Map(unique.map((id) => [id, { ...empty, driverIds: [] }]));
  for (const driver of drivers) {
    const key = String(driver.referredByAgentId);
    const bucket = byAgent.get(key);
    if (!bucket) continue;
    bucket.registered += 1;
    bucket.driverIds.push(driver._id);
    if (driver.verificationStatus === 'approved') bucket.verified += 1;
    else if (driver.verificationStatus === 'rejected') bucket.rejected += 1;
    else bucket.pending += 1;
  }

  const allDriverIds = drivers.map((d) => d._id);
  const activeSet = await recentlyActiveDriverIds(allDriverIds);

  for (const bucket of byAgent.values()) {
    bucket.active = bucket.driverIds.filter((id) => activeSet.has(String(id))).length;
    delete bucket.driverIds;
  }

  return byAgent;
}

export async function statsForAgent(agentId) {
  const map = await statsForAgentIds([agentId]);
  return map.get(String(agentId)) || {
    registered: 0,
    verified: 0,
    active: 0,
    rejected: 0,
    pending: 0,
  };
}
