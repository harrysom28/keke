import mongoose from 'mongoose';
import PayoutRequest from '../models/PayoutRequest.js';
import Driver from '../models/Driver.js';
import Payment from '../models/Payment.js';
import Transaction from '../models/Transaction.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import { getOrCreateWallet, debitForPayout, releasePendingForDriver } from '../services/walletService.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import { logAdminAction } from '../services/auditLogService.js';
import logger from '../utils/logger.js';

export const requestPayout = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new NotFoundError('Driver profile');

  const { amount } = req.body;
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount < 0.01) {
    throw new ValidationError('Valid amount (min 0.01) is required');
  }

  const wallet = await getOrCreateWallet(driver._id);
  await releasePendingForDriver(driver._id);
  const walletRefreshed = await getOrCreateWallet(driver._id);
  if (walletRefreshed.availableBalance < numAmount) {
    throw new ValidationError('Insufficient available balance');
  }

  const payout = await PayoutRequest.create({
    driverId: driver._id,
    amount: numAmount,
    status: 'pending',
    currency: wallet.currency,
  });

  logger.info(`Payout requested: driver ${driver._id}, amount ${numAmount}, id ${payout._id}`);

  res.status(201).json({
    status: 'success',
    message: 'Payout request submitted',
    data: {
      payout_request_id: payout._id.toString(),
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status,
      requested_at: payout.requestedAt,
    },
  });
});

export const approvePayout = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user?._id;

  let payout;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    payout = await PayoutRequest.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'approved', approvedAt: new Date(), approvedBy: adminId } },
      { new: true, session }
    );
    if (!payout) {
      await session.abortTransaction();
      throw new ConflictError('Payout already processed or not found');
    }
    await payout.populate({ path: 'driverId', session });
    const reference = `PAYOUT-${payout._id}-${Date.now()}`;
    await debitForPayout(payout.driverId._id, payout.amount, reference, session);
    payout.reference = reference;
    payout.processedAt = new Date();
    await payout.save({ session });
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    if (err instanceof ConflictError) {
      throw err;
    }
    logger.error(`approvePayout failed: ${err.message}`);
    throw new ValidationError(err.message || 'Payout approval failed');
  } finally {
    await session.endSession();
  }

  if (req.user && req.user.role === 'admin') {
    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'payout_approve',
      resourceType: 'payout_request',
      resourceId: id,
      details: { driverId: payout.driverId._id.toString(), amount: payout.amount, reference: payout.reference },
      req,
    });
  }
  logger.info(`Payout approved: ${id}, driver ${payout.driverId._id}, amount ${payout.amount}`);

  res.json({
    status: 'success',
    message: 'Payout approved',
    data: {
      payout_request_id: payout._id.toString(),
      amount: payout.amount,
      reference: payout.reference,
      processed_at: payout.processedAt,
    },
  });
});

export const rejectPayout = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const payout = await PayoutRequest.findOneAndUpdate(
    { _id: id, status: 'pending' },
    {
      $set: {
        status: 'rejected',
        processedAt: new Date(),
        rejectionReason: reason || 'Rejected by admin',
      },
    },
    { new: true }
  );

  if (!payout) {
    throw new ConflictError('Payout already processed or not found');
  }

  if (req.user && req.user.role === 'admin') {
    await logAdminAction({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'payout_reject',
      resourceType: 'payout_request',
      resourceId: id,
      details: { driverId: payout.driverId?.toString(), amount: payout.amount, reason: payout.rejectionReason },
      req,
    });
  }
  logger.info(`Payout rejected: ${id}, reason: ${payout.rejectionReason}`);

  res.json({
    status: 'success',
    message: 'Payout rejected',
    data: {
      payout_request_id: payout._id.toString(),
      status: payout.status,
    },
  });
});

export const getMyPayouts = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new NotFoundError('Driver profile');

  const payouts = await PayoutRequest.find({ driverId: driver._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({
    status: 'success',
    data: {
      payouts: payouts.map((p) => ({
        payout_request_id: p._id.toString(),
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        requested_at: p.requestedAt,
        processed_at: p.processedAt,
        reference: p.reference,
        rejection_reason: p.rejectionReason,
      })),
    },
  });
});

export const getMyWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new NotFoundError('Driver profile');

  const wallet = await getOrCreateWallet(driver._id);

  res.json({
    status: 'success',
    data: {
      available_balance: wallet.availableBalance,
      pending_balance: wallet.pendingBalance,
      total_earned: wallet.totalEarned,
      total_withdrawn: wallet.totalWithdrawn,
      currency: wallet.currency,
    },
  });
});

function paymentRideIdString(payment) {
  const r = payment?.ride;
  if (!r) return null;
  if (typeof r === 'object' && r._id) return r._id.toString();
  return String(r);
}

function driverPaymentEntryType(payment) {
  const rideId = paymentRideIdString(payment);
  const amt = Number(payment.amount) || 0;
  if (rideId && amt >= 0) return 'debit';
  if (!rideId && amt > 0) return 'credit';
  if (!rideId && amt < 0) return 'debit';
  return 'neutral';
}

function driverPaymentDescription(payment) {
  const rideId = paymentRideIdString(payment);
  const amt = Number(payment.amount) || 0;
  const meta = payment.metadata;
  const metaType = typeof meta?.get === 'function' ? meta.get('type') : meta?.type;
  if (metaType === 'withdrawal' || amt < 0) return 'Withdrawal request';
  if (payment.paymentType === 'wallet_topup' || (!rideId && amt > 0)) return 'Wallet top-up';
  if (rideId) return 'Ride payment';
  return 'Payment';
}

