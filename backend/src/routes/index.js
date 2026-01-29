import express from 'express';
import authRoutes from './authRoutes.js';
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
import * as driverController from '../controllers/driverController.js';
import * as rideController from '../controllers/rideController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// Health check (public)
router.get('/health', (req, res) => {
  res.json({
    status: 'success',
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// Public config endpoint (for mobile app) - MUST BE BEFORE PROTECTED ROUTES
router.get('/config/public', (req, res) => {
  // Support both PUSHER_KEY and PUSHER_APP_KEY for compatibility
  const pusherKey = process.env.PUSHER_KEY || process.env.PUSHER_APP_KEY || '';
  const pusherCluster = process.env.PUSHER_CLUSTER || process.env.PUSHER_APP_CLUSTER || 'mt1';
  
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

// API routes
router.use('/auth', authRoutes);
router.use('/booking', rideRoutes);
router.use('/driver', driverRoutes);
router.use('/vehicle', vehicleRoutes); // Vehicle routes
router.use('/schedule', scheduleRoutes); // Scheduled bookings routes
router.use('/maps', mapsRoutes); // Google Maps proxy routes
router.use('/admin', adminRoutes); // Admin panel routes
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

// Location routes (matching mobile app endpoints)
router.patch('/update/locations/drivers-passengers', protect, validationRules.updateLocation, validate, driverController.updateLocation);
router.get('/locations/drivers-passengers', protect, driverController.getLocations);

// Tasks route (matching mobile app endpoint)
router.get('/tasks/daily/', protect, driverController.getDailyTasks);

export default router;
