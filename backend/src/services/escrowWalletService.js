/**
 * KEKE — Escrow wallet service
 * Hold at booking, service charge at arrival, settle at completion, process cancellation.
 * All balance changes go through UserWallet + UserWalletTransaction.
 */

import mongoose from 'mongoose';
import UserWallet from '../models/UserWallet.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';
import { getSettings, calculateFareBreakdown, getCancellationPolicy, getCancellationGuards } from './settingsService.js';
import {
  creditCancellationCompensation,
  ensureWalletDayStats,
  getOrCreateWallet,
} from './walletService.js';

/**
 * Rider cancellation penalty split: up to this amount (NGN) goes to the driver; the rest is platform revenue.
 * (Business rule: e.g. ₦200 penalty → ₦100 driver, ₦100 platform.)
 */
export const DRIVER_CANCELLATION_PENALTY_SHARE_CAP_NGN = 100;

/**
 * @param {number} totalPenaltyNgn — total cancellation fee charged to the rider (same currency as wallets).
 * @returns {{ driverShare: number, platformShare: number, totalPenalty: number }}
 */
export function splitCancellationPenalty(totalPenaltyNgn) {
  const n = Math.max(0, Math.round(Number(totalPenaltyNgn) || 0));
  const driverShare = Math.min(DRIVER_CANCELLATION_PENALTY_SHARE_CAP_NGN, n);
  const platformShare = Math.max(0, n - driverShare);
  return { driverShare, platformShare, totalPenalty: n };
}

export class EscrowWalletError extends Error {
  constructor(code, message, data = {}) {
    super(message);
    this.name = 'EscrowWalletError';
    this.code = code;
    this.data = data;
  }
}

function isTransactionUnsupportedError(err) {
  const message = err?.message || '';
  return message.includes('Transaction numbers are only allowed on a replica set member or mongos');
}

async function syncLegacyUserBalanceFromWallet(userId, walletDoc = null, session = null) {
  const wallet =
    walletDoc ||
    (await UserWallet.findOne({ userId, userType: 'rider' })
      .session(session || undefined)
      .select('availableBalance'));

  if (!wallet) return null;

  await User.findByIdAndUpdate(
    userId,
    { $set: { balance: Number(wallet.availableBalance) || 0 } },
    session ? { session } : undefined
  );

  return wallet;
}

/**
 * Passenger GET /wallet + profile balance: escrow available is canonical when a rider wallet exists.
 * Only lift displayed available when User.balance is strictly greater (Paystack credited User before
 * escrow replicated, or rare drift). Using Math.max(escrow, user) hides real top-ups when escrow was
 * overstated vs User.balance.
 */
export function computeRiderWalletApiTotals(userBalanceRaw, escrowWallet) {
  const userBalance = Number(userBalanceRaw) || 0;
  if (!escrowWallet) {
    return { availableBalance: userBalance, heldBalance: 0, balance: userBalance };
  }
  const escrowAvailable = Number(escrowWallet.availableBalance) || 0;
  const escrowHeld = Number(escrowWallet.heldBalance) || 0;
  let availableBalance = escrowAvailable;
  if (userBalance > availableBalance) {
    availableBalance = userBalance;
  }
  return {
    availableBalance,
    heldBalance: escrowHeld,
    balance: availableBalance + escrowHeld,
  };
}

/**
 * Get or create rider wallet; if new, sync availableBalance from User.balance.
 */
export async function getOrCreateRiderWallet(userId) {
  let wallet = await UserWallet.findOne({ userId, userType: 'rider' });
  const user = await User.findById(userId).select('balance').lean();
  const userBalance = Number(user?.balance) || 0;

  // If escrow wallet already exists, do a safe one-time sync for migrated accounts:
  // only when wallet shows unused/empty, but legacy User.balance has funds.
  if (wallet) {
    const walletAvail = Number(wallet.availableBalance) || 0;
    const walletHeld = Number(wallet.heldBalance) || 0;
    const walletSpent = Number(wallet.totalSpent) || 0;
    const walletEarned = Number(wallet.totalEarned) || 0;
    const looksUnused = walletAvail === 0 && walletHeld === 0 && walletSpent === 0 && walletEarned === 0;
    if (looksUnused && userBalance > 0) {
      wallet.availableBalance = userBalance;
      await wallet.save();
    }
    return wallet;
  }

  const initial = userBalance;
  wallet = await UserWallet.create({
    userId,
    userType: 'rider',
    availableBalance: Math.max(0, initial),
    heldBalance: 0,
  });
  return wallet;
}

