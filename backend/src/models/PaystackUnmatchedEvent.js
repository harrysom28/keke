import mongoose from 'mongoose';

/**
 * A charge.success that could not be credited: no single matching user, or the
 * credit itself threw. Writing this record must never block a successful credit.
 */
const paystackUnmatchedEventSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true },
    kind: { type: String, enum: ['unmatched', 'failed'], required: true },
    customerCode: { type: String, default: null },
    amount: { type: Number, default: null },
    channel: { type: String, default: null },
    reason: { type: String, default: null },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

paystackUnmatchedEventSchema.index({ reference: 1, kind: 1 }, { unique: true });
paystackUnmatchedEventSchema.index({ kind: 1, createdAt: -1 });

export default mongoose.model('PaystackUnmatchedEvent', paystackUnmatchedEventSchema);
