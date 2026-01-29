import express from 'express';
import * as scheduleController from '../controllers/scheduleController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Scheduled bookings routes
router.get('/list-bookings', scheduleController.getScheduledBookings);
router.get('/latest/booking', scheduleController.getLatestScheduledBooking);
router.post('/accept/booking', validationRules.acceptScheduledBooking, validate, scheduleController.acceptScheduledBooking);
router.post('/cancel/booking', scheduleController.cancelScheduledBooking);
router.get('/closest/booking', scheduleController.getClosestScheduledBooking);

export default router;