/**
 * Repair stale holds for scheduled rides cancelled before settlement logic existed.
 * This is safe to run repeatedly; processCancellation is idempotent by rideId.
 */
export async function reconcileCancelledScheduledRideEscrows(riderId) {
  const staleCancelledScheduledRides = await Ride.find({
    rider: riderId,
    isScheduled: true,
    status: 'cancelled',
    paymentMethod: 'wallet',
    paymentStatus: { $in: ['held', 'charged'] },
  })
    .select('_id driver fare.totalFare cancellation.cancelledBy cancellation.cancellationScenario paymentStatus')
    .lean();

  if (!staleCancelledScheduledRides.length) return { repaired: 0 };

  let repaired = 0;

  for (const ride of staleCancelledScheduledRides) {
    const fareAmount = Number(ride?.fare?.totalFare) || 0;
    const hasHold = await UserWalletTransaction.findOne({
      idempotencyKey: `hold:${ride._id}`,
      type: 'hold',
    })
      .select('_id')
      .lean();
    if (fareAmount <= 0 && !hasHold) continue;

    let driverUserId = null;
    if (ride.driver) {
      const driverDoc = await Driver.findById(ride.driver).select('user').lean();
      driverUserId = driverDoc?.user ?? null;
    }

    const scenario =
      ride?.cancellation?.cancellationScenario ||
      (ride?.cancellation?.cancelledBy === 'driver' ? 'driverCancel' : 'beforeAccept');

    await processCancellation(ride._id, riderId, driverUserId, fareAmount, scenario);

    await Ride.findByIdAndUpdate(ride._id, {
      $set: {
        paymentStatus: scenario === 'beforeAccept' || scenario === 'driverCancel' ? 'refunded' : 'partial',
        'cancellation.cancellationScenario': scenario,
      },
    });

    repaired += 1;
  }

  const wallet = await UserWallet.findOne({ userId: riderId, userType: 'rider' });
  if (wallet) {
    await syncLegacyUserBalanceFromWallet(riderId, wallet);
  }

  return { repaired };
}

/**
 * Release wallet holds whose ride is already terminal (cancelled / no driver) but no
 * cancel/settle ledger line exists — e.g. scheduled driver cancel skipped escrow, or
 * a release failed after the ride document was updated.
 * Safe to run on every wallet read; processCancellation is idempotent per rideId.
 */
export async function reconcileOrphanedWalletHoldsForRider(riderId) {
  const holds = await UserWalletTransaction.find({
    userId: riderId,
    type: 'hold',
    rideId: { $exists: true, $ne: null },
  })
    .select('rideId')
    .lean();

  if (!holds.length) return { repaired: 0 };

  let repaired = 0;

  for (const h of holds) {
    const rideId = h.rideId;
    if (!rideId) continue;

    const cancelTx = await UserWalletTransaction.findOne({
      idempotencyKey: `cancel:${rideId}`,
    })
      .select('_id')
      .lean();
    const settleTx = await UserWalletTransaction.findOne({
      idempotencyKey: `settle:${rideId}`,
    })
      .select('_id')
      .lean();
    if (cancelTx || settleTx) continue;

    const ride = await Ride.findById(rideId)
      .select('rider status paymentMethod cancellation driver fare.totalFare')
      .lean();

    if (!ride || String(ride.rider) !== String(riderId)) continue;
    if (String(ride.paymentMethod || '').toLowerCase() !== 'wallet') continue;

    const st = String(ride.status || '').toLowerCase();
    if (!['cancelled', 'no-driver-found'].includes(st)) continue;

    const fareAmount = Number(ride.fare?.totalFare) || 0;

    let scenario = ride.cancellation?.cancellationScenario;
    if (!scenario) {
      if (st === 'no-driver-found') {
        scenario = 'beforeAccept';
      } else if (ride.cancellation?.cancelledBy === 'driver') {
        scenario = 'driverCancel';
      } else if (ride.driver) {
        scenario = 'afterAccept';
      } else {
        scenario = 'beforeAccept';
      }
    }

    let driverUserId = null;
    if (ride.driver) {
      const driverDoc = await Driver.findById(ride.driver).select('user').lean();
      driverUserId = driverDoc?.user ?? null;
    }

    try {
      const result = await processCancellation(rideId, riderId, driverUserId, fareAmount, scenario);
      if (result?.skipped) continue;
      repaired += 1;
      await Ride.findByIdAndUpdate(rideId, {
        $set: {
          paymentStatus:
            scenario === 'beforeAccept' || scenario === 'driverCancel' ? 'refunded' : 'partial',
        },
      });
    } catch (err) {
      logger.warn(
        `reconcileOrphanedWalletHoldsForRider: processCancellation failed ride=${rideId}: ${err.message}`
      );
    }
  }

  if (repaired > 0) {
    const wallet = await UserWallet.findOne({ userId: riderId, userType: 'rider' });
    if (wallet) await syncLegacyUserBalanceFromWallet(riderId, wallet);
  }

  return { repaired };
}

