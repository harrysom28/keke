import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
    },
    type: {
      type: String,
      enum: [
        'ride_requested',
        'ride_accepted',
        'ride_arrived',
        'ride_started',
        'ride_completed',
        'ride_cancelled',
        'payment_completed',
        'payment_failed',
        'driver_assigned',
        'driver_cancelled',
        'promo_code',
        'account_verified',
        'booking_scheduled',
        'reminder',
        'general',
        'support_ticket',
      ],
      required: [true, 'Notification type is required'],
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
    },
    data: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
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
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    isPushSent: {
      type: Boolean,
      default: false,
    },
    pushSentAt: {
      type: Date,
      default: null,
    },
    isEmailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: {
      type: Date,
      default: null,
    },
    isSmsSent: {
      type: Boolean,
      default: false,
    },
    smsSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ relatedRide: 1 });
notificationSchema.index({ createdAt: -1 });

// Virtual for notification ID
notificationSchema.virtual('notification_id').get(function () {
  return this._id.toString();
});

// Method to mark as read
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

// Method to mark push as sent
notificationSchema.methods.markPushSent = async function () {
  this.isPushSent = true;
  this.pushSentAt = new Date();
  await this.save();
};

// Method to mark email as sent
notificationSchema.methods.markEmailSent = async function () {
  this.isEmailSent = true;
  this.emailSentAt = new Date();
  await this.save();
};

// Method to mark SMS as sent
notificationSchema.methods.markSmsSent = async function () {
  this.isSmsSent = true;
  this.smsSentAt = new Date();
  await this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = async function (
  user,
  type,
  title,
  message,
  data = {},
  relatedRide = null,
  relatedPayment = null
) {
  const notification = new this({
    user: user._id,
    type,
    title,
    message,
    data,
    relatedRide,
    relatedPayment,
  });

  await notification.save();
  return notification;
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