function formatDriverPaymentRow(payment, userId) {
  const ride_id = paymentRideIdString(payment);
  const uid = payment.user?._id?.toString?.() || payment.user?.toString?.() || String(userId);
  return {
    payment_id: payment._id.toString(),
    user_id: uid,
    ride_id,
    amount: Math.abs(Number(payment.amount) || 0),
    currency: payment.currency || 'NGN',
    method: payment.method || 'wallet',
    status: payment.status,
    transaction_id: payment.transactionId,
    stripe_payment_intent_id: payment.stripePaymentIntentId,
    refund_amount: payment.refundAmount,
    created_at: payment.createdAt,
    paid_at: payment.paidAt,
    description: driverPaymentDescription(payment),
    entry_type: driverPaymentEntryType(payment),
    ledger_type: ride_id ? 'ridepayment' : payment.paymentType || 'payment',
    ledger_source: 'payment',
  };
}

function driverWalletTxnEntry(tx) {
  const { type, amount } = tx;
  const n = Number(amount) || 0;
  if (type === 'commission') return { entry_type: 'neutral', abs: Math.abs(n) };
  if (n >= 0) return { entry_type: 'credit', abs: Math.abs(n) };
  return { entry_type: 'debit', abs: Math.abs(n) };
}

const DRIVER_WALLET_TX_DESCRIPTION = {
  ride_earning: 'Ride earnings (pending clearance)',
  commission: 'Platform fee (ride)',
  withdrawal: 'Withdrawal (processed)',
  refund: 'Earnings adjustment',
  balance_release: 'Earnings released to wallet',
  cancellation_compensation: 'Cancellation compensation',
};

function formatDriverWalletTxnRow(tx) {
  const { entry_type, abs } = driverWalletTxnEntry(tx);
  const rideId = tx.rideId ? tx.rideId.toString() : null;
  return {
    payment_id: `dwt_${tx.transactionId}`,
    user_id: null,
    ride_id: rideId,
    amount: abs,
    currency: tx.currency || 'NGN',
    method: 'driver_wallet',
    status: 'completed',
    transaction_id: tx.transactionId,
    stripe_payment_intent_id: null,
    refund_amount: 0,
    created_at: tx.createdAt,
    paid_at: tx.createdAt,
    description: DRIVER_WALLET_TX_DESCRIPTION[tx.type] || 'Wallet activity',
    entry_type,
    ledger_type: tx.type,
    ledger_source: 'driver_wallet',
    balance_before: tx.balanceBefore,
    balance_after: tx.balanceAfter,
  };
}

function formatDriverLegacyUwtRow(uwt, userId) {
  const raw = Number(uwt.amount) || 0;
  const entry_type = raw >= 0 ? 'credit' : 'debit';
  const rideId = uwt.rideId ? uwt.rideId.toString() : null;
  const label =
    uwt.type === 'cancel_payout'
      ? 'Cancellation compensation (legacy)'
      : uwt.description || 'Ride earnings (legacy)';
  return {
    payment_id: `ledger_${uwt._id.toString()}`,
    user_id: userId.toString(),
    ride_id: rideId,
    amount: Math.abs(raw),
    currency: 'NGN',
    method: 'wallet',
    status: uwt.status || 'completed',
    transaction_id: uwt.idempotencyKey,
    stripe_payment_intent_id: null,
    refund_amount: 0,
    created_at: uwt.createdAt,
    paid_at: uwt.createdAt,
    description: label,
    entry_type,
    ledger_type: uwt.type,
    ledger_source: 'user_wallet_legacy',
  };
}

/**
 * Driver wallet ledger + Paystack / withdrawal Payment rows — GET /api/driver/wallet/transactions
 */
export const getDriverWalletTransactions = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new NotFoundError('Driver profile');

  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const page = parseInt(req.query.page, 10) || 1;
  const skip = (page - 1) * limit;
  const FETCH_CAP = 500;

  const [walletTxns, legacyUwts, paymentDocs] = await Promise.all([
    Transaction.find({ driverId: driver._id }).sort({ createdAt: -1 }).limit(FETCH_CAP).lean(),
    UserWalletTransaction.find({
      userId,
      type: { $in: ['fare_credit', 'cancel_payout'] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    Payment.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(FETCH_CAP)
      .lean(),
  ]);

  const rideIdsWithRideEarning = new Set(
    walletTxns.filter((t) => t.type === 'ride_earning' && t.rideId).map((t) => t.rideId.toString())
  );
  const rideIdsWithCancelComp = new Set(
    walletTxns
      .filter((t) => t.type === 'cancellation_compensation' && t.rideId)
      .map((t) => t.rideId.toString())
  );

  const rows = [];

  for (const t of walletTxns) {
    rows.push(formatDriverWalletTxnRow(t));
  }

  for (const u of legacyUwts) {
    if (u.type === 'fare_credit' && u.rideId && rideIdsWithRideEarning.has(u.rideId.toString())) {
      continue;
    }
    if (u.type === 'cancel_payout' && u.rideId && rideIdsWithCancelComp.has(u.rideId.toString())) {
      continue;
    }
    rows.push(formatDriverLegacyUwtRow(u, userId));
  }

  for (const p of paymentDocs) {
    rows.push(formatDriverPaymentRow(p, userId));
  }

  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const paginated = rows.slice(skip, skip + limit);

  res.json({
    status: 'success',
    data: {
      transactions: paginated,
      pagination: {
        page,
        limit,
        total: rows.length,
        pages: Math.ceil(rows.length / limit) || 0,
      },
    },
  });
});
