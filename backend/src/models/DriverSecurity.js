import mongoose from 'mongoose';

/**
 * driver_security - transaction PIN, failed attempts, lock
 * Drivers only. Used for withdrawals and sensitive profile changes.
 */
const driverSecuritySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    transactionPinHash: {
      type: String,
      default: null,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastPinChangeAt: {
      type: Date,
      default: null,
    },
    withdrawalFreezeUntil: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

driverSecuritySchema.index({ userId: 1 }, { unique: true });

const DriverSecurity = mongoose.model('DriverSecurity', driverSecuritySchema);
export default DriverSecurity;
