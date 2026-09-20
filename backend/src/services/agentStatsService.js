import Driver from '../models/Driver.js';
import DriverKyc from '../models/DriverKyc.js';
import Ride from '../models/Ride.js';
import mongoose from 'mongoose';

const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isRealUrl(value) {
  return typeof value === 'string' && value.trim() !== '' && value !== 'pending';
}

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

/** REGISTERED → VERIFIED → ACTIVE, matching the admin Agents table. */
export function driverPipelineStage(driver) {
  const verification = driver.verificationStatus || 'pending';
  if (verification === 'rejected') return 'rejected';
  if (verification === 'approved') {
    return Number(driver.totalRides) > 0 ? 'active' : 'verified';
  }
  return 'registered';
}

/**
 * First unmet gate from the existing driver setup-status steps, then the
 * VERIFIED / ACTIVE gates. Does not invent new onboarding requirements.
 */
export function driverNextStep(driver, kyc) {
  const verification = driver.verificationStatus || 'pending';
  if (verification === 'rejected') {
    return driver.rejectionReason || 'Rejected';
  }

  const vehicle = driver.vehicleDetails || {};
  if (!(vehicle.make && vehicle.model && vehicle.plateNumber && vehicle.vehicleType)) {
    return 'Vehicle details missing';
  }

  const images = Array.isArray(driver.vehicleImages) ? driver.vehicleImages : [];
  const hasVehiclePhoto = images.some((img) => isRealUrl(img?.url));
  if (
    !isRealUrl(kyc?.licenseImageUrl) ||
    !isRealUrl(kyc?.idImageUrl) ||
    !isRealUrl(kyc?.selfieUrl) ||
    !hasVehiclePhoto
  ) {
    return 'Documents pending';
  }

  if (!(driver.bankAccount?.accountNumber && driver.bankAccount?.bankName)) {
    return 'Bank details missing';
  }

  if (verification !== 'approved') {
    return 'Awaiting document verification';
  }
  if (!(Number(driver.totalRides) > 0)) {
    return 'Awaiting first completed ride';
  }
  return null;
}

export function ratesFromStats(stats) {
  const s = stats || { registered: 0, verified: 0, active: 0, rejected: 0, pending: 0, invited: 0 };
  const registered = s.registered || 0;
  const verified = s.verified || 0;
  const active = s.active || 0;
  return {
    invited: s.invited || 0,
    registered,
    verified,
    active,
    rejected: s.rejected || 0,
    pending: s.pending || 0,
    verification_rate: registered ? verified / registered : 0,
    activation_rate: verified ? active / verified : 0,
  };
}

export function formatReferredDriver(driver, isRecentlyActive, kyc) {
  const user = driver.user || {};
  return {
    driver_id: driver._id.toString(),
    name: user.name || null,
    phone: user.phone || null,
    email: user.email || null,
    status: driverLifecycleStatus(driver, isRecentlyActive),
    stage: driverPipelineStage(driver),
    next_step: driverNextStep(driver, kyc),
    recently_active: !!isRecentlyActive,
    verification_status: driver.verificationStatus,
    rejection_reason: driver.rejectionReason || null,
    plate_number: driver.vehicleDetails?.plateNumber || null,
    vehicle_type: driver.vehicleDetails?.vehicleType?.displayName
      || driver.vehicleDetails?.vehicleType?.name
      || null,
    park: driver.vehicleDetails?.make || null,
    created_at: driver.createdAt,
    total_rides: driver.totalRides || 0,
  };
}

export async function loadReferredDrivers(agentId) {
  const drivers = await Driver.find({ referredByAgentId: agentId })
    .populate('user', 'name phone email profileImage')
    .populate('vehicleDetails.vehicleType', 'name displayName')
    .sort({ createdAt: -1 });

  const userIds = drivers
    .map((d) => d.user?._id || d.user)
    .filter(Boolean);

  const [activeSet, kycDocs] = await Promise.all([
    recentlyActiveDriverIds(drivers.map((d) => d._id)),
    userIds.length
      ? DriverKyc.find({ userId: { $in: userIds } })
        .select('userId licenseImageUrl idImageUrl selfieUrl')
        .lean()
      : [],
  ]);

  const kycMap = new Map(kycDocs.map((doc) => [String(doc.userId), doc]));
  return drivers.map((driver) => {
    const userId = String(driver.user?._id || driver.user || '');
    return formatReferredDriver(driver, activeSet.has(String(driver._id)), kycMap.get(userId));
  });
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
    invited: 0,
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

  const byAgent = new Map(unique.map((id) => [id, { ...empty }]));
  for (const driver of drivers) {
    const key = String(driver.referredByAgentId);
    const bucket = byAgent.get(key);
    if (!bucket) continue;
    bucket.registered += 1;
    if (driver.verificationStatus === 'approved') {
      bucket.verified += 1;
      if (Number(driver.totalRides) > 0) bucket.active += 1;
    } else if (driver.verificationStatus === 'rejected') {
      bucket.rejected += 1;
    } else {
      bucket.pending += 1;
    }
  }

  return byAgent;
}

export async function statsForAgent(agentId) {
  const map = await statsForAgentIds([agentId]);
  return map.get(String(agentId)) || {
    invited: 0,
    registered: 0,
    verified: 0,
    active: 0,
    rejected: 0,
    pending: 0,
  };
}

