import mongoose from 'mongoose';

/**
 * Immutable ledger for user wallet funding (top-up).
 * Idempotency: unique reference prevents double credit.
 */
const walletFundingTransactionSchema = new mongoose.Schema(
  {
    reference: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['wallet_topup'],
      default: 'wallet_topup',
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
    },
    balanceBefore: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

walletFundingTransactionSchema.index({ user: 1, createdAt: -1 });
walletFundingTransactionSchema.index({ reference: 1 }, { unique: true });

const WalletFundingTransaction = mongoose.model('WalletFundingTransaction', walletFundingTransactionSchema);
export default WalletFundingTransaction;
