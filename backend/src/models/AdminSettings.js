import mongoose from 'mongoose';

const adminSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    alerts: {
      rideWaitingThresholdMinutes: { type: Number, default: 5 },
      emailOnRideWaiting: { type: Boolean, default: false },
      emailOnNewDriverSignup: { type: Boolean, default: false },
      emailOnNewTicket: { type: Boolean, default: false },
      smsOnRideWaiting: { type: Boolean, default: false },
    },
    referral: {
      enabled: { type: Boolean, default: true },
      rewardType: { type: String, enum: ['cash', 'free_ride'], default: 'free_ride' },
      successfulInvitesRequired: { type: Number, default: 3 },
      cashAmount: { type: Number, default: 500 },
      freeRideAmount: { type: Number, default: 1000 },
      description: { type: String, default: 'Invite friends! When they complete signup and their first ride, you both get a reward.' },
    },
    topup: {
      bankName: { type: String, default: null },
      accountName: { type: String, default: null },
      accountNumber: { type: String, default: null },
    },
    // Preferred bank for Paystack Dedicated Virtual Accounts (e.g. 'wema-bank', 'titan-paystack')
    dvaPreferredBank: { type: String, default: 'wema-bank' },
    // Driver challenge definitions (admin-editable). Controls what appears in the driver app.
    // Rewards are still configured via driverTasks (below) for backwards compatibility.
    driverChallengeDefs: {
      type: [
        {
          id: { type: String, required: true },
          enabled: { type: Boolean, default: true },
          title: { type: String, required: true },
          description: { type: String, required: true },
          target: { type: Number, required: true },
          unit: { type: String, required: true },
        },
      ],
      default: undefined,
    },
    // Driver challenge rewards (admin-editable). Key = taskType, value = reward amount in NGN.
    driverTasks: {
      first_ride_today: { type: Number, default: 200 },
      rides_3_today: { type: Number, default: 500 },
      rides_5_today: { type: Number, default: 1000 },
      rides_10_today: { type: Number, default: 2500 },
      early_bird: { type: Number, default: 300 },
      night_owl: { type: Number, default: 300 },
      weekend_warrior: { type: Number, default: 1500 },
    },
    commission: {
      defaultRate: { type: Number, default: 20, min: 0, max: 100 },
      promotionalEnabled: { type: Boolean, default: false },
      promotionalRate: { type: Number, default: 0, min: 0, max: 100 },
      vehicleOverrides: {
        type: Map,
        of: Number,
        default: {},
      },
    },
    // KEKE pricing: Base Fare + (Distance × Per KM). If Total < Minimum → Minimum.
    pricing: {
      baseFare: { type: Number, default: 500 },
      perKmRate: { type: Number, default: 150 },
      minimumFare: { type: Number, default: 800 },
      currency: { type: String, default: 'NGN' },
    },
    // Escrow/fee settings (admin-editable; used by settingsService with 5-min cache)
    fees: {
      riderServiceCharge: { type: Number, default: 100 },
      driverPlatformRate: { type: Number, default: 0.08 },
    },
    cancellation: {
      afterAcceptPenalty: { type: Number, default: 200 },
      afterAcceptPayout: { type: Number, default: 200 },
      afterArrivalPayout: { type: Number, default: 150 },
      gracePeriodSeconds: { type: Number, default: 60 },
      maxDriverPayoutsPerDay: { type: Number, default: 3 },
    },
    arrival: {
      maxRadiusMeters: { type: Number, default: 150 },
    },
    wallet: {
      minTopupAmount: { type: Number, default: 500 },
      minWithdrawAmount: { type: Number, default: 1000 },
      maxDailyWithdrawal: { type: Number, default: 500000 },
    },
    paymentMethods: {
      wallet: {
        enabled: { type: Boolean, default: true },
        default: { type: Boolean, default: true },
      },
      cash: {
        enabled: { type: Boolean, default: true },
        default: { type: Boolean, default: false },
      },
      card: {
        enabled: { type: Boolean, default: false },
        default: { type: Boolean, default: false },
      },
      transfer: {
        enabled: { type: Boolean, default: false },
        default: { type: Boolean, default: false },
      },
    },
    feesLastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    feesLastUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

adminSettingsSchema.index({ key: 1 }, { unique: true });

const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);
export default AdminSettings;
