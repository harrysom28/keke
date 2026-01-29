import express from 'express';
import * as rideController from '../controllers/rideController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Booking/Ride routes (matching mobile app endpoints)
router.post('/request-ride', validationRules.requestRide, validate, rideController.requestRide);
router.post('/confirm-ride', validationRules.requestRide, validate, rideController.requestRide); // Alias for request-ride
router.get('/destination-details', rideController.getFareEstimate);
router.get('/find-driver', rideController.findNearbyDrivers);
router.get('/active-ride', rideController.getActiveRide);
router.get('/cancel-ride', rideController.cancelRide);
router.post('/cancel-ride', rideController.cancelRide);
router.get('/history', rideController.getRideHistory);

// Driver routes
router.get('/driver/active-ride', rideController.getDriverActiveRide);

export default router;
