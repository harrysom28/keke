import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    rideId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    type: {
      type: String,
      enum: [
        'ride_earning',
        'commission',
        'commission_accrued',
        'commission_swept',
        'withdrawal',
        'refund',
        'balance_release',
        'cancellation_compensation',
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
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

transactionSchema.index({ driverId: 1, createdAt: -1 });
transactionSchema.index({ rideId: 1 });
transactionSchema.index({ type: 1, createdAt: -1 });
transactionSchema.index({ transactionId: 1 }, { unique: true });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
