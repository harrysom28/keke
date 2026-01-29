import Driver from '../models/Driver.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import VehicleType from '../models/VehicleType.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { calculateDistance } from '../utils/geolocation.js';

/**
 * Create driver profile - POST /api/driver/create
 */
export const createDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    licenseNumber,
    licenseExpiry,
    vehicleDetails,
    bankAccount,
    insurance,
  } = req.body;

  // Check if user already has a driver profile
  const existingDriver = await Driver.findOne({ user: userId });
  if (existingDriver) {
    throw new ConflictError('Driver profile already exists');
  }

  // Check if user role is driver
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Validate vehicle type
  if (vehicleDetails?.vehicleType) {
    const vehicleType = await VehicleType.findById(vehicleDetails.vehicleType);
    if (!vehicleType || !vehicleType.isActive) {
      throw new NotFoundError('Vehicle type');
    }
  }

  // Create driver profile
  const driverData = {
    user: userId,
    licenseNumber,
    licenseExpiry: new Date(licenseExpiry),
    vehicleDetails: {
      make: vehicleDetails.make,
      model: vehicleDetails.model,
      year: vehicleDetails.year,
      plateNumber: vehicleDetails.plateNumber,
      color: vehicleDetails.color,
      vehicleType: vehicleDetails.vehicleType,
    },
    documentsVerified: false,
    verificationStatus: 'pending',
    isOnline: false,
    isAvailable: false,
  };

  if (bankAccount) {
    driverData.bankAccount = bankAccount;
  }

  if (insurance) {
    driverData.insurance = {
      provider: insurance.provider,
      policyNumber: insurance.policyNumber,
      expiryDate: insurance.expiryDate ? new Date(insurance.expiryDate) : null,
      documentUrl: insurance.documentUrl || null,
    };
  }

  const driver = await Driver.create(driverData);
  await driver.populate('user', 'name email phone profileImage role');
  await driver.populate('vehicleDetails.vehicleType');

  // Update user role to driver
  user.role = 'driver';
  await user.save();

  logger.info(`Driver profile created for user ${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Driver profile created successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Get driver profile - GET /api/driver/profile
 */
export const getDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const driver = await Driver.findOne({ user: userId })
    .populate('user', 'name email phone profileImage role rating')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  res.json({
    status: 'success',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Update driver profile - PATCH /api/driver/profile
 */
export const updateDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const updateData = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Handle vehicle details update
  if (updateData.vehicleDetails) {
    if (updateData.vehicleDetails.vehicleType) {
      const vehicleType = await VehicleType.findById(updateData.vehicleDetails.vehicleType);
      if (!vehicleType || !vehicleType.isActive) {
        throw new NotFoundError('Vehicle type');
      }
    }

    driver.vehicleDetails = {
      ...driver.vehicleDetails.toObject(),
      ...updateData.vehicleDetails,
    };
  }

  // Handle license update
  if (updateData.licenseNumber) {
    driver.licenseNumber = updateData.licenseNumber;
  }
  if (updateData.licenseExpiry) {
    driver.licenseExpiry = new Date(updateData.licenseExpiry);
  }

  // Handle bank account update
  if (updateData.bankAccount) {
    driver.bankAccount = {
      ...driver.bankAccount?.toObject(),
      ...updateData.bankAccount,
      verified: false, // Reset verification on update
    };
  }

  // Handle insurance update
  if (updateData.insurance) {
    driver.insurance = {
      ...driver.insurance?.toObject(),
      ...updateData.insurance,
      expiryDate: updateData.insurance.expiryDate
        ? new Date(updateData.insurance.expiryDate)
        : driver.insurance?.expiryDate,
    };
  }

  // Handle vehicle images
  if (updateData.vehicleImages && Array.isArray(updateData.vehicleImages)) {
    driver.vehicleImages = updateData.vehicleImages.map((img) => ({
      type: img.type,
      url: img.url,
      createdAt: new Date(),
    }));
  }

  // Handle availability schedule
  if (updateData.availability) {
    driver.availability = {
      ...driver.availability?.toObject(),
      ...updateData.availability,
    };
  }

  await driver.save();
  await driver.populate('user', 'name email phone profileImage role rating');
  await driver.populate('vehicleDetails.vehicleType');

  logger.info(`Driver profile updated for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Driver profile updated successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Update driver/passenger location - PATCH /api/update/locations/drivers-passengers
 */
export const updateLocation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { latitude, longitude, address } = req.body;

  if (!latitude || !longitude) {
    throw new ValidationError('Latitude and longitude are required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update driver location if user is a driver
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: userId });
    if (driver) {
      await driver.updateLocation([longitude, latitude], address);
      
      // Emit location update via Socket.io and Pusher
      // This is called frequently during rides, so location updates will be real-time
      const { getSocketService } = await import('../services/socketService.js');
      const socketService = getSocketService();
      if (socketService) {
        // Check if driver has active ride and emit to rider
        const activeRide = await Ride.findActiveRideForDriver(driver._id);
        if (activeRide) {
          // Emit location update (this will also emit via Pusher)
          await socketService.emitDriverLocationUpdate(activeRide, driver);
        }
      }

      logger.info(`Driver location updated for driver ${driver._id}`);
    }
  }

  // Update user location (for passengers)
  // Always ensure type: 'Point' is set for valid GeoJSON
  user.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude],
    address: address || user.currentLocation?.address || null,
    lastUpdated: new Date(),
  };
  await user.save();

  res.json({
    status: 'success',
    message: 'Location updated successfully',
    data: {
      location: {
        latitude,
        longitude,
        address: address || null,
      },
    },
  });
});

