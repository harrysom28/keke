/**
 * KEKE — Admin-driven fee/settings (replaces hardcoded feeConfig for escrow).
 * Cache TTL 5 minutes; invalidate on admin PATCH.
 */

import AdminSettings from '../models/AdminSettings.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedSettings = null;
let cacheExpiry = 0;

const DEFAULTS = {
  fees: {
    riderServiceCharge: 100,
    driverPlatformRate: 0.08,
  },
  cancellation: {
    afterAcceptPenalty: 200,
    /** Legacy field; afterAccept driver credit is min(100, rider penalty). Kept for admin UI / docs. */
    afterAcceptPayout: 200,
    afterArrivalPayout: 150,
    gracePeriodSeconds: 60,
    maxDriverPayoutsPerDay: 3,
  },
  arrival: {
    maxRadiusMeters: 150,
  },
  dropoff: {
    freeRadiusMeters: 500,
    confirmRadiusMeters: 3000,
    liveFixMaxAgeSeconds: 30,
    riderConfirmWindowSeconds: 120,
  },
  // Driver search / dispatch radii (km) and location freshness. See utils/driverSearchRadius.js.
  dispatch: {
    previewRadiusKm: 10,
    round1RadiusKm: 10,
    round2RadiusKm: 12,
    round3RadiusKm: 15,
    assignRadiusKm: 10,
    locationFreshnessSeconds: 300,
  },
  wallet: {
    minTopupAmount: 500,
    minWithdrawAmount: 1000,
    maxDailyWithdrawal: 500000,
  },
};

/**
 * Get settings (cached). Returns plain object with defaults merged.
 */
export async function getSettings() {
  if (cachedSettings && Date.now() < cacheExpiry) {
    return cachedSettings;
  }
  const doc = await AdminSettings.findOne({ key: 'default' }).lean();
  const raw = {
    fees: { ...DEFAULTS.fees, ...(doc?.fees && typeof doc.fees === 'object' ? doc.fees : {}) },
    cancellation: { ...DEFAULTS.cancellation, ...(doc?.cancellation && typeof doc.cancellation === 'object' ? doc.cancellation : {}) },
    arrival: { ...DEFAULTS.arrival, ...(doc?.arrival && typeof doc.arrival === 'object' ? doc.arrival : {}) },
    dropoff: { ...DEFAULTS.dropoff, ...(doc?.dropoff && typeof doc.dropoff === 'object' ? doc.dropoff : {}) },
    dispatch: { ...DEFAULTS.dispatch, ...(doc?.dispatch && typeof doc.dispatch === 'object' ? doc.dispatch : {}) },
    wallet: { ...DEFAULTS.wallet, ...(doc?.wallet && typeof doc.wallet === 'object' ? doc.wallet : {}) },
  };
  cachedSettings = raw;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedSettings;
}

export const DROPOFF_DEFAULTS = DEFAULTS.dropoff;
export const DISPATCH_DEFAULTS = DEFAULTS.dispatch;

/** Allowed range for each trip-ending setting (inclusive). */
export const DROPOFF_LIMITS = {
  freeRadiusMeters: [100, 1000],
  confirmRadiusMeters: [1000, 10000],
  liveFixMaxAgeSeconds: [10, 120],
  riderConfirmWindowSeconds: [30, 600],
};

/** Allowed range for each dispatch setting (inclusive). */
export const DISPATCH_LIMITS = {
  previewRadiusKm: [1, 20],
  round1RadiusKm: [1, 20],
  round2RadiusKm: [1, 30],
  round3RadiusKm: [1, 50],
  assignRadiusKm: [1, 30],
  locationFreshnessSeconds: [60, 900],
};

/**
 * Validate an admin update of the `dropoff` group against the stored values.
 * Returns { value } (the full merged group) or { error } (a message for the admin).
 * Every sent field must be a whole number inside its range, and confirmRadiusMeters must exceed freeRadiusMeters.
 */
