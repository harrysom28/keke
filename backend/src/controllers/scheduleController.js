import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import User from '../models/User.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { calculateDistance } from '../utils/geolocation.js';
import rideMatchingService from '../services/rideMatchingService.js';
import { getSocketService } from '../services/socketService.js';

/**
 * Get scheduled bookings - GET /api/schedule/list-bookings
 */
export const getScheduledBookings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { role, page = 1, limit = 20 } = req.query;
  const skip = (page - 1) * limit;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  let filter = {};

  if (role === 'driver' || user.role === 'driver') {
    // Get scheduled rides for driver
    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      // Return empty data instead of error if driver profile doesn't exist
      // This happens when user has driver role but hasn't completed registration
      return res.json({
        status: 'success',
        data: {
          scheduled_bookings: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0,
          },
        },
      });
    }

    filter = {
      driver: driver._id,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
    };
  } else {
    // Get scheduled rides for rider
    filter = {
      rider: userId,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
    };
  }

  const scheduledRides = await Ride.find(filter)
    .populate(role === 'driver' ? 'rider' : 'driver.user', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ scheduledAt: 1 }) // Sort by scheduled time
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      scheduled_bookings: scheduledRides.map((ride) => formatScheduledRideResponse(ride, role === 'driver')),
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
 * Accept scheduled booking - POST /api/schedule/accept/booking
 */