/**
 * Get driver/passenger locations - GET /api/locations/drivers-passengers
 */
export const getLocations = asyncHandler(async (req, res) => {
  const { type, rideId } = req.query;

  let locations = [];

  if (type === 'drivers' || !type) {
    // Get all online available drivers
    const drivers = await Driver.find({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
    })
      .populate('user', 'name phone profileImage')
      .select('currentLocation user vehicleDetails');

    locations = drivers.map((driver) => ({
      id: driver._id.toString(),
      type: 'driver',
      userId: driver.user._id.toString(),
      name: driver.user.name,
      phone: driver.user.phone,
      image: driver.user.profileImage,
      location: {
        latitude: driver.currentLocation.coordinates[1],
        longitude: driver.currentLocation.coordinates[0],
        address: driver.currentLocation.address,
        lastUpdated: driver.currentLocation.lastUpdated,
      },
      vehicle: driver.vehicleDetails,
    }));
  }

  if (type === 'passengers' && rideId) {
    // Get passenger location for a specific ride
    const ride = await Ride.findById(rideId).populate('rider', 'name phone profileImage currentLocation');
    if (ride && ride.rider) {
      if (ride.rider.currentLocation) {
        locations = [{
          id: ride.rider._id.toString(),
          type: 'passenger',
          name: ride.rider.name,
          phone: ride.rider.phone,
          image: ride.rider.profileImage,
          location: {
            latitude: ride.rider.currentLocation.coordinates[1],
            longitude: ride.rider.currentLocation.coordinates[0],
            address: ride.rider.currentLocation.address,
            lastUpdated: ride.rider.currentLocation.lastUpdated,
          },
        }];
      }
    }
  }

  res.json({
    status: 'success',
    data: {
      locations,
    },
  });
});

/**
 * Toggle driver availability - PATCH /api/driver/availability
 */
