import mongoose from 'mongoose';

const paystackWebhookEventSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, index: true },
    eventType: { type: String, required: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['received', 'processed', 'failed', 'unmatched'],
      default: 'received',
      index: true,
    },
    error: { type: String, default: null },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paystackWebhookEventSchema.index({ reference: 1, eventType: 1 }, { unique: true });
paystackWebhookEventSchema.index({ status: 1, receivedAt: 1 });

export default mongoose.model('PaystackWebhookEvent', paystackWebhookEventSchema);