export const acceptScheduledBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  if (!rideId) {
    throw new ValidationError('Ride ID is required');
  }

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Check if driver is available
  if (!driver.isAvailable || !driver.isOnline) {
    throw new ValidationError('Driver must be online and available to accept bookings');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (!ride.isScheduled) {
    throw new ValidationError('Ride is not a scheduled booking');
  }

  if (ride.status !== 'requested' && ride.status !== 'scheduled') {
    throw new ValidationError('Ride cannot be accepted in current status');
  }

  if (ride.driver) {
    throw new ConflictError('Ride has already been accepted by another driver');
  }

  // Check if scheduled time is in the future
  if (ride.scheduledAt && ride.scheduledAt < new Date()) {
    throw new ValidationError('Cannot accept past scheduled ride');
  }

  // Check if driver matches vehicle type
  if (driver.vehicleDetails.vehicleType.toString() !== ride.vehicleType.toString()) {
    throw new ValidationError('Driver vehicle type does not match ride requirements');
  }

  // Assign driver to ride
  ride.driver = driver._id;
  ride.status = 'accepted';
  ride.acceptedByDriver = true;
  ride.acceptedAt = new Date();
  ride.statusHistory.push({
    status: 'accepted',
    timestamp: new Date(),
    note: `Scheduled booking accepted by driver ${driver._id}`,
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Make driver unavailable (they'll be available again when ride is completed or scheduled time arrives)
  driver.isAvailable = false;
  await driver.save();

  // Send real-time notification
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideAccepted(ride, driver);
    socketService.emitRideStatusUpdate(ride, 'accepted', driver);
  }

  logger.info(`Scheduled booking ${rideId} accepted by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Scheduled booking accepted successfully',
    data: {
      booking: formatScheduledRideResponse(ride, true),
    },
  });
});

/**
 * Get latest scheduled booking - GET /api/schedule/latest/booking
 */
export const getLatestScheduledBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  let filter = {};

  if (user.role === 'driver') {
    // Get latest scheduled ride for driver
    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      return res.json({
        status: 'success',
        data: [],
      });
    }

    filter = {
      driver: driver._id,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
    };
  } else {
    // Get latest scheduled ride for rider
    filter = {
      rider: userId,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
    };
  }

  const latestBooking = await Ride.findOne(filter)
    .populate(user.role === 'driver' ? 'rider' : 'driver.user', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ scheduledAt: 1 }) // Get the earliest upcoming booking
    .limit(1);

  if (!latestBooking) {
    return res.json({
      status: 'success',
      data: [],
    });
  }

  res.json({
    status: 'success',
    data: [latestBooking],
  });
});

/**
 * Get closest scheduled booking - GET /api/schedule/closest/booking
 */
export const getClosestScheduledBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { latitude, longitude } = req.query;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'driver') {
    throw new ValidationError('Only drivers can view closest scheduled booking');
  }

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {
        booking: null,
        message: 'Driver profile not found. Please complete your driver registration.',
      },
    });
  }

  // Get all scheduled rides for driver's vehicle type
  const scheduledRides = await Ride.find({
    vehicleType: driver.vehicleDetails.vehicleType,
    isScheduled: true,
    scheduledAt: { $gte: new Date() }, // Only future rides
    status: { $in: ['requested', 'scheduled'] },
    driver: null, // Not yet accepted
  })
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ scheduledAt: 1 }); // Sort by scheduled time

  if (scheduledRides.length === 0) {
    return res.json({
      status: 'success',
      data: {
        booking: null,
        message: 'No scheduled bookings available',
      },
    });
  }

  // If location provided, find closest booking
  let closestBooking = scheduledRides[0];
  let closestDistance = Infinity;

  if (latitude && longitude) {
    const driverLat = parseFloat(latitude);
    const driverLng = parseFloat(longitude);

    for (const ride of scheduledRides) {
      const rideLat = ride.pickupLocation.coordinates[1];
      const rideLng = ride.pickupLocation.coordinates[0];
      const distance = calculateDistance(driverLat, driverLng, rideLat, rideLng);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestBooking = ride;
      }
    }
  }

  res.json({
    status: 'success',
    data: {
      booking: formatScheduledRideResponse(closestBooking, true),
      distance: closestDistance < Infinity ? closestDistance.toFixed(2) : null,
      scheduled_in: closestBooking.scheduledAt
        ? Math.round((closestBooking.scheduledAt - new Date()) / (1000 * 60)) // Minutes
        : null,
    },
  });
});

/**
 * Schedule a ride - POST /api/booking/schedule-ride
 */
export const scheduleRide = asyncHandler(async (req, res) => {
  const { pickupLocation, dropoffLocation, vehicleTypeId, paymentMethod, scheduledAt, promoCode } = req.body;
  const riderId = req.user._id;

  if (!scheduledAt) {
    throw new ValidationError('Scheduled time is required');
  }

  const scheduledTime = new Date(scheduledAt);
  if (scheduledTime < new Date()) {
    throw new ValidationError('Scheduled time must be in the future');
  }

  // Check if rider has active ride
  const activeRide = await Ride.findActiveRideForRider(riderId);
  if (activeRide && !activeRide.isScheduled) {
    throw new ConflictError('You already have an active ride');
  }

  // This will reuse the requestRide logic but with scheduled flag
  // For now, return success with instructions
  res.status(201).json({
    status: 'success',
    message: 'Ride scheduled successfully. Use /api/booking/request-ride with scheduledAt parameter.',
    data: {
      scheduled_at: scheduledTime,
      instructions: 'Include scheduledAt in request-ride body to schedule a ride',
    },
  });
});

/**
 * Cancel scheduled booking - POST /api/schedule/cancel/booking
 */
export const cancelScheduledBooking = asyncHandler(async (req, res) => {
  const { booking_id, rideId, reason } = req.body;
  const userId = req.user._id;
  
  // Use booking_id or rideId (both are the same for scheduled rides)
  const rideIdToCancel = booking_id || rideId;
  
  if (!rideIdToCancel) {
    throw new ValidationError('Booking ID or Ride ID is required');
  }

  const ride = await Ride.findById(rideIdToCancel)
    .populate('rider')
    .populate({
      path: 'driver',
      populate: {
        path: 'user',
        model: 'User'
      }
    });

  if (!ride) {
    throw new NotFoundError('Booking');
  }

  // Verify user has permission to cancel
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const isRider = ride.rider && ride.rider._id.toString() === userId.toString();
  const isDriver = ride.driver && ride.driver.user && ride.driver.user._id.toString() === userId.toString();

  if (!isRider && !isDriver && user.role !== 'admin') {
    throw new ValidationError('You do not have permission to cancel this booking');
  }

  // Check if ride can be cancelled
  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw new ValidationError(`Cannot cancel a ${ride.status} ride`);
  }

  // Determine who cancelled
  const cancelledBy = isRider ? 'rider' : (isDriver ? 'driver' : 'admin');
  
  // Calculate cancellation fee (usually 0 for scheduled rides cancelled well in advance)
  const cancellationFee = 0; // No fee for scheduled bookings cancelled in advance

  // Cancel the ride using the Ride model method
  await ride.cancelRide(cancelledBy, reason, cancellationFee);

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideIdToCancel)) {
    const timers = global.automationTimers.get(rideIdToCancel);
    timers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideIdToCancel);
  }

  // If driver cancelled, make them available again
  if (isDriver && ride.driver) {
    const driver = await Driver.findById(ride.driver._id);
    if (driver) {
      driver.isAvailable = true;
      await driver.save();
    }
  }

  // Send real-time notification
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideStatusUpdate(ride, 'cancelled');
  }

  logger.info(`Scheduled booking ${rideIdToCancel} cancelled by ${cancelledBy}`);

  res.json({
    status: 'success',
    message: 'Scheduled booking cancelled successfully',
    data: {
      booking_id: rideIdToCancel,
      status: 'cancelled',
    },
  });
});

/**
 * Format scheduled ride response
 */
const formatScheduledRideResponse = (ride, isDriverView = false) => {
  const baseResponse = {
    ride_id: ride._id.toString(),
    is_scheduled: ride.isScheduled,
    scheduled_at: ride.scheduledAt,
    status: ride.status,
    vehicle_type: ride.vehicleType ? {
      vehicle_id: ride.vehicleType._id.toString(),
      name: ride.vehicleType.name,
      display_name: ride.vehicleType.displayName,
    } : null,
    pickup: {
      address: ride.pickupLocation.address,
      location: {
        latitude: ride.pickupLocation.coordinates[1],
        longitude: ride.pickupLocation.coordinates[0],
      },
    },
    dropoff: {
      address: ride.dropoffLocation.address,
      location: {
        latitude: ride.dropoffLocation.coordinates[1],
        longitude: ride.dropoffLocation.coordinates[0],
      },
    },
    fare: ride.fare?.totalFare || 0,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    payment_method: ride.paymentMethod,
    created_at: ride.createdAt,
  };

  if (isDriverView) {
    baseResponse.passenger = ride.rider ? {
      user_id: ride.rider._id.toString(),
      name: ride.rider.name,
      phone: ride.rider.phone,
      image: ride.rider.profileImage,
      rating: ride.rider.rating || 0,
    } : null;
  } else {
    baseResponse.driver = ride.driver ? {
      driver_id: ride.driver._id?.toString(),
      name: ride.driver.user?.name,
      phone: ride.driver.user?.phone,
      image: ride.driver.user?.profileImage,
      rating: ride.driver.rating?.average || 0,
    } : null;
  }

  return baseResponse;
};
