import mongoose from 'mongoose';

/**
 * A successful Paystack payment that Keke could not (yet) credit to exactly one rider.
 * Written by the reconciliation job; shown to admins; resolved automatically once the payment is credited.
 */
const paystackUnmatchedPaymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    amountNaira: { type: Number, required: true },
    channel: { type: String, default: null },
    customerCode: { type: String, default: null, index: true },
    customerName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    paidAt: { type: Date, default: null },
    reason: {
      type: String,
      enum: ['no_user', 'ambiguous_user', 'credit_failed', 'invalid_amount'],
      required: true,
    },
    candidateUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastError: { type: String, default: null },
    attempts: { type: Number, default: 1 },
    status: { type: String, enum: ['open', 'resolved', 'ignored'], default: 'open', index: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolvedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('PaystackUnmatchedPayment', paystackUnmatchedPaymentSchema);
