import mongoose from 'mongoose';
import PayoutRequest from '../models/PayoutRequest.js';
import Driver from '../models/Driver.js';
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