export function validateDropoffUpdate(input, current = {}) {
  const merged = { ...DEFAULTS.dropoff, ...(current || {}) };
  for (const [key, [min, max]] of Object.entries(DROPOFF_LIMITS)) {
    if (input?.[key] === undefined) continue;
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      return { error: `dropoff.${key} must be a whole number between ${min} and ${max}` };
    }
    merged[key] = n;
  }
  if (!(merged.confirmRadiusMeters > merged.freeRadiusMeters)) {
    return { error: 'dropoff.confirmRadiusMeters must be greater than dropoff.freeRadiusMeters' };
  }
  return { value: merged };
}

/**
 * Validate an admin update of the `dispatch` group against the stored values.
 * Every sent field must be a whole number inside its range, and round1 ≤ round2 ≤ round3.
 */
export function validateDispatchUpdate(input, current = {}) {
  const merged = { ...DEFAULTS.dispatch, ...(current || {}) };
  for (const [key, [min, max]] of Object.entries(DISPATCH_LIMITS)) {
    if (input?.[key] === undefined) continue;
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) {
      return { error: `dispatch.${key} must be a whole number between ${min} and ${max}` };
    }
    merged[key] = n;
  }
  if (!(merged.round1RadiusKm <= merged.round2RadiusKm && merged.round2RadiusKm <= merged.round3RadiusKm)) {
    return { error: 'dispatch.round1RadiusKm ≤ dispatch.round2RadiusKm ≤ dispatch.round3RadiusKm is required' };
  }
  return { value: merged };
}

export function invalidateCache() {
  cachedSettings = null;
  cacheExpiry = 0;
}

/**
 * Fare breakdown from DB settings (used at booking and settlement).
 */
export async function calculateFareBreakdown(fareAmount) {
  const s = await getSettings();
  const rate = s.fees.driverPlatformRate ?? DEFAULTS.fees.driverPlatformRate;
  const serviceCharge = s.fees.riderServiceCharge ?? DEFAULTS.fees.riderServiceCharge;
  const platformFee = Math.round(fareAmount * rate);
  const driverEarning = fareAmount - platformFee;
  const riderTotal = fareAmount + serviceCharge;
  return {
    fareAmount,
    riderServiceCharge: serviceCharge,
    riderTotal,
    platformFee,
    driverEarning,
    platformTotal: serviceCharge + platformFee,
  };
}

/**
 * Cancellation policy for a scenario (from DB).
 */
export async function getCancellationPolicy(scenario, progress = null) {
  const s = await getSettings();
  const c = s.cancellation ?? DEFAULTS.cancellation;
  if (scenario === 'beforeAccept' || scenario === 'driverCancel') {
    return { riderPenalty: 0, driverPayout: 0 };
  }
  if (scenario === 'afterAccept') {
    return { riderPenalty: c.afterAcceptPenalty ?? 200, driverPayout: c.afterAcceptPayout ?? 200 };
  }
  if (scenario === 'afterArrival') {
    const flat = c.afterArrivalPayout ?? 150;
    let riderPenalty = 0;
    // Early in the trip the rider still pays nothing. Once half the trip is
    // done, charge the per-km rate for distance covered, never below the flat
    // fee and never above the quoted fare or 3x that flat fee.
    if (progress && !progress.stale && progress.percentCovered >= 0.5 && progress.distanceCoveredKm > 0) {
      const doc = await AdminSettings.findOne({ key: 'default' }).select('pricing').lean();
      const perKm = Number(doc?.pricing?.perKmRate) || 150;
      const raw = progress.distanceCoveredKm * perKm;
      const fareCap = Number(progress.totalFare) > 0 ? Number(progress.totalFare) : raw;
      const cap = Math.min(fareCap, flat * 3);
      riderPenalty = Math.round(Math.max(flat, Math.min(raw, cap)));
    }
    return { riderPenalty, driverPayout: flat, distanceBased: riderPenalty > 0 };
  }
  return { riderPenalty: 0, driverPayout: 0 };
}

/**
 * Grace period (seconds) and max driver cancel payouts per day.
 */
export async function getCancellationGuards() {
  const s = await getSettings();
  const c = s.cancellation ?? DEFAULTS.cancellation;
  return {
    gracePeriodSeconds: c.gracePeriodSeconds ?? 60,
    maxDriverPayoutsPerDay: c.maxDriverPayoutsPerDay ?? 3,
  };
}