/**
 * Validate rider has sufficient balance for fare + service charge. No money moved.
 */
export async function validateRiderBalance(riderId, fareAmount) {
  const breakdown = await calculateFareBreakdown(fareAmount);
  let wallet = await getOrCreateRiderWallet(riderId);

  if (wallet.availableBalance < breakdown.riderTotal && Number(wallet.heldBalance) > 0) {
    await reconcileCancelledScheduledRideEscrows(riderId);
    await reconcileOrphanedWalletHoldsForRider(riderId);
    wallet = await getOrCreateRiderWallet(riderId);
  }

  if (wallet.frozen) throw new EscrowWalletError('WALLET_FROZEN', 'Wallet is frozen');
  if (wallet.availableBalance < breakdown.riderTotal) {
    const shortfall = breakdown.riderTotal - wallet.availableBalance;
    throw new EscrowWalletError('INSUFFICIENT_BALANCE', `Top up ₦${shortfall.toLocaleString()} to book this ride`, {
      available: wallet.availableBalance,
      required: breakdown.riderTotal,
      shortfall,
      breakdown,
    });
  }
  return { sufficient: true, breakdown, wallet };
}

/**
 * Amount locked in escrow for this ride (from hold tx). Falls back to fare if no tx (legacy).
 */
export async function getEscrowReleaseAmountForRide(rideId, fareFallback = 0) {
  const tx = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${rideId}`,
    type: 'hold',
  }).lean();
  const fromTx = tx ? Math.abs(Number(tx.amount) || 0) : 0;
  if (fromTx > 0) return fromTx;
  return Math.max(0, Number(fareFallback) || 0);
}

/**
 * Hold fare in escrow at booking. Idempotent by rideId.
 */
export async function holdRideFunds(riderId, rideId, fareAmount) {
  const idempotencyKey = `hold:${rideId}`;
  const existing = await UserWalletTransaction.findOne({ idempotencyKey });
  if (existing) return existing;

  await getOrCreateRiderWallet(riderId);

  // Get service charge from settings and include in hold
  const s = await getSettings();
  const serviceCharge = s.fees.riderServiceCharge ?? 100;
  const totalHold = fareAmount + serviceCharge;

  const wallet = await UserWallet.findOneAndUpdate(
    { userId: riderId, userType: 'rider', frozen: false, availableBalance: { $gte: totalHold } },
    { $inc: { availableBalance: -totalHold, heldBalance: totalHold } },
    { new: true }
  );

  if (!wallet) {
    const current = await UserWallet.findOne({ userId: riderId });
    if (!current) throw new EscrowWalletError('WALLET_NOT_FOUND', 'Wallet not found');
    if (current.frozen) throw new EscrowWalletError('WALLET_FROZEN', 'Wallet is frozen');
    throw new EscrowWalletError('INSUFFICIENT_BALANCE', 'Insufficient balance to hold fare');
  }

  await syncLegacyUserBalanceFromWallet(riderId, wallet);

  const tx = await UserWalletTransaction.create({
    userId: riderId,
    rideId,
    type: 'hold',
    amount: -totalHold,
    balanceBefore: wallet.availableBalance + totalHold,
    balanceAfter: wallet.availableBalance,
    description: `Fare ₦${fareAmount} + service charge ₦${serviceCharge} held for ride`,
    idempotencyKey,
  });
  return tx;
}

/**
 * Charge service charge when driver marks arrived. Idempotent by rideId. Amount from admin settings.
 */
export async function chargeServiceFee(riderId, rideId) {
  // Service charge is now bundled into holdRideFunds at booking time.
  // This function is kept for backward compatibility but does nothing.
  const idempotencyKey = `service_charge:${rideId}`;
  const existing = await UserWalletTransaction.findOne({ idempotencyKey });
  if (existing) return existing;
  // Create a zero-amount record for idempotency so old code paths don't error
  return UserWalletTransaction.create({
    userId: riderId,
    rideId,
    type: 'service_charge',
    amount: 0,
    balanceBefore: 0,
    balanceAfter: 0,
    description: 'Service charge bundled into ride hold',
    idempotencyKey,
  });
}

/**
 * Settle ride: release hold from rider, credit driver (DriverWallet stays; we also credit driver's UserWallet if exists for consistency, or only DriverWallet).
 * Existing flow credits DriverWallet via walletService.creditRideEarning. We only release rider hold and record fare_debit; driver credit stays in commissionService + walletService.
 */
export async function settleRide(rideId, riderId, driverUserId, fareAmount) {
  const idempotencyKey = `settle:${rideId}`;
  const existing = await UserWalletTransaction.findOne({ idempotencyKey });
  if (existing) return { success: true, driverEarning: null, platformFee: null, riderTotal: null };

  const breakdown = await calculateFareBreakdown(fareAmount);

  // Recover actual hold amount (fare + service charge) from hold tx
  const holdTx = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${rideId}`,
    type: 'hold',
  }).lean();
  const totalHeld = holdTx ? Math.abs(Number(holdTx.amount) || 0) : fareAmount;
  const serviceCharge = totalHeld - fareAmount;

  const runSettlement = async (useSession) => {
    const session = useSession ? await mongoose.startSession().catch(() => null) : null;
    const opts = session ? { session } : {};

    try {
      if (session) session.startTransaction();

      const riderWallet = await UserWallet.findOneAndUpdate(
        { userId: riderId },
        { $inc: { heldBalance: -totalHeld, totalSpent: totalHeld } },
        { new: true, ...opts }
      );

      await syncLegacyUserBalanceFromWallet(riderId, riderWallet, session);

      await UserWalletTransaction.create(
        [
          {
            userId: riderId,
            rideId,
            type: 'fare_debit',
            amount: -totalHeld,
            balanceBefore: riderWallet.heldBalance + totalHeld,
            balanceAfter: riderWallet.heldBalance,
            description:
              serviceCharge > 0
                ? `Ride paid (₦${fareAmount} fare + ₦${serviceCharge} service)`
                : 'Ride fare paid',
            idempotencyKey,
            status: 'completed',
          },
        ],
        opts
      );

      // Credit driver's UserWallet if it exists (optional; main earnings stay in DriverWallet via paymentService)
      let driverWallet = await UserWallet.findOne({ userId: driverUserId, userType: 'driver' }).session(session || undefined);
      if (driverWallet) {
        driverWallet = await UserWallet.findOneAndUpdate(
          { userId: driverUserId, userType: 'driver' },
          { $inc: { availableBalance: breakdown.driverEarning, totalEarned: breakdown.driverEarning } },
          { new: true, ...opts }
        );
        await UserWalletTransaction.create(
          [
            {
              userId: driverUserId,
              rideId,
              type: 'fare_credit',
              amount: breakdown.driverEarning,
              balanceBefore: driverWallet.availableBalance - breakdown.driverEarning,
              balanceAfter: driverWallet.availableBalance,
              description: 'Ride earnings',
              breakdown: {
                grossFare: fareAmount,
                platformFee: breakdown.platformFee,
                netEarning: breakdown.driverEarning,
              },
              idempotencyKey: `settle_driver:${rideId}`,
              status: 'completed',
            },
          ],
          opts
        );
      }

      if (session) await session.commitTransaction();

      return {
        success: true,
        driverEarning: breakdown.driverEarning,
        platformFee: breakdown.platformFee,
        riderTotal: breakdown.riderTotal,
      };
    } catch (err) {
      if (session) await session.abortTransaction();
      throw err;
    } finally {
      session?.endSession();
    }
  };

  try {
    return await runSettlement(true);
  } catch (err) {
    if (!isTransactionUnsupportedError(err)) throw err;
    return await runSettlement(false);
  }
}

