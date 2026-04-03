/**
 * KEKE — Rider/User Wallet (Escrow)
 * One per user (rider). availableBalance = spendable; heldBalance = locked in active ride escrow.
 * totalBalance = availableBalance + heldBalance.
 */

import mongoose from 'mongoose';

const userWalletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    userType: {
      type: String,
      enum: ['rider', 'driver'],
      required: true,
      default: 'rider',
    },
    availableBalance: { type: Number, default: 0, min: 0 },
    heldBalance: { type: Number, default: 0, min: 0 },
    totalEarned: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    frozen: { type: Boolean, default: false },
    frozenReason: { type: String, default: null },
  },
  { timestamps: true }
);

userWalletSchema.virtual('totalBalance').get(function () {
  return this.availableBalance + this.heldBalance;
});

userWalletSchema.set('toJSON', { virtuals: true });
userWalletSchema.set('toObject', { virtuals: true });

const UserWallet = mongoose.model('UserWallet', userWalletSchema);
export default UserWallet;
