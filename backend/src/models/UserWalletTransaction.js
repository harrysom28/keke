/**
 * KEKE — Wallet transaction audit trail (escrow flow).
 */

import mongoose from 'mongoose';

const userWalletTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      index: true,
      default: null,
    },
    type: {
      type: String,
      enum: [
        'topup',
        'hold',
        'hold_release',
        'service_charge',
        'fare_debit',
        'fare_credit',
        'platform_fee',
        'cancel_penalty',
        'cancel_payout',
        'withdrawal',
        'refund',
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceBefore: { type: Number, default: null },
    balanceAfter: { type: Number, default: null },
    description: { type: String, required: true },
    breakdown: {
      grossFare: Number,
      platformFee: Number,
      netEarning: Number,
    },
    providerRef: { type: String, default: null },
    providerStatus: { type: String, default: null },
    status: {
      type: String,
      enum: ['completed', 'pending', 'failed', 'reversed'],
      default: 'completed',
    },
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

userWalletTransactionSchema.index({ userId: 1, createdAt: -1 });
userWalletTransactionSchema.index({ rideId: 1 });
userWalletTransactionSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

const UserWalletTransaction = mongoose.model('UserWalletTransaction', userWalletTransactionSchema);
export default UserWalletTransaction;
