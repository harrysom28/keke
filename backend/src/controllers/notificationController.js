import Notification from '../models/Notification.js';
import UserNotification from '../models/UserNotification.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import {
  getUnreadCount,
  getUserInbox,
  markAllRead,
  markRead,
  previewTargeting,
  registerFcmTokenForUser,
  sendGlobal,
  sendToRole,
} from '../services/notificationService.js';

/**
 * Format notification response
 */
const formatNotificationResponse = (userNotification) => {
  const notification = userNotification?.notification_id || {};
  return {
    id: userNotification?._id?.toString?.() || null,
    notification_id: notification?._id?.toString?.() || userNotification?._id?.toString?.() || null,
    type: notification?.event_key || notification?.type || 'general',
    delivery_type: notification?.type || 'inbox',
    priority: notification?.priority || 'normal',
    title: notification?.title || '',
    message: notification?.message || '',
    screen: notification?.screen || 'home',
    action_type: notification?.action_type || 'none',
    action_payload: notification?.action_payload || null,
    image_url: notification?.image_url || null,
    duration_ms: notification?.duration_ms ?? 5000,
    data: notification?.data || {},
    related_ride_id:
      notification?.ride_id?.toString?.() ||
      notification?.relatedRide?._id?.toString?.() ||
      notification?.relatedRide?.toString?.() ||
      null,
    related_payment_id:
      notification?.relatedPayment?._id?.toString?.() ||
      notification?.relatedPayment?.toString?.() ||
      null,
    is_read: Boolean(userNotification?.is_read),
    is_dismissed: Boolean(userNotification?.is_dismissed),
    read_at: userNotification?.opened_at || null,
    delivered_at: userNotification?.delivered_at || null,
    created_at: notification?.created_at || notification?.createdAt || userNotification?.createdAt || null,
  };
};

/**
 * Get user notifications - GET /api/notifications
 */
export const getUserNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  const inbox = await getUserInbox(userId, page, limit);

  res.json({
    status: 'success',
    data: {
      notifications: inbox.notifications.map(formatNotificationResponse),
      unread_count: inbox.unread_count,
      pagination: {
        page: inbox.page,
        limit: Number(limit) || 20,
        total: inbox.total,
        pages: inbox.pages,
      },
    },
  });
});

/**
 * Mark notification as read - PATCH /api/notifications/:id/read
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const notification = await markRead(id, userId);
  if (!notification) {
    throw new NotFoundError('Notification');
  }

  logger.info(`Notification ${id} marked as read by user ${userId}`);

  res.json({
    status: 'success',
    message: 'Notification marked as read',
    data: {
      success: true,
    },
  });
});

/**
 * Mark all notifications as read - PATCH /api/notifications/read-all
 */
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await markAllRead(userId);

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

  const notification = await UserNotification.findOne({
    _id: id,
    user_id: userId,
  });
  if (!notification) {
    throw new NotFoundError('Notification');
  }

  notification.is_dismissed = true;
  await notification.save();

  logger.info(`Notification ${id} deleted by user ${userId}`);

  res.json({
    status: 'success',
    message: 'Notification deleted successfully',
  });
});

/**
 * GET /api/notifications/unread-count
 */
export const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const count = await getUnreadCount(req.user._id);
  res.json({
    status: 'success',
    data: {
      count,
    },
  });
});

/**
 * POST /api/notifications/fcm-token
 */
export const saveFcmToken = asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    throw new ValidationError('Token is required');
  }

  await registerFcmTokenForUser(req.user._id, token);
  res.json({
    status: 'success',
    data: {
      success: true,
    },
  });
});

/**
 * POST /api/admin/notifications/broadcast
 */
export const broadcastNotification = asyncHandler(async (req, res) => {
  const {
    title,
    message,
    type = 'inbox',
    priority = 'normal',
    target_role = 'all',
    targeting_rules = {},
    screen = 'home',
    action_type = 'none',
    action_payload = null,
  } = req.body || {};

  if (!title || !message) {
    throw new ValidationError('Title and message are required');
  }

  const payload = {
    title,
    message,
    type,
    priority,
    target_role,
    targeting_rules,
    screen,
    action_type,
    action_payload,
    is_global: target_role === 'all',
    event_key: 'broadcast',
  };

  const result = target_role === 'all'
    ? await sendGlobal(payload)
    : await sendToRole(target_role, payload);

  res.json({
    status: 'success',
    data: result,
  });
});

/**
 * POST /api/admin/notifications/targeting-preview
 */
export const targetingPreview = asyncHandler(async (req, res) => {
  const { target_role = 'all', targeting_rules = {} } = req.body || {};

  if (target_role === 'all') {
    const riderResult = await previewTargeting('rider', targeting_rules);
    const driverResult = await previewTargeting('driver', targeting_rules);
    return res.json({
      status: 'success',
      data: {
        matching_users: (riderResult.matching_users || 0) + (driverResult.matching_users || 0),
      },
    });
  }

  const result = await previewTargeting(target_role, targeting_rules);
  return res.json({
    status: 'success',
    data: result,
  });
});
