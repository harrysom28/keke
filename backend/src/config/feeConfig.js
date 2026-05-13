/**
 * KEKE — Fee Configuration
 * Single source of truth for rider service charge, driver platform fee, and cancellation policy.
 * Used by escrow wallet flow (hold at booking, service charge at arrival, settle at completion).
 *
 * Current structure (wallet-only, no cash):
 *   Rider  → flat ₦100 service charge when driver marks arrived
 *   Driver → 8% of fare as platform fee (deducted at settlement)
 *   Escrow → full fare held from rider wallet at booking
 */

export const FEE_CONFIG = {
  rider: {
    serviceCharge: 100,
    serviceChargeLabel: 'Service charge',
  },
  driver: {
    platformFeeRate: 0.08,
    platformFeeLabel: 'Platform fee (8%)',
  },
  cancellation: {
    beforeAccept: { riderPenalty: 0, driverPayout: 0 },
    /** Rider penalty is charged in full; driver wallet credit uses split (₦100 cap to driver, rest platform). See escrowWalletService.splitCancellationPenalty. */
    afterAccept: { riderPenalty: 200, driverPayout: 200 },
    afterArrival: { riderPenalty: 0, driverPayout: 150 },
    driverCancel: { riderPenalty: 0, driverPenalty: 'strike' },
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
 * Full fare breakdown for a ride (used at booking and settlement).
 * @param {number} fareAmount - Base fare in NGN (e.g. from KEKE pricing formula).
 * @returns {Object} Breakdown including riderTotal (fare + service charge), driverEarning, platformFee.
 */
export function calculateFareBreakdown(fareAmount) {
  const platformFee = Math.round(fareAmount * FEE_CONFIG.driver.platformFeeRate);
  const driverEarning = fareAmount - platformFee;
  const riderTotal = fareAmount + FEE_CONFIG.rider.serviceCharge;

  return {
    fareAmount,
    riderServiceCharge: FEE_CONFIG.rider.serviceCharge,
    riderTotal,
    platformFee,
    driverEarning,
    platformTotal: FEE_CONFIG.rider.serviceCharge + platformFee,
  };
}

/**
 * Cancellation charges by scenario.
 * @param {'beforeAccept'|'afterAccept'|'afterArrival'|'driverCancel'} scenario
 * @param {number} fareAmount - Original fare (for refund calculation).
 */
export function calculateCancellation(scenario, fareAmount) {
  const policy = FEE_CONFIG.cancellation[scenario];
  if (!policy) return { scenario, riderRefund: fareAmount, riderPenalty: 0, driverPayout: 0 };

  return {
    scenario,
    riderRefund: fareAmount - (policy.riderPenalty || 0),
    riderPenalty: policy.riderPenalty || 0,
    driverPayout: policy.driverPayout || 0,
    serviceChargeAlreadyCharged: scenario === 'afterArrival',
  };
}
