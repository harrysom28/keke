import express from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes.js';
import onboardingRoutes from './onboardingRoutes.js';
import rideRoutes from './rideRoutes.js';
import driverRoutes from './driverRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import profileRoutes from './profileRoutes.js';
import vehicleRoutes from './vehicleRoutes.js';
import additionalFeaturesRoutes from './additionalFeaturesRoutes.js';
import scheduleRoutes from './scheduleRoutes.js';
import mapsRoutes from './maps.js';
import notificationRoutes from './notificationRoutes.js';
import messageRoutes from './messageRoutes.js';
import pusherRoutes from './pusherRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import adminRoutes from './adminRoutes.js';
import supportRoutes from './supportRoutes.js';
import * as pusherController from '../controllers/pusherController.js';
import * as driverController from '../controllers/driverController.js';
import * as rideController from '../controllers/rideController.js';
import * as authController from '../controllers/authController.js';
import { protect, restrictTo } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';
import { getRedisClient } from '../config/redis.js';

const router = express.Router();

// Health check (public) - includes DB state for load balancers
router.get('/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbConnected = dbState === 1;
  const mongo = dbConnected ? 'ok' : 'disconnected';

  let redisStatus = 'unavailable';
  try {
    const redisClient = getRedisClient();
    if (redisClient?.isOpen) {
      await redisClient.ping();
      redisStatus = 'ok';
    }
  } catch {
    redisStatus = 'unavailable';
  }

  const overallStatus = dbConnected ? 'ok' : 'degraded';
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    mongo,
    redis: redisStatus,
    uptime: process.uptime(),
    message: dbConnected ? 'API is running' : 'API running but database disconnected',
    timestamp: new Date().toISOString(),
    db: dbConnected ? 'connected' : 'disconnected',
  });
});

// Public config endpoint (for mobile app) - MUST BE BEFORE PROTECTED ROUTES
router.get('/config/public', (req, res) => {
  const pusherKey = process.env.PUSHER_KEY || process.env.PUSHER_APP_KEY || '';
  const pusherCluster = (process.env.PUSHER_CLUSTER || process.env.PUSHER_APP_CLUSTER || 'mt1').replace(/^["']|["']$/g, '').trim();
  
  res.json({
    status: true,
    data: {
      pusher: {
        key: pusherKey,
        cluster: pusherCluster,
      },
      google: {
        client_id: process.env.GOOGLE_CLIENT_ID || '',
      },
    },
  });
});

// Public Pusher test (no auth) – test with: curl http://localhost:8000/api/test-pusher
router.get('/test-pusher', pusherController.testPusher);

// Public forgot-password routes (no auth)
router.post(
  '/forgot/password',
  limiters.authLimiter,
  validationRules.forgotPasswordInit,
  validate,
  authController.forgotPasswordInit
);
router.post(
  '/forgot/password/confirm-otp',
  limiters.otpVerifyLimiter,
  validationRules.forgotPasswordConfirmOtp,
  validate,
  authController.forgotPasswordConfirmOtp
);
router.post(
  '/forgot/password/reset',
  limiters.authLimiter,
  validationRules.forgotPasswordReset,
  validate,
  authController.forgotPasswordReset
);

// API routes
router.use('/auth', authRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/booking', rideRoutes);
router.use('/driver', driverRoutes);
router.use('/vehicle', vehicleRoutes); // Vehicle routes
router.use('/schedule', scheduleRoutes); // Scheduled bookings routes
router.use('/maps', mapsRoutes); // Google Maps proxy routes
router.use('/admin', adminRoutes); // Admin panel routes
router.use('/support', supportRoutes); // User support tickets
router.use('/', paymentRoutes); // Payment routes use root paths matching mobile app endpoints
router.use('/', profileRoutes); // Profile routes use root paths matching mobile app endpoints
router.use('/', additionalFeaturesRoutes); // Additional features routes
router.use('/', notificationRoutes); // Notification routes
router.use('/', messageRoutes); // Message/Chat routes
router.use('/', pusherRoutes); // Pusher authentication routes
router.use('/', uploadRoutes); // File upload routes

// Additional ride endpoints
router.get('/ride/driver-location', protect, rideController.getDriverLocation);
router.post('/booking/ride/assign-new-driver', protect, validationRules.assignNewDriver, validate, rideController.assignNewDriver);
router.get('/rides/fare-estimate', protect, validationRules.fareEstimatePreviewQuery, validate, rideController.getFareEstimatePreview);
// Rider trip recovery + force-complete (alias routes; keeps /booking/* intact)
router.get('/rides/active', protect, restrictTo('passenger'), rideController.getActiveRide);
router.post(
  '/rides/:rideId/force-complete',
  protect,
  restrictTo('passenger'),
  validationRules.rideIdParam,
  validate,
  rideController.forceCompleteRide
);
router.get('/rides/:rideId', protect, validationRules.rideIdParam, validate, rideController.getRideDetails);

// Driver discovery
router.get('/drivers/nearby-count', protect, validationRules.nearbyDriverCountQuery, validate, driverController.getNearbyDriverCount);

// Location routes (matching mobile app endpoints)
router.patch('/update/locations/drivers-passengers', protect, validationRules.updateLocation, validate, driverController.updateLocation);
router.get('/locations/drivers-passengers', protect, driverController.getLocations);

// Tasks route (matching mobile app endpoint)
router.get('/tasks/daily/', protect, driverController.getDailyTasks);

export default router;