export const toggleAvailability = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { isAvailable } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Check if driver is verified
  if (!driver.documentsVerified || driver.verificationStatus !== 'approved') {
    throw new ValidationError('Driver must be verified to go online');
  }

  // Check if driver has active ride
  const activeRide = await Ride.findActiveRideForDriver(driver._id);
  if (activeRide && isAvailable === false) {
    // Can't go offline if there's an active ride
    throw new ConflictError('Cannot go offline with an active ride');
  }

  driver.isAvailable = isAvailable === true || isAvailable === 'true';
  
  if (driver.isAvailable) {
    driver.isOnline = true;
    driver.lastActiveAt = new Date();
  } else {
    // When going offline, also set online to false if no active ride
    if (!activeRide) {
      driver.isOnline = false;
    }
  }

  await driver.save();

  logger.info(`Driver availability toggled: ${driver.isAvailable} for driver ${driver._id}`);

  res.json({
    status: 'success',
    message: `Driver is now ${driver.isAvailable ? 'available' : 'unavailable'}`,
    data: {
      driver: {
        driver_id: driver._id.toString(),
        is_online: driver.isOnline,
        is_available: driver.isAvailable,
      },
    },
  });
});

/**
 * Get driver earnings - GET /api/driver/earnings
 */
export const getDriverEarnings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { period = 'all' } = req.query; // all, today, week, month

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {
        earnings: {
          total: 0,
          today: 0,
          thisWeek: 0,
          thisMonth: 0,
          period: 0,
          currency: 'NGN',
        },
        statistics: {
          totalRides: 0,
          rating: 0,
          acceptanceRate: 0,
          cancellationRate: 0,
        },
        recentRides: [],
        bank_account: null,
      },
    });
  }

  let earnings = driver.earnings.total;
  if (period === 'today') {
    earnings = driver.earnings.today;
  } else if (period === 'week') {
    earnings = driver.earnings.thisWeek;
  } else if (period === 'month') {
    earnings = driver.earnings.thisMonth;
  }

  // Get recent transactions
  const recentRides = await Ride.find({
    driver: driver._id,
    status: 'completed',
    paymentStatus: 'completed',
  })
    .sort({ completedAt: -1 })
    .limit(10)
    .select('fare paymentStatus completedAt');

  res.json({
    status: 'success',
    data: {
      earnings: {
        total: driver.earnings.total,
        today: driver.earnings.today,
        thisWeek: driver.earnings.thisWeek,
        thisMonth: driver.earnings.thisMonth,
        period: earnings,
        currency: 'USD',
      },
      statistics: {
        totalRides: driver.totalRides,
        rating: driver.rating,
        acceptanceRate: driver.acceptanceRate,
        cancellationRate: driver.cancellationRate,
      },
      recentRides: recentRides.map((ride) => ({
        ride_id: ride._id.toString(),
        fare: ride.fare.totalFare,
        payment_status: ride.paymentStatus,
        completed_at: ride.completedAt,
      })),
    },
  });
});

/**
 * Get pending rides for driver - GET /api/driver/rides/pending
 */
