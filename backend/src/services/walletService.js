import mongoose from 'mongoose';
import DriverWallet from '../models/DriverWallet.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

const PENDING_HOURS = Number(process.env.WALLET_PENDING_HOURS) || 24;

function generateTransactionId(prefix = 'TXN') {
  return `${prefix}-${Date.now()}-${mongoose.Types.ObjectId().toString().slice(-8)}`;
}

const utcDayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Atomic upsert for the driver wallet. The previous find-then-create
 * pattern raced under concurrent first-time reads (two devices polling
 * /auth/user/me at the same time both saw findOne === null, both tried
 * to create, and the loser hit the unique index on `driverId` → the
 * global error handler surfaced this as `409 "driverId already
 * exists"` on a plain GET endpoint).
 *
 * `findOneAndUpdate({ upsert: true })` is atomic at the DB level. The
 * try/catch wraps the rare MongoDB-documented case where two concurrent
 * upserts each decide to insert; the loser gets 11000, and we treat
 * that as "the other call won the create — just fetch and return".
 */
async function upsertWallet(driverId, extraSetOnInsert = {}) {
  const today = utcDayKey();
  try {
    return await DriverWallet.findOneAndUpdate(
      { driverId },
      {
        $setOnInsert: {
          driverId,
          statsDate: today,
          todayEarnings: 0,
          ...extraSetOnInsert,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) {
      logger.debug(
        `DriverWallet upsert hit concurrent 11000 for driver ${driverId}; refetching`
      );
      return DriverWallet.findOne({ driverId });
    }
    throw err;
  }
}

/**
 * Roll over todayEarnings when UTC day changes. Call before reads/credits.
 */
export async function ensureWalletDayStats(driverId) {
  const today = utcDayKey();
  const w = await upsertWallet(driverId);
  if (w?.statsDate === today) return w;
  return DriverWallet.findOneAndUpdate(
    { driverId },
    { $set: { statsDate: today, todayEarnings: 0 } },
    { new: true }
  );
}

async function getOrCreateWallet(driverId, currency = 'NGN') {
  return upsertWallet(driverId, { currency });
}

/**
 * Credit driver's pending balance after ride completion.
 * Uses atomic findOneAndUpdate to avoid race conditions; then creates audit records.
 */
async function creditRideEarning(driverId, driverNetAmount, commissionAmount, rideId, currency = 'NGN', session = null) {
  if (driverNetAmount < 0 || commissionAmount < 0) {
    throw new Error('Amounts must be non-negative');
  }

  const opts = session ? { session } : {};
  let wallet = await getOrCreateWallet(driverId, currency);
  if (session) {
    const w = await DriverWallet.findOne({ driverId }).session(session);
    if (!w) throw new Error('Wallet not found in session');
  }

  await ensureWalletDayStats(driverId);
  wallet = await DriverWallet.findOne({ driverId }).session(session || null);
  if (!wallet) throw new Error('Wallet not found');
  const balanceBeforePending = wallet.pendingBalance;
  const balanceAfterPending = balanceBeforePending + driverNetAmount;
  const availableAt = new Date(Date.now() + PENDING_HOURS * 60 * 60 * 1000);

  // Atomic update: no read-modify-write race
  wallet = await DriverWallet.findOneAndUpdate(
    { driverId },
    {
      $inc: {
        pendingBalance: driverNetAmount,
        totalEarned: driverNetAmount,
        todayEarnings: driverNetAmount,
      },
      $push: { pendingCredits: { amount: driverNetAmount, availableAt, rideId } },
    },
    { new: true, ...opts }
  );
  if (!wallet) throw new Error('Wallet not found');

  const rideEarningTxnId = generateTransactionId('RE');
  await Transaction.create(
    [
      {
        transactionId: rideEarningTxnId,
        rideId,
        driverId,
        type: 'ride_earning',
        amount: driverNetAmount,
        currency,
        balanceBefore: balanceBeforePending,
        balanceAfter: balanceAfterPending,
        metadata: { rideId: rideId?.toString(), pending: true },
      },
    ],
    opts
  );

  if (commissionAmount > 0) {
    const commissionTxnId = generateTransactionId('COM');
    await Transaction.create(
      [
        {
          transactionId: commissionTxnId,
          rideId,
          driverId,
          type: 'commission',
          amount: commissionAmount,
          currency,
          balanceBefore: 0,
          balanceAfter: commissionAmount,
          metadata: { rideId: rideId?.toString() },
        },
      ],
      opts
    );
  }

  return { wallet, rideEarningTxnId };
}

/**
 * Release pending credits to available balance for a driver (availableAt <= now).
 * Creates balance_release transaction(s). Call from cron or before payout.
 */
async function releasePendingForDriver(driverId, session = null) {
  const opts = session ? { session } : {};
  const wallet = await DriverWallet.findOne({ driverId }).session(session || null);
  if (!wallet || wallet.pendingCredits.length === 0) return { released: 0 };

  const now = new Date();
  const toRelease = wallet.pendingCredits.filter((c) => c.availableAt <= now);
  if (toRelease.length === 0) return { released: 0 };

  const totalRelease = toRelease.reduce((s, c) => s + c.amount, 0);
  const balanceBefore = wallet.availableBalance;
  const balanceAfter = balanceBefore + totalRelease;

  wallet.availableBalance = balanceAfter;
  wallet.pendingBalance -= totalRelease;
  wallet.pendingCredits = wallet.pendingCredits.filter((c) => c.availableAt > now);
  await wallet.save(opts);

  const txnId = generateTransactionId('REL');
  await Transaction.create(
    [
      {
        transactionId: txnId,
        driverId,
        type: 'balance_release',
        amount: totalRelease,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        metadata: { releasedCount: toRelease.length },
      },
    ],
    opts
  );

  return { released: totalRelease };
}

/**
 * Release all pending credits across all wallets (cron job).
 */
async function releaseAllPendingBalances() {
  const wallets = await DriverWallet.find({ pendingBalance: { $gt: 0 } });
  let totalReleased = 0;
  for (const w of wallets) {
    try {
      const { released } = await releasePendingForDriver(w.driverId);
      totalReleased += released;
    } catch (err) {
      logger.error(`releasePendingForDriver failed for ${w.driverId}: ${err.message}`);
    }
  }
  return totalReleased;
}

/**
 * Debit available balance for payout. Call only when payout is approved.
 * Audit trail first: creates withdrawal transaction record, then atomically updates balance.
 */
async function debitForPayout(driverId, amount, reference, session = null) {
  if (amount <= 0) throw new Error('Payout amount must be positive');

  const opts = session ? { session } : {};
  const wallet = await DriverWallet.findOne({ driverId }).session(session || null);
  if (!wallet) throw new Error('Wallet not found');

  await releasePendingForDriver(driverId, session);

  const walletRefreshed = await DriverWallet.findOne({ driverId }).session(session || null);
  if (walletRefreshed.availableBalance < amount) {
    throw new Error('Insufficient available balance');
  }

  const balanceBefore = walletRefreshed.availableBalance;
  const balanceAfter = balanceBefore - amount;
  const txnId = generateTransactionId('WTH');

  // Audit trail first: create transaction record before modifying balance
  await Transaction.create(
    [
      {
        transactionId: txnId,
        driverId,
        type: 'withdrawal',
        amount: -amount,
        currency: walletRefreshed.currency,
        balanceBefore,
        balanceAfter,
        metadata: { reference },
      },
    ],
    opts
  );

  // Atomic balance update
  const updated = await DriverWallet.findOneAndUpdate(
    { driverId, availableBalance: { $gte: amount } },
    { $inc: { availableBalance: -amount, totalWithdrawn: amount } },
    { new: true, ...opts }
  );
  if (!updated) {
    throw new Error('Payout balance update failed (concurrent modification or insufficient balance)');
  }

  return { wallet: updated, transactionId: txnId };
}

/**
 * Refund: deduct from driver wallet if already credited (pending or available).
 * Creates refund transaction.
 */
async function debitRefund(driverId, amount, rideId, reason, session = null) {
  if (amount <= 0) throw new Error('Refund debit amount must be positive');

  const opts = session ? { session } : {};
  const wallet = await DriverWallet.findOne({ driverId }).session(session || null);
  if (!wallet) throw new Error('Wallet not found');

  await releasePendingForDriver(driverId, session);
  const walletRefreshed = await DriverWallet.findOne({ driverId }).session(session || null);

  const deductFromAvailable = Math.min(amount, walletRefreshed.availableBalance);
  const deductFromPending = amount - deductFromAvailable;
  const balanceBefore = walletRefreshed.availableBalance + walletRefreshed.pendingBalance;

  if (deductFromPending > 0) {
    const pendingCredits = [...walletRefreshed.pendingCredits].sort(
      (a, b) => new Date(a.availableAt) - new Date(b.availableAt)
    );
    let remaining = deductFromPending;
    const newPendingCredits = [];
    for (const c of pendingCredits) {
      if (remaining <= 0) {
        newPendingCredits.push(c);
        continue;
      }
      const take = Math.min(c.amount, remaining);
      remaining -= take;
      if (c.amount > take) {
        newPendingCredits.push({
          amount: c.amount - take,
          availableAt: c.availableAt,
          rideId: c.rideId,
        });
      }
    }
    walletRefreshed.pendingCredits = newPendingCredits;
    walletRefreshed.pendingBalance -= deductFromPending;
  }

  walletRefreshed.availableBalance -= deductFromAvailable;
  walletRefreshed.totalEarned = Math.max(0, walletRefreshed.totalEarned - amount);
  await walletRefreshed.save(opts);

  const balanceAfter = walletRefreshed.availableBalance + walletRefreshed.pendingBalance;

  const txnId = generateTransactionId('REF');
  await Transaction.create(
    [
      {
        transactionId: txnId,
        rideId,
        driverId,
        type: 'refund',
        amount: -amount,
        currency: walletRefreshed.currency,
        balanceBefore,
        balanceAfter,
        metadata: { reason },
      },
    ],
    opts
  );

  return { wallet: walletRefreshed, transactionId: txnId };
}

/**
 * Credit driver available balance when rider cancels (after accept / after arrival).
 * Goes to DriverWallet (what the driver app displays), not UserWallet.
 * Idempotent per ride + driver via Transaction row.
 */
async function creditCancellationCompensation(driverId, amount, rideId, session = null) {
  if (!driverId || amount <= 0) return null;
  const opts = session ? { session } : {};

  const dup = await Transaction.findOne({
    rideId,
    driverId,
    type: 'cancellation_compensation',
  })
    .session(session || null)
    .lean();
  if (dup) return { duplicate: true, transactionId: dup.transactionId };

  let wallet = await DriverWallet.findOne({ driverId }).session(session || null);
  if (!wallet) throw new Error('DriverWallet not found');

  const balanceBefore = wallet.availableBalance;
  const balanceAfter = balanceBefore + amount;

  wallet = await DriverWallet.findOneAndUpdate(
    { driverId },
    {
      $inc: {
        availableBalance: amount,
        totalEarned: amount,
        todayEarnings: amount,
      },
    },
    { new: true, ...opts }
  );
  if (!wallet) throw new Error('DriverWallet credit failed');

  const txnId = generateTransactionId('CAN');
  await Transaction.create(
    [
      {
        transactionId: txnId,
        rideId,
        driverId,
        type: 'cancellation_compensation',
        amount,
        currency: wallet.currency,
        balanceBefore,
        balanceAfter,
        metadata: { source: 'rider_cancellation' },
      },
    ],
    opts
  );

  return { wallet, transactionId: txnId };
}

export {
  getOrCreateWallet,
  creditRideEarning,
  creditCancellationCompensation,
  releasePendingForDriver,
  releaseAllPendingBalances,
  debitForPayout,
  debitRefund,
  PENDING_HOURS,
  generateTransactionId,
  utcDayKey,
};