/**
 * Whether driver can receive another cancel payout today (abuse cap).
 */
export async function driverCancelPayoutAllowed(driverUserId) {
  const { maxDriverPayoutsPerDay } = await getCancellationGuards();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const legacyCount = await UserWalletTransaction.countDocuments({
    userId: driverUserId,
    type: 'cancel_payout',
    createdAt: { $gte: today },
  });
  let driverWalletTxCount = 0;
  const driverDoc = await Driver.findOne({ user: driverUserId }).select('_id').lean();
  if (driverDoc?._id) {
    driverWalletTxCount = await Transaction.countDocuments({
      driverId: driverDoc._id,
      type: 'cancellation_compensation',
      createdAt: { $gte: today },
    });
  }
  const count = legacyCount + driverWalletTxCount;
  return count < maxDriverPayoutsPerDay;
}

/**
 * Process cancellation: release hold or apply penalty and pay driver. Uses admin settings; caps driver payouts per day.
 */
export async function processCancellation(rideId, riderId, driverUserId, fareAmount, scenario) {
  const idempotencyKey = `cancel:${rideId}`;
  const existing = await UserWalletTransaction.findOne({ idempotencyKey });
  if (existing) return { success: true, scenario };

  const releaseAmount = await getEscrowReleaseAmountForRide(rideId, fareAmount);
  if (releaseAmount <= 0) {
    logger.warn(`processCancellation: no escrow hold to release for ride ${rideId} (fare fallback ${fareAmount})`);
    return { success: true, scenario, skipped: true };
  }

  if (driverUserId && (scenario === 'afterAccept' || scenario === 'afterArrival')) {
    try {
      const d = await Driver.findOne({ user: driverUserId }).select('_id').lean();
      if (d?._id) {
        await getOrCreateWallet(d._id);
        await ensureWalletDayStats(d._id);
      }
    } catch (err) {
      logger.warn(`processCancellation: driver wallet preload failed: ${err.message}`);
    }
  }

  const runCancellation = async (useSession) => {
    const session = useSession ? await mongoose.startSession().catch(() => null) : null;
    const opts = session ? { session } : {};

    try {
      if (session) session.startTransaction();

      const transactions = [];
      const policyAfterAccept = await getCancellationPolicy('afterAccept');
      const policyAfterArrival = await getCancellationPolicy('afterArrival');
      const allowDriverPayout = driverUserId ? await driverCancelPayoutAllowed(driverUserId) : false;

      let driverMongoId = null;
      if (driverUserId) {
        const drow = await Driver.findOne({ user: driverUserId })
          .select('_id')
          .session(session || undefined)
          .lean();
        driverMongoId = drow?._id ?? null;
      }

      if (scenario === 'beforeAccept' || scenario === 'driverCancel') {
        let actualRelease = releaseAmount;
        let wallet = await UserWallet.findOneAndUpdate(
          { userId: riderId, userType: 'rider', heldBalance: { $gte: releaseAmount } },
          { $inc: { availableBalance: releaseAmount, heldBalance: -releaseAmount } },
          { new: true, ...opts }
        );
        if (!wallet) {
          const w = await UserWallet.findOne({ userId: riderId, userType: 'rider' }).session(session || undefined);
          const held = Number(w?.heldBalance) || 0;
          const safe = Math.min(releaseAmount, held);
          if (safe <= 0) {
            throw new Error('No held balance to release for this ride');
          }
          actualRelease = safe;
          wallet = await UserWallet.findOneAndUpdate(
            { userId: riderId, userType: 'rider' },
            { $inc: { availableBalance: safe, heldBalance: -safe } },
            { new: true, ...opts }
          );
        }
        await syncLegacyUserBalanceFromWallet(riderId, wallet, session);
        transactions.push({
          userId: riderId,
          rideId,
          type: 'hold_release',
          amount: actualRelease,
          balanceBefore: wallet.availableBalance - actualRelease,
          balanceAfter: wallet.availableBalance,
          description: 'Ride cancelled — full refund',
          idempotencyKey,
          status: 'completed',
        });
      } else if (scenario === 'afterAccept') {
        const cancelFee = policyAfterAccept.riderPenalty ?? 200;
        const { driverShare: driverPayout, platformShare: platformRetention } = splitCancellationPenalty(cancelFee);
        if (platformRetention > 0) {
          logger.info(
            `processCancellation ride ${rideId}: penalty ₦${cancelFee} → driver ₦${driverPayout}, platform ₦${platformRetention}`
          );
        }
        const refundAmount = Math.max(0, releaseAmount - cancelFee);

        let riderWallet = await UserWallet.findOneAndUpdate(
          { userId: riderId, userType: 'rider', heldBalance: { $gte: releaseAmount } },
          { $inc: { availableBalance: refundAmount, heldBalance: -releaseAmount } },
          { new: true, ...opts }
        );
        if (!riderWallet) {
          const w = await UserWallet.findOne({ userId: riderId, userType: 'rider' }).session(session || undefined);
          const held = Number(w?.heldBalance) || 0;
          const rel = Math.min(releaseAmount, held);
          const refAmt = Math.max(0, rel - cancelFee);
          if (rel <= 0) throw new Error('No held balance to release for cancellation');
          riderWallet = await UserWallet.findOneAndUpdate(
            { userId: riderId, userType: 'rider' },
            { $inc: { availableBalance: refAmt, heldBalance: -rel } },
            { new: true, ...opts }
          );
        }
        await syncLegacyUserBalanceFromWallet(riderId, riderWallet, session);
        transactions.push({
          userId: riderId,
          rideId,
          type: 'cancel_penalty',
          amount: -cancelFee,
          balanceBefore: riderWallet.availableBalance - refundAmount,
          balanceAfter: riderWallet.availableBalance,
          description: 'Cancellation fee after driver accepted',
          idempotencyKey,
          status: 'completed',
        });

        if (driverMongoId && allowDriverPayout && driverPayout > 0) {
          try {
            await creditCancellationCompensation(driverMongoId, driverPayout, rideId, session);
          } catch (creditErr) {
            logger.error(
              `processCancellation ride ${rideId}: DriverWallet cancel credit failed: ${creditErr.message}`
            );
            throw creditErr;
          }
        } else if (driverMongoId && driverPayout > 0 && !allowDriverPayout) {
          logger.warn(
            `processCancellation ride ${rideId}: driver compensation ₦${driverPayout} skipped (daily payout cap)`
          );
        }
      } else if (scenario === 'afterArrival') {
        const driverPayout = policyAfterArrival.driverPayout ?? 150;

        const riderWallet = await UserWallet.findOneAndUpdate(
          { userId: riderId, userType: 'rider' },
          { $inc: { availableBalance: releaseAmount, heldBalance: -releaseAmount } },
          { new: true, ...opts }
        );
        await syncLegacyUserBalanceFromWallet(riderId, riderWallet, session);
        transactions.push({
          userId: riderId,
          rideId,
          type: 'hold_release',
          amount: releaseAmount,
          balanceBefore: riderWallet.availableBalance - releaseAmount,
          balanceAfter: riderWallet.availableBalance,
          description: 'Fare refunded (service charge non-refundable)',
          idempotencyKey,
          status: 'completed',
        });

        if (driverMongoId && allowDriverPayout && driverPayout > 0) {
          try {
            await creditCancellationCompensation(driverMongoId, driverPayout, rideId, session);
          } catch (creditErr) {
            logger.error(
              `processCancellation ride ${rideId}: DriverWallet after-arrival credit failed: ${creditErr.message}`
            );
            throw creditErr;
          }
        } else if (driverMongoId && driverPayout > 0 && !allowDriverPayout) {
          logger.warn(
            `processCancellation ride ${rideId}: arrival cancel compensation ₦${driverPayout} skipped (daily cap)`
          );
        }
      }

      await UserWalletTransaction.insertMany(transactions, opts);
      if (session) await session.commitTransaction();
      return { success: true, scenario };
    } catch (err) {
      if (session) await session.abortTransaction();
      throw err;
    } finally {
      session?.endSession();
    }
  };

  try {
    return await runCancellation(true);
  } catch (err) {
    if (!isTransactionUnsupportedError(err)) throw err;
    return await runCancellation(false);
  }
}
