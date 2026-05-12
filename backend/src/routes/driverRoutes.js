import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import * as driverController from '../controllers/driverController.js';
import * as payoutController from '../controllers/payoutController.js';
import * as paymentController from '../controllers/paymentController.js';
import * as driverSecurityController from '../controllers/driverSecurityController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { requireDriverApproved, requireBankDetails } from '../middleware/onboarding.js';
import {
  requireTransactionPin,
  checkDeviceTrust,
  riskEngine,
} from '../middleware/walletSecurity.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';
import { normalizeDriverCreateBody } from '../middleware/driverCreateBody.js';

const router = express.Router();

// Multer storage for the driver /create endpoint.
//
// On cloudinary we use disk-backed storage so multer streams the multipart
// body to a temp file (~64 KB working set per concurrent upload) instead of
// holding the entire decoded buffer in RAM. The controller then streams that
// temp file straight into cloudinary.uploader.upload_stream and unlinks it.
// Holding 4 in-memory buffers in parallel was pushing the container past its
// memory limit and triggering an OOM-restart between Cloudinary success and
// the response write — the client then retried and hit a 409.
//
// For non-cloudinary providers we keep memoryStorage so the existing local
// dev flow (writing the buffer into ./uploads inside the controller) is
// byte-identical to before this change. Picking storage at module load is
// fine because UPLOAD_PROVIDER is a deploy-time setting.
const DRIVER_CREATE_USES_CLOUDINARY =
  (process.env.UPLOAD_PROVIDER || 'local') === 'cloudinary';

let driverCreateStorage;
if (DRIVER_CREATE_USES_CLOUDINARY) {
  const tmpDir = path.join(os.tmpdir(), 'keke-driver-create');
  mkdirSync(tmpDir, { recursive: true });
  driverCreateStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, tmpDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '';
      cb(null, `${randomUUID()}${ext}`);
    },
  });
} else {
  driverCreateStorage = multer.memoryStorage();
}

const driverCreateUpload = multer({
  storage: driverCreateStorage,
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

// Paystack bank directory + NIBSS resolve (also mounted under /api/bank/* on payment routes).
// Duplicated here so clients hitting /api/driver/* always reach the same handlers as other driver flows.
router.get('/banks/nigeria/list', limiters.walletOpsLimiter, paymentController.listNigeriaBanks);
router.post(
  '/banks/resolve',
  limiters.bankResolveLimiter,
  validationRules.resolveBankAccount,
  validate,
  paymentController.resolveBankAccount
);
router.get(
  '/banks/resolve',
  limiters.bankResolveLimiter,
  validationRules.resolveBankAccountQuery,
  validate,
  paymentController.resolveBankAccount
);

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
