import mongoose from 'mongoose';

/**
 * user_devices - tracks devices per user for trust/freeze logic
 * Used for withdrawal freeze on new device, device trust checks
 */
const userDeviceSchema = new mongoose.Schema(
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
    isTrusted: {
      type: Boolean,
      default: false,
    },
    firstLoginAt: {
      type: Date,
      default: Date.now,
    },
    lastLoginAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

userDeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const UserDevice = mongoose.model('UserDevice', userDeviceSchema);
export default UserDevice;
