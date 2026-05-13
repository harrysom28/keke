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
    wallet: { ...DEFAULTS.wallet, ...(doc?.wallet && typeof doc.wallet === 'object' ? doc.wallet : {}) },
  };
  cachedSettings = raw;
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return cachedSettings;
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
export async function getCancellationPolicy(scenario) {
  const s = await getSettings();
  const c = s.cancellation ?? DEFAULTS.cancellation;
  if (scenario === 'beforeAccept' || scenario === 'driverCancel') {
    return { riderPenalty: 0, driverPayout: 0 };
  }
  if (scenario === 'afterAccept') {
    return { riderPenalty: c.afterAcceptPenalty ?? 200, driverPayout: c.afterAcceptPayout ?? 200 };
  }
  if (scenario === 'afterArrival') {
    return { riderPenalty: 0, driverPayout: c.afterArrivalPayout ?? 150 };
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
