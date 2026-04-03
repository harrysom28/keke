import mongoose from 'mongoose';

const DELIVERY_TYPES = ['push', 'alert', 'banner', 'inbox'];
const PRIORITIES = ['critical', 'high', 'normal', 'low'];
const TARGET_ROLES = ['rider', 'driver', 'all'];
const ACTION_TYPES = ['none', 'navigate', 'open_url', 'call_api'];
const STATUSES = ['active', 'sent', 'cancelled'];

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: DELIVERY_TYPES,
      required: true,
    },
    priority: {
      type: String,
      enum: PRIORITIES,
      default: 'normal',
    },
    target_role: {
      type: String,
      enum: TARGET_ROLES,
      required: true,
    },
    target_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    is_global: {
      type: Boolean,
      default: false,
    },
    targeting_rules: {
      cities: {
        type: [String],
        default: undefined,
      },
      min_ride_count: Number,
      max_ride_count: Number,
      inactive_days: Number,
      min_wallet_balance: Number,
      max_wallet_balance: Number,
      min_driver_rating: Number,
      ride_status: String,
    },
    screen: {
      type: String,
      default: 'home',
    },
    image_url: {
      type: String,
      default: null,
    },
    duration_ms: {
      type: Number,
      default: 5000,
    },
    action_type: {
      type: String,
      enum: ACTION_TYPES,
      default: 'none',
    },
    action_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    start_time: {
      type: Date,
      default: null,
    },
    end_time: {
      type: Date,
      default: null,
    },
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'active',
    },
    event_key: {
      type: String,
      default: 'general',
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    relatedRide: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      default: null,
    },
    relatedPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

NotificationSchema.index({ target_user_id: 1, created_at: -1 });
NotificationSchema.index({ target_role: 1, status: 1, created_at: -1 });
NotificationSchema.index({ ride_id: 1 });
NotificationSchema.index({ event_key: 1 });

NotificationSchema.virtual('notification_id').get(function () {
  return this._id.toString();
});

NotificationSchema.virtual('createdAt').get(function () {
  return this.created_at;
});

NotificationSchema.virtual('updatedAt').get(function () {
  return this.updated_at;
});

NotificationSchema.statics.createNotification = async function (
  user,
  eventKey,
  title,
  message,
  data = {},
  relatedRide = null,
  relatedPayment = null
) {
  const userId = user?._id ?? user;
  const userRole = user?.role === 'driver' ? 'driver' : 'rider';
  const notification = await this.create({
    title,
    message,
    type: 'inbox',
    priority: 'normal',
    target_role: userRole,
    target_user_id: userId,
    is_global: false,
    event_key: eventKey || 'general',
    data,
    screen: data?.screen || 'home',
    ride_id: relatedRide || data?.rideId || null,
    relatedRide: relatedRide || data?.rideId || null,
    relatedPayment: relatedPayment || data?.paymentId || null,
    action_type: data?.screen ? 'navigate' : 'none',
    action_payload: data?.screen
      ? {
          screen: data.screen,
          ...(data?.rideId ? { rideId: data.rideId } : {}),
        }
      : null,
  });

  const UserNotification = mongoose.models.UserNotification;
  if (UserNotification && userId) {
    await UserNotification.updateOne(
      { notification_id: notification._id, user_id: userId },
      {
        $setOnInsert: {
          role: userRole,
          delivered_at: new Date(),
        },
      },
      { upsert: true }
    );
  }

  return notification;
};

const Notification =
  mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);

export { NotificationSchema };
export default Notification;
