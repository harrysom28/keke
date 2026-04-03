import mongoose from 'mongoose';

/**
 * user_sessions - device-bound refresh token storage
 * Used for refresh token rotation and revocation
 */
const userSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    revoked: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

userSessionSchema.index({ userId: 1, deviceId: 1 });
userSessionSchema.index({ refreshTokenHash: 1, userId: 1 });

const UserSession = mongoose.model('UserSession', userSessionSchema);
export default UserSession;
