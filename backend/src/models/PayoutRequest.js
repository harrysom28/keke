import mongoose from 'mongoose';

const payoutRequestSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending',
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reference: {
      type: String,
      default: null,
      sparse: true,
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
    },
  },
  { timestamps: true }
);

payoutRequestSchema.index({ driverId: 1, createdAt: -1 });
payoutRequestSchema.index({ status: 1 });

const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);
export default PayoutRequest;