export const getPendingRides = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {
        rides: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0,
        },
      },
    });
  }

  const skip = (page - 1) * limit;

  // Find rides that match driver's vehicle type and are not assigned
  const rides = await Ride.find({
    vehicleType: driver.vehicleDetails.vehicleType,
    status: 'requested',
    driver: null,
  })
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments({
    vehicleType: driver.vehicleDetails.vehicleType,
    status: 'requested',
    driver: null,
  });

  res.json({
    status: 'success',
    data: {
      rides: rides.map((ride) => formatRideForDriver(ride)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Accept ride - POST /api/driver/rides/accept
 */
export const acceptRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Check if driver is available
  if (!driver.isAvailable || !driver.isOnline) {
    throw new ValidationError('Driver must be online and available to accept rides');
  }

  // Check if driver has active ride
  const activeRide = await Ride.findActiveRideForDriver(driver._id);
  if (activeRide) {
    throw new ConflictError('Driver already has an active ride');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.status !== 'requested') {
    throw new ValidationError('Ride is no longer available');
  }

  if (ride.driver) {
    throw new ConflictError('Ride has already been accepted');
  }

  // Assign driver to ride
  ride.driver = driver._id;
  ride.status = 'accepted';
  ride.acceptedByDriver = true;
  ride.acceptedAt = new Date();
  ride.statusHistory.push({
    status: 'accepted',
    timestamp: new Date(),
    note: `Accepted by driver ${driver._id}`,
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Make driver unavailable temporarily
  driver.isAvailable = false;
  await driver.save();

  // AUTOMATED RIDE FLOW: Schedule automatic state transitions
  // This automatically progresses: accepted → arrived → in-progress → completed
  // Enable with AUTOMATE_RIDES=true or in development mode
  // Added 15 seconds delay to arrival time and all subsequent steps
  logger.info(`🔧 NODE_ENV: ${process.env.NODE_ENV}, AUTOMATE_RIDES: ${process.env.AUTOMATE_RIDES}`);

  // Automation disabled - rides must be manually progressed by driver
  const shouldAutomate = false; // process.env.NODE_ENV === 'development' || process.env.AUTOMATE_RIDES === 'true';

  // IMPORTANT: Always clear any existing automation timers for this ride
  // This prevents old timers from running even if automation is disabled
  if (global.automationTimers && global.automationTimers.has(rideId)) {
    const existingTimers = global.automationTimers.get(rideId);
    existingTimers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideId);
    logger.info(`🧹 Cleared existing automation timers for ride ${rideId} (automation is disabled)`);
  }

  // CRITICAL: Clear ALL automation timers on server start or when accepting rides
  // This ensures no old timers from previous server instances are running
  if (global.automationTimers && global.automationTimers.size > 0) {
    logger.warn(`⚠️ Found ${global.automationTimers.size} existing automation timers - clearing all to prevent conflicts`);
    global.automationTimers.forEach((timers, rid) => {
      timers.forEach(timer => clearTimeout(timer));
      logger.info(`🧹 Cleared timers for ride ${rid}`);
    });
    global.automationTimers.clear();
  }

  if (!shouldAutomate) {
    logger.info(`🚫 Automation is DISABLED - ride ${rideId} must be manually progressed by driver`);
  } else {
    logger.warn(`⚠️ WARNING: Automation is ENABLED - this should not happen in production!`);
  }

  if (shouldAutomate) {
    logger.info(`🚀 Starting automated ride flow for ride ${rideId}`);

    // Store automation timers to avoid conflicts
    if (!global.automationTimers) {
      global.automationTimers = new Map();
    }

    // Clear any existing timers for this ride
    if (global.automationTimers.has(rideId)) {
      const existingTimers = global.automationTimers.get(rideId);
      existingTimers.forEach(timer => clearTimeout(timer));
    }

    const timers = [];
    const ARRIVAL_DELAY_MS = 15000; // 15 seconds delay after arrival before starting ride
    const ARRIVE_TIME_MS = 30000; // 30 seconds to arrive
    const START_TIME_MS = 60000; // 60 seconds to start (from accepted)
    const COMPLETE_TIME_MS = 90000; // 90 seconds to complete (from accepted)

    // After 30 seconds: Driver arrives
    const arriveTimer = setTimeout(async () => {
      try {
        logger.info(`⏰ ${ARRIVE_TIME_MS / 1000}s timer triggered for ride ${rideId} - moving to arrived`);
        const freshRide = await Ride.findById(rideId);

        if (freshRide && freshRide.status === 'accepted') {
          freshRide.status = 'arrived';
          freshRide.arrivedAt = new Date();
          freshRide.statusHistory.push({
            status: 'arrived',
            timestamp: new Date(),
            note: 'Driver arrived (automated)',
          });

          await freshRide.save();
          logger.info(`✅ Ride ${rideId} automatically transitioned to 'arrived' - will wait ${ARRIVAL_DELAY_MS / 1000}s before starting`);

          // Send real-time notification
          const { getSocketService } = await import('../services/socketService.js');
          const socketService = getSocketService();
          if (socketService) {
            socketService.emitRideStatusUpdate(freshRide, 'arrived', driver);
          }
        } else {
          logger.info(`⚠️ Ride ${rideId} status is ${freshRide?.status}, skipping arrived transition`);
        }
      } catch (error) {
        logger.error(`❌ Error auto-arriving ride ${rideId}:`, error.message);
      }
    }, ARRIVE_TIME_MS);
    timers.push(arriveTimer);

    // After 30s (arrive) + 15s delay = 45s: Start ride (15 seconds after arriving)
    const startTimer = setTimeout(async () => {
      try {
        logger.info(`⏰ ${(ARRIVE_TIME_MS + ARRIVAL_DELAY_MS) / 1000}s timer triggered for ride ${rideId} - moving to in-progress (${ARRIVAL_DELAY_MS / 1000}s after arrival)`);
        const freshRide = await Ride.findById(rideId);

        if (freshRide && (freshRide.status === 'accepted' || freshRide.status === 'arrived')) {
          freshRide.status = 'in-progress';
          freshRide.isRideStarted = true;
          freshRide.startedAt = new Date();
          freshRide.statusHistory.push({
            status: 'in-progress',
            timestamp: new Date(),
            note: 'Ride started (automated)',
          });

          await freshRide.save();
          await freshRide.populate('rider', 'name phone profileImage rating');
          await freshRide.populate('vehicleType');

          logger.info(`✅ Ride ${rideId} automatically transitioned to 'in-progress'`);

          // Send real-time notification
          const { getSocketService } = await import('../services/socketService.js');
          const socketService = getSocketService();
          if (socketService) {
            socketService.emitRideStarted(freshRide, driver);
            socketService.emitRideStatusUpdate(freshRide, 'in-progress', driver);
          }
        } else {
          logger.info(`⚠️ Ride ${rideId} status is ${freshRide?.status}, skipping in-progress transition`);
        }
      } catch (error) {
        logger.error(`❌ Error auto-starting ride ${rideId}:`, error.message);
      }
    }, ARRIVE_TIME_MS + ARRIVAL_DELAY_MS);
    timers.push(startTimer);

    // After 90 seconds: Complete ride (from accepted time)
    const completeTimer = setTimeout(async () => {
      try {
        logger.info(`⏰ ${COMPLETE_TIME_MS / 1000}s timer triggered for ride ${rideId} - moving to completed`);
        const freshRide = await Ride.findById(rideId);

        if (freshRide && freshRide.status === 'in-progress') {
          freshRide.status = 'completed';
          freshRide.dropOffCompleted = true;
          freshRide.completedAt = new Date();
          freshRide.paymentStatus = 'completed';
          freshRide.statusHistory.push({
            status: 'completed',
            timestamp: new Date(),
            note: 'Ride completed (automated)',
          });

          await freshRide.save();

          // Make driver available again
          driver.isAvailable = true;
          await driver.save();

          logger.info(`✅ Ride ${rideId} automatically completed`);

          // Send real-time notification
          const { getSocketService } = await import('../services/socketService.js');
          const socketService = getSocketService();
          if (socketService) {
            socketService.emitRideCompleted(freshRide, driver);
          }
        } else {
          logger.info(`⚠️ Ride ${rideId} status is ${freshRide?.status}, skipping completed transition`);
        }

        // Clean up timers
        global.automationTimers.delete(rideId);
      } catch (error) {
        logger.error(`❌ Error auto-completing ride ${rideId}:`, error.message);
        // Still clean up timers on error
        global.automationTimers.delete(rideId);
      }
    }, COMPLETE_TIME_MS);
    timers.push(completeTimer);

    // Store timers for cleanup
    global.automationTimers.set(rideId, timers);
  }

  // Send real-time notification to rider via Socket.io
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideAccepted(ride, driver);
    socketService.emitRideStatusUpdate(ride, 'accepted', driver);
  }

  // Update driver acceptance rate
  try {
    const { updateDriverAcceptanceRate } = await import('../services/driverStatisticsService.js');
    await updateDriverAcceptanceRate(driver._id);
  } catch (error) {
    logger.error(`Failed to update driver acceptance rate: ${error.message}`);
    // Don't fail ride acceptance if statistics update fails
  }

  logger.info(`Ride ${rideId} accepted by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride accepted successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Reject/Cancel ride by driver - POST /api/driver/rides/cancel
 */
export const rejectRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, reason } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  // Check if ride can be cancelled
  if (['completed', 'cancelled'].includes(ride.status)) {
    throw new ValidationError('Ride cannot be cancelled');
  }

  // If ride is just accepted, we can reject it
  if (ride.status === 'accepted') {
    ride.driver = null;
    ride.status = 'requested';
    ride.acceptedByDriver = false;
    ride.acceptedAt = null;
    ride.statusHistory.push({
      status: 'requested',
      timestamp: new Date(),
      note: `Rejected by driver: ${reason || 'No reason provided'}`,
    });

    // Make driver available again
    driver.isAvailable = true;
    await driver.save();

    // Cancel any automation timers for this ride
    if (global.automationTimers && global.automationTimers.has(rideId)) {
      const timers = global.automationTimers.get(rideId);
      timers.forEach(timer => clearTimeout(timer));
      global.automationTimers.delete(rideId);
      logger.info(`🧹 Cancelled automation timers for rejected ride ${rideId}`);
    }
  } else {
    // If ride is in progress, cancel it
    await ride.cancelRide('driver', reason, 0);
    driver.isAvailable = true;
    await driver.save();
  }

  await ride.save();

  // Find and notify other drivers (if ride is still requested)
  if (ride.status === 'requested') {
    try {
      const { getSocketService } = await import('../services/socketService.js');
      const socketService = getSocketService();
      if (socketService) {
        // Emit ride request again to notify other drivers
        socketService.emitRideRequest(ride);
      }
    } catch (error) {
      logger.error(`Failed to notify other drivers: ${error.message}`);
    }
  }

  // Update driver cancellation rate
  try {
    const { updateDriverCancellationRate } = await import('../services/driverStatisticsService.js');
    await updateDriverCancellationRate(driver._id);
  } catch (error) {
    logger.error(`Failed to update driver cancellation rate: ${error.message}`);
    // Don't fail ride rejection if statistics update fails
  }

  logger.info(`Ride ${rideId} rejected by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride rejected successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Start ride - POST /api/driver/rides/start
 */
export const startRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'accepted' && ride.status !== 'arrived') {
    throw new ValidationError('Ride cannot be started in current status');
  }

  ride.status = 'in-progress';
  ride.isRideStarted = true;
  ride.startedAt = new Date();
  ride.statusHistory.push({
    status: 'in-progress',
    timestamp: new Date(),
    note: 'Ride started',
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Send real-time notification to rider
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideStarted(ride, driver);
    socketService.emitRideStatusUpdate(ride, 'in-progress', driver);
  }

  // Start location tracking (driver should update location periodically)
  // Location updates will be emitted via updateLocation endpoint

  logger.info(`Ride ${rideId} started by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride started successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Complete ride - POST /api/driver/rides/complete
 */
export const completeRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, paymentStatus } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'in-progress') {
    throw new ValidationError('Ride is not in progress');
  }

  ride.status = 'completed';
  ride.dropOffCompleted = true;
  ride.completedAt = new Date();
  ride.paymentStatus = paymentStatus || ride.paymentMethod === 'cash' ? 'pending' : 'completed';

  // Update driver earnings
  if (ride.paymentStatus === 'completed') {
    await driver.addEarnings(ride.fare.totalFare);
    driver.totalRides += 1;
    await driver.save();
  }

  ride.statusHistory.push({
    status: 'completed',
    timestamp: new Date(),
    note: 'Ride completed',
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Make driver available again
  driver.isAvailable = true;
  await driver.save();

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideId)) {
    const timers = global.automationTimers.get(rideId);
    timers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideId);
    logger.info(`🧹 Cancelled automation timers for manually completed ride ${rideId}`);
  }

  // Process payment first
  let payment = null;
  try {
    const { processRidePayment, sendPaymentReceipt } = await import('../services/paymentService.js');
    const paymentResult = await processRidePayment(ride);
    
    // Send receipt if payment was processed
    if (paymentResult.success && paymentResult.payment && paymentResult.payment.status === 'completed') {
      payment = paymentResult.payment;
      await sendPaymentReceipt(ride, payment);
    }
  } catch (error) {
    logger.error(`Payment processing failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if payment processing fails
  }

  // Send real-time notification to rider (after payment processing)
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    await socketService.emitRideCompleted(ride);
    await socketService.emitRideStatusUpdate(ride, 'completed', driver);
  }

  // Request rating/review from rider
  try {
    const { requestRiderReview } = await import('../services/reviewService.js');
    await requestRiderReview(ride);
  } catch (error) {
    logger.error(`Review request failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if review request fails
  }

  logger.info(`Ride ${rideId} completed by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride completed successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Confirm payment - POST /api/driver/ride/confirm-payment
 */
export const confirmPayment = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Ride must be completed first');
  }

  if (ride.paymentStatus === 'completed') {
    throw new ConflictError('Payment already confirmed');
  }

  ride.paymentStatus = 'completed';
  await ride.save();

  // Update driver earnings if not already updated
  if (driver.earnings.lastUpdated < ride.completedAt) {
    await driver.addEarnings(ride.fare.totalFare);
    driver.totalRides += 1;
    await driver.save();
  }

  // Process payment transaction (if Stripe)
  if (ride.paymentMethod === 'card' || ride.paymentMethod === 'stripe') {
    try {
      const { confirmStripePayment } = await import('../services/paymentService.js');
      const payment = await Payment.findOne({ ride: rideId });
      if (payment && payment.stripePaymentIntentId) {
        await confirmStripePayment(payment.stripePaymentIntentId);
      }
    } catch (error) {
      logger.error(`Stripe payment confirmation failed: ${error.message}`);
      // Don't fail payment confirmation if Stripe processing fails
    }
  }

  // Send receipt
  try {
    const { sendPaymentReceipt } = await import('../services/paymentService.js');
    const payment = await Payment.findOne({ ride: rideId });
    if (payment) {
      await sendPaymentReceipt(ride, payment);
    }
  } catch (error) {
    logger.error(`Receipt sending failed: ${error.message}`);
    // Don't fail payment confirmation if receipt sending fails
  }

  logger.info(`Payment confirmed for ride ${rideId}`);

  res.json({
    status: 'success',
    message: 'Payment confirmed successfully',
    data: {
      ride: {
        ride_id: ride._id.toString(),
        payment_status: ride.paymentStatus,
        fare: ride.fare.totalFare,
      },
    },
  });
});

/**
 * Change payment method - POST /api/driver/ride/change-payment
 */
export const changePaymentMethod = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, paymentMethod } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw new ValidationError('Cannot change payment method for completed or cancelled rides');
  }

  const validMethods = ['cash', 'wallet', 'card', 'bank_transfer'];
  if (!validMethods.includes(paymentMethod)) {
    throw new ValidationError('Invalid payment method');
  }

  ride.paymentMethod = paymentMethod;
  await ride.save();

  logger.info(`Payment method changed to ${paymentMethod} for ride ${rideId}`);

  res.json({
    status: 'success',
    message: 'Payment method changed successfully',
    data: {
      ride: {
        ride_id: ride._id.toString(),
        payment_method: ride.paymentMethod,
      },
    },
  });
});

