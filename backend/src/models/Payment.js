import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      // No min: withdrawals use negative amount
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
    },
    method: {
      type: String,
      enum: ['cash', 'wallet', 'card', 'bank_transfer', 'stripe'],
      required: [true, 'Payment method is required'],
    },
    status: {
      type: String,
      enum: ['initialized', 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
      default: 'pending',
    },
    /** wallet_topup | ride_payment - for Paystack flow and filtering */
    paymentType: {
      type: String,
      enum: ['wallet_topup', 'ride_payment'],
      default: 'ride_payment',
    },
    /** Paystack reference (set when initializing checkout; used for idempotency) */
    reference: {
      type: String,
      default: null,
      sparse: true,
    },
    /** Paystack access_code (returned from initialize, used by frontend) */
    access_code: {
      type: String,
      default: null,
    },
    // Stripe payment details
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    stripeChargeId: {
      type: String,
      default: null,
    },
    transactionId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    refundId: {
      type: String,
      default: null,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    refundReason: {
      type: String,
      default: null,
    },
    // Payment metadata
    metadata: {
      type: Map,
      of: String,
      default: {},
    },
    // Failure details
    failureReason: {
      type: String,
      default: null,
    },
    failureCode: {
      type: String,
      default: null,
    },
    // Timestamps
    paidAt: {
      type: Date,
      default: null,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
paymentSchema.index({ user: 1, createdAt: -1 });
paymentSchema.index({ ride: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ stripePaymentIntentId: 1 });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ user: 1, 'metadata.type': 1, createdAt: -1 });
paymentSchema.index({ reference: 1 }, { unique: true, sparse: true });
paymentSchema.index({ paymentType: 1, status: 1 });

// Virtual for payment ID
paymentSchema.virtual('payment_id').get(function () {
  return this._id.toString();
});

// Method to mark as completed
paymentSchema.methods.markCompleted = async function (transactionId = null) {
  this.status = 'completed';
  this.paidAt = new Date();
  if (transactionId) {
    this.transactionId = transactionId;
  }
  await this.save();
};

// Method to mark as failed
paymentSchema.methods.markFailed = async function (reason = null, code = null) {
  this.status = 'failed';
  this.failureReason = reason;
  this.failureCode = code;
  await this.save();
};

// Method to process refund (amount is incremental; refundAmount is cumulative)
paymentSchema.methods.processRefund = async function (amount, reason = null, refundId = null) {
  this.refundAmount = (this.refundAmount || 0) + amount;
  this.refundReason = reason;
  this.refundedAt = new Date();
  if (this.refundAmount >= this.amount) {
    this.status = 'refunded';
  }
  if (refundId) {
    this.refundId = refundId;
  }
  await this.save();
};

const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
