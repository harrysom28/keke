import express from 'express';
import * as rideController from '../controllers/rideController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { requireRiderComplete } from '../middleware/onboarding.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(protect);

router.post('/request-ride', limiters.rideCreationLimiter, requireRiderComplete, validationRules.requestRide, validate, rideController.requestRide);
router.post('/confirm-ride', limiters.rideCreationLimiter, requireRiderComplete, validationRules.requestRide, validate, rideController.requestRide);
router.get('/destination-details', validationRules.fareEstimateQuery, validate, rideController.getFareEstimate);
router.get('/find-driver', validationRules.findNearbyDriversQuery, validate, rideController.findNearbyDrivers);
router.get('/active-ride', rideController.getActiveRide);
router.post('/cancel-ride', validationRules.cancelRide, validate, rideController.cancelRide);
router.get('/history', validationRules.rideHistoryQuery, validate, rideController.getRideHistory);
router.get('/rides/:rideId', validationRules.rideIdParam, validate, rideController.getRideDetails);

// Driver-only route
router.get('/driver/active-ride', restrictTo('driver'), rideController.getDriverActiveRide);

export default router;
