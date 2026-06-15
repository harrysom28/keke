import mongoose from 'mongoose';

const pendingCreditSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    availableAt: { type: Date, required: true },
    rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', default: null },
  },
  { _id: false }
);

const driverWalletSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      unique: true,
    },
    availableBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    pendingCredits: {
      type: [pendingCreditSchema],
      default: [],
    },
    totalEarned: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Outstanding platform commission the driver owes from CASH rides (where the
     * driver collected the full fare in cash, including the commission portion).
     * Repaid automatically by sweeping future wallet credits. Never negative.
     */
    commissionOwed: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Gross ride credits credited today (UTC day); rolled in ensureWalletDayStats. */
    todayEarnings: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** UTC date key (YYYY-MM-DD) for todayEarnings rollover. */
    statsDate: {
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

driverWalletSchema.index({ driverId: 1 }, { unique: true });

const DriverWallet = mongoose.model('DriverWallet', driverWalletSchema);
export default DriverWallet;
