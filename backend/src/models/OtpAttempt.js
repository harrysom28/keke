import mongoose from 'mongoose';

const otpAttemptSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true },
    messageId: { type: String, default: null, index: true },
    purpose: { type: String, default: 'otp' },
    sentAt: { type: Date, default: Date.now },
    deliveryStatus: {
      type: String,
      enum: ['accepted', 'failed', 'delivered', 'expired', 'rejected'],
      default: 'accepted',
    },
    rejectReason: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('OtpAttempt', otpAttemptSchema);
