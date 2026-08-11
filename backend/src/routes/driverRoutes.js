import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import * as driverController from '../controllers/driverController.js';
import * as payoutController from '../controllers/payoutController.js';
import * as paymentController from '../controllers/paymentController.js';
import * as driverSecurityController from '../controllers/driverSecurityController.js';
import { protect, protectDriverRegistration, restrictTo } from '../middleware/auth.js';
import { requireDriverApproved, requireBankDetails } from '../middleware/onboarding.js';
import {
  requireTransactionPin,
  checkDeviceTrust,
  riskEngine,
} from '../middleware/walletSecurity.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';
import { normalizeDriverCreateBody } from '../middleware/driverCreateBody.js';
import logger from '../utils/logger.js';

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
  // Was: fileSize 10MB only. Explicit files/fields caps prevent runaway parts
  // while still fitting 4 compressed JPEGs + text fields from mobile.
  limits: {
    fileSize: 10 * 1024 * 1024, // unchanged: 10MB per file
    files: 8,
    fields: 40,
    fieldSize: 1024 * 1024,
  },
}).any();

// Parse multipart form (mobile FormData) then normalize to API shape for driver create
function parseDriverCreateBody(req, res, next) {
  const contentType = String(req.headers['content-type'] || '');
  const contentLength = req.headers['content-length'];
  logger.info('driver/create request received', {
    contentType: contentType.slice(0, 80),
    contentLength: contentLength || null,
    hasAuth: Boolean(req.headers.authorization || req.headers['x-auth-token']),
    method: req.method,
    path: req.originalUrl || req.url,
  });

  if (!req.is('multipart/form-data')) {
    return normalizeDriverCreateBody(req, res, next);
  }
  driverCreateUpload(req, res, (err) => {
    if (err) return next(err);
    const files = Array.isArray(req.files) ? req.files : [];
    logger.info('driver/create multer parsed', {
      fileCount: files.length,
      fields: files.map((f) => ({
        fieldname: f.fieldname,
        size: f.size,
        mimetype: f.mimetype,
      })),
      bodyKeys: Object.keys(req.body || {}),
    });
    normalizeDriverCreateBody(req, res, next);
  });
}

function cleanupDriverCreateTemps(req) {
  const files = Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    if (file?.path) {
      unlink(file.path).catch(() => {});
    }
  }
}

/**
 * Authenticate AFTER multer has fully consumed the multipart body.
 *
 * Order matters: parse → protectDriverRegistration (2h expiry grace, this
 * route only) → validate → controller. Temp files are cleaned on auth failure.
 */
function protectDriverCreate(req, res, next) {
  protectDriverRegistration(req, res, (err) => {
    if (err) cleanupDriverCreateTemps(req);
    next(err);
  });
}

// Create driver profile MUST be registered before router.use(protect) so we
// can parse the multipart body before auth (see protectDriverCreate).
// Allowed for users transitioning to driver (not yet driver role).
router.post(
  '/create',
  parseDriverCreateBody,
  protectDriverCreate,
  validationRules.createDriver,
  validate,
  driverController.createDriverProfile
);

// All other /api/driver routes require authentication
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
router.get('/wallet/transactions', payoutController.getDriverWalletTransactions);
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
router.get('/rides/current-offer', driverController.getCurrentRideOffer);
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
