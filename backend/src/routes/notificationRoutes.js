import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Notification routes
router.get('/notifications', notificationController.getUserNotifications);
router.get('/notifications/unread-count', notificationController.getUnreadNotificationCount);
router.post('/notifications/fcm-token', notificationController.saveFcmToken);
router.patch('/notifications/read-all', notificationController.markAllNotificationsAsRead);
router.patch('/notifications/:id/read', validationRules.mongoId, validate, notificationController.markNotificationAsRead);

// Legacy notification routes kept for compatibility
router.get('/user/notifications', notificationController.getUserNotifications);
router.patch('/user/notifications/:id/read', validationRules.mongoId, validate, notificationController.markNotificationAsRead);
router.patch('/user/notifications/read-all', notificationController.markAllNotificationsAsRead);
router.delete('/user/notifications/:id', validationRules.mongoId, validate, notificationController.deleteNotification);

export default router;
