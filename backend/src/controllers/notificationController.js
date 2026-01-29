import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Get user notifications - GET /api/user/notifications
 */
export const getUserNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, type, isRead } = req.query;
  const skip = (page - 1) * limit;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const filter = { user: userId };

  if (type) {
    filter.type = type;
  }

  if (isRead !== undefined) {
    filter.isRead = isRead === 'true' || isRead === true;
  }

  const notifications = await Notification.find(filter)
    .populate('relatedRide', 'status fare pickupLocation dropoffLocation')
    .populate('relatedPayment', 'amount method status')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Notification.countDocuments(filter);
  const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

  res.json({
    status: 'success',
    data: {
      notifications: notifications.map((notification) => formatNotificationResponse(notification)),
      unread_count: unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Mark notification as read - PATCH /api/user/notifications/:id/read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const notification = await Notification.findById(id);
  if (!notification) {
    throw new NotFoundError('Notification');
  }

  if (notification.user.toString() !== userId.toString()) {
    throw new ValidationError('You do not have permission to modify this notification');
  }

  await notification.markAsRead();

  logger.info(`Notification ${id} marked as read by user ${userId}`);

  res.json({
    status: 'success',
    message: 'Notification marked as read',
    data: {
      notification: formatNotificationResponse(notification),
    },
  });
});

/**
 * Mark all notifications as read - PATCH /api/user/notifications/read-all
 */
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const result = await Notification.updateMany(
    { user: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  logger.info(`All notifications marked as read for user ${userId}`);

  res.json({
    status: 'success',
    message: 'All notifications marked as read',
    data: {
      updated_count: result.modifiedCount,
    },
  });
});

/**
 * Delete notification - DELETE /api/user/notifications/:id
 */
export const deleteNotification = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const notification = await Notification.findById(id);
  if (!notification) {
    throw new NotFoundError('Notification');
  }

  if (notification.user.toString() !== userId.toString()) {
    throw new ValidationError('You do not have permission to delete this notification');
  }

  await notification.deleteOne();

  logger.info(`Notification ${id} deleted by user ${userId}`);

  res.json({
    status: 'success',
    message: 'Notification deleted successfully',
  });
});

/**
 * Format notification response
 */
const formatNotificationResponse = (notification) => {
  return {
    notification_id: notification._id.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data ? Object.fromEntries(notification.data) : {},
    related_ride_id: notification.relatedRide?._id?.toString() || null,
    related_payment_id: notification.relatedPayment?._id?.toString() || null,
    is_read: notification.isRead,
    read_at: notification.readAt,
    created_at: notification.createdAt,
    push_sent: notification.isPushSent,
    email_sent: notification.isEmailSent,
    sms_sent: notification.isSmsSent,
  };
};
