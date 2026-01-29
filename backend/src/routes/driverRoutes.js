import express from 'express';
import * as driverController from '../controllers/driverController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Driver profile management
router.post('/create', validationRules.createDriver, validate, driverController.createDriverProfile);
router.get('/profile', driverController.getDriverProfile);
router.patch('/profile', validationRules.updateDriver, validate, driverController.updateDriverProfile);

// Driver availability
router.patch('/availability', validationRules.toggleAvailability, validate, driverController.toggleAvailability);

// Driver earnings
router.get('/earnings', driverController.getDriverEarnings);
router.get('/rides/earning', driverController.getDriverEarnings); // Alias

// Ride management
router.get('/rides/pending', driverController.getPendingRides);
router.post('/rides/accept', validationRules.acceptRide, validate, driverController.acceptRide);
router.post('/rides/cancel', validationRules.rejectRide, validate, driverController.rejectRide);
router.post('/rides/start', validationRules.startRide, validate, driverController.startRide);
router.post('/rides/complete', validationRules.completeRide, validate, driverController.completeRide);

// Payment management
router.post('/ride/confirm-payment', validationRules.confirmPayment, validate, driverController.confirmPayment);
router.post('/ride/change-payment', validationRules.changePaymentMethod, validate, driverController.changePaymentMethod);

export default router;
