import express from 'express';
import multer from 'multer';
import * as driverController from '../controllers/driverController.js';
import * as payoutController from '../controllers/payoutController.js';
import * as driverSecurityController from '../controllers/driverSecurityController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { requireDriverApproved, requireBankDetails } from '../middleware/onboarding.js';
import {
  requireTransactionPin,
  checkDeviceTrust,
  riskEngine,
} from '../middleware/walletSecurity.js';
import { validationRules, validate } from '../middleware/validation.js';
import { normalizeDriverCreateBody } from '../middleware/driverCreateBody.js';

const router = express.Router();

// Multer for driver create only: parse multipart, accept any file type (mobile may send varied mimetypes)
const driverCreateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).any();

// Parse multipart form (mobile FormData) then normalize to API shape for driver create
function parseDriverCreateBody(req, res, next) {
  if (!req.is('multipart/form-data')) {
    return normalizeDriverCreateBody(req, res, next);
  }
  driverCreateUpload(req, res, (err) => {
    if (err) return next(err);
    normalizeDriverCreateBody(req, res, next);
  });
}

// All routes require authentication
router.use(protect);

// Create driver profile - allowed for users transitioning to driver (not yet driver)
router.post('/create', parseDriverCreateBody, validationRules.createDriver, validate, driverController.createDriverProfile);

// Driver-only routes (require driver role)
router.use(restrictTo('driver'));
router.get('/profile', driverController.getDriverProfile);
router.get('/setup-status', driverController.getDriverSetupStatus);
router.patch('/profile', validationRules.updateDriver, validate, driverController.updateDriverProfile);

// Driver availability
router.patch('/availability', validationRules.toggleAvailability, validate, driverController.toggleAvailability);

// Driver earnings and withdrawals
router.get('/earnings', driverController.getDriverEarnings);
router.get('/rides/earning', driverController.getDriverEarnings); // Alias
router.get('/withdrawals', driverController.getMyWithdrawals);
router.get('/challenges', driverController.getDriverChallenges);

// Driver security (PIN)
router.post('/security/setup-pin', validationRules.setupTransactionPin, validate, driverSecurityController.setupPin);
router.get('/security/pin-status', driverSecurityController.getPinStatusRoute);

// Driver wallet and payout requests
router.get('/wallet', payoutController.getMyWallet);
router.get('/payouts', payoutController.getMyPayouts);
router.post(
  '/payout/request',
  requireDriverApproved,
  requireBankDetails,
  requireTransactionPin,
  checkDeviceTrust,
  riskEngine,
  validationRules.requestPayout,
  validate,
  payoutController.requestPayout
);

// Ride management
router.get('/rides/pending', driverController.getPendingRides);
router.post('/rides/ack-request', requireDriverApproved, validationRules.ackRideOffer, validate, driverController.ackRideOffer);
router.post('/rides/accept', requireDriverApproved, validationRules.acceptRide, validate, driverController.acceptRide);
router.post('/rides/cancel', validationRules.rejectRide, validate, driverController.rejectRide);
router.post('/rides/arrived', validationRules.markArrived, validate, driverController.markArrived);
router.post('/rides/start', validationRules.startRide, validate, driverController.startRide);
router.post('/rides/complete', validationRules.completeRide, validate, driverController.completeRide);

// Payment management
router.post('/ride/confirm-payment', validationRules.confirmDriverPayment, validate, driverController.confirmPayment);
router.post('/ride/change-payment', validationRules.changePaymentMethod, validate, driverController.changePaymentMethod);

export default router;
