import express from 'express';
import * as notificationController from '../controllers/notificationController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Notification routes
router.get('/user/notifications', notificationController.getUserNotifications);
router.patch('/user/notifications/:id/read', validationRules.mongoId, validate, notificationController.markNotificationAsRead);
router.patch('/user/notifications/read-all', notificationController.markAllNotificationsAsRead);
router.delete('/user/notifications/:id', validationRules.mongoId, validate, notificationController.deleteNotification);

export default router;