/**
 * Get daily tasks - GET /api/tasks/daily/
 */
export const getDailyTasks = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    // This happens when user has driver role but hasn't completed registration
    return res.json({
      status: 'success',
      data: {
        tasks: [],
        completed_tasks: [],
        total_earnings: 0,
        total_distance: 0,
        total_rides: 0,
      },
    });
  }

  // Get today's rides
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRides = await Ride.find({
    driver: driver._id,
    createdAt: { $gte: today, $lt: tomorrow },
  }).sort({ createdAt: -1 });

  // Calculate today's stats
  const completedRides = todayRides.filter((r) => r.status === 'completed').length;
  const cancelledRides = todayRides.filter((r) => r.status === 'cancelled').length;
  const totalEarnings = todayRides
    .filter((r) => r.status === 'completed' && r.paymentStatus === 'completed')
    .reduce((sum, r) => sum + (r.fare?.totalFare || 0), 0);

  res.json({
    status: 'success',
    data: {
      tasks: {
        total_rides: todayRides.length,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        total_earnings: totalEarnings,
        active_ride: await Ride.findActiveRideForDriver(driver._id) ? true : false,
      },
      rides: todayRides.map((ride) => ({
        ride_id: ride._id.toString(),
        status: ride.status,
        fare: ride.fare?.totalFare || 0,
        created_at: ride.createdAt,
      })),
    },
  });
});

