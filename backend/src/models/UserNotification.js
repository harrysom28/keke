import mongoose from 'mongoose';

const UserNotificationSchema = new mongoose.Schema(
  {
    notification_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['rider', 'driver'],
    },
    is_read: {
      type: Boolean,
      default: false,
    },
    is_dismissed: {
      type: Boolean,
      default: false,
    },
    delivered_at: {
      type: Date,
      default: Date.now,
    },
    opened_at: {
      type: Date,
      default: null,
    },
    clicked_at: {
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

UserNotificationSchema.index({ user_id: 1, is_read: 1, delivered_at: -1 });
UserNotificationSchema.index({ notification_id: 1, user_id: 1 }, { unique: true });

const UserNotification =
  mongoose.models.UserNotification ||
  mongoose.model('UserNotification', UserNotificationSchema);

export { UserNotificationSchema };
export default UserNotification;