/**
 * Format driver response for mobile app compatibility
 */
const formatDriverResponse = (driver) => {
  return {
    driver_id: driver._id.toString(),
    user_id: driver.user._id.toString(),
    user: {
      user_id: driver.user._id.toString(),
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.user.phone,
      image: driver.user.profileImage,
      role: driver.user.role,
      rating: driver.user.rating || 0,
    },
    license_number: driver.licenseNumber,
    license_expiry: driver.licenseExpiry,
    vehicle_details: {
      make: driver.vehicleDetails.make,
      model: driver.vehicleDetails.model,
      year: driver.vehicleDetails.year,
      plate_number: driver.vehicleDetails.plateNumber,
      color: driver.vehicleDetails.color,
      vehicle_type: driver.vehicleDetails.vehicleType?._id?.toString(),
      vehicle_type_name: driver.vehicleDetails.vehicleType?.name,
    },
    vehicle_images: driver.vehicleImages || [],
    documents_verified: driver.documentsVerified,
    verification_status: driver.verificationStatus,
    is_online: driver.isOnline,
    is_available: driver.isAvailable,
    earnings: driver.earnings,
    total_rides: driver.totalRides,
    rating: driver.rating,
    acceptance_rate: driver.acceptanceRate,
    cancellation_rate: driver.cancellationRate,
    bank_account: driver.bankAccount || null,
    insurance: driver.insurance || null,
    current_location: driver.currentLocation ? {
      latitude: driver.currentLocation.coordinates[1],
      longitude: driver.currentLocation.coordinates[0],
      address: driver.currentLocation.address,
    } : null,
  };
};

/**
 * Format ride response for driver
 */
const formatRideForDriver = (ride) => {
  return {
    ride_id: ride._id.toString(),
    passenger: ride.rider ? {
      user_id: ride.rider._id.toString(),
      name: ride.rider.name,
      phone: ride.rider.phone,
      image: ride.rider.profileImage,
      rating: ride.rider.rating || 0,
    } : null,
    origin: {
      lat: ride.pickupLocation.coordinates[1].toString(),
      long: ride.pickupLocation.coordinates[0].toString(),
      name: ride.pickupLocation.name || ride.pickupLocation.address,
      address: ride.pickupLocation.address,
    },
    destination: {
      lat: ride.dropoffLocation.coordinates[1].toString(),
      long: ride.dropoffLocation.coordinates[0].toString(),
      name: ride.dropoffLocation.name || ride.dropoffLocation.address,
      address: ride.dropoffLocation.address,
    },
    status: ride.status,
    fare: ride.fare?.totalFare || 0,
    payment_method: ride.paymentMethod,
    payment_status: ride.paymentStatus,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    accepted_by_driver: ride.acceptedByDriver,
    is_ride_started: ride.isRideStarted,
    drop_off_completed: ride.dropOffCompleted,
    created_at: ride.createdAt,
  };
};
