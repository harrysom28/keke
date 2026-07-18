import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import User from '../models/User.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { calculateDistance } from '../utils/geolocation.js';
import rideMatchingService from '../services/rideMatchingService.js';
import { getSocketService } from '../services/socketService.js';
import { processCancellation } from '../services/escrowWalletService.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import { cache } from '../config/redis.js';

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
      status: { $nin: ['cancelled', 'completed'] },
      // Hide unpaid card bookings from drivers
      $nor: [{ paymentMethod: 'card', paymentStatus: 'pending' }],
    };
  } else {
    // Get scheduled rides for rider
    filter = {
      rider: userId,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
      status: { $nin: ['cancelled', 'completed'] },
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

  const ridePreview = await Ride.findById(rideId).populate('vehicleType');
  if (!ridePreview) {
    throw new NotFoundError('Ride');
  }

  if (!ridePreview.isScheduled) {
    throw new ValidationError('Ride is not a scheduled booking');
  }

  if (ridePreview.status !== 'requested' && ridePreview.status !== 'scheduled') {
    throw new ValidationError('Ride cannot be accepted in current status');
  }

  if (ridePreview.driver) {
    throw new ConflictError('Ride has already been accepted by another driver');
  }

  if (ridePreview.scheduledAt && ridePreview.scheduledAt < new Date()) {
    throw new ValidationError('Cannot accept past scheduled ride');
  }

  if (
    ridePreview.paymentMethod === 'card' &&
    String(ridePreview.paymentStatus || '').toLowerCase() === 'pending'
  ) {
    throw new ValidationError('This booking is awaiting card payment and cannot be accepted yet');
  }

  const rideVehicleTypeId =
    ridePreview.vehicleType?._id?.toString?.() || ridePreview.vehicleType?.toString?.();
  const driverVehicleTypeId = driver.vehicleDetails?.vehicleType?.toString?.();
  if (rideVehicleTypeId && driverVehicleTypeId && rideVehicleTypeId !== driverVehicleTypeId) {
    throw new ValidationError('Driver vehicle type does not match ride requirements');
  }

  const acceptedAt = new Date();
  const ride = await Ride.findOneAndUpdate(
    {
      _id: rideId,
      isScheduled: true,
      driver: null,
      status: { $in: ['requested', 'scheduled'] },
      scheduledAt: { $gte: new Date() },
    },
    {
      $set: {
        driver: driver._id,
        status: 'accepted',
        acceptedByDriver: true,
        acceptedAt,
      },
      $push: {
        statusHistory: {
          status: 'accepted',
          timestamp: acceptedAt,
          note: `Scheduled booking accepted by driver ${driver._id}`,
        },
      },
    },
    { new: true }
  )
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType');

  if (!ride) {
    const latest = await Ride.findById(rideId);
    if (latest?.driver) {
      throw new ConflictError('Ride has already been accepted by another driver');
    }
    if (latest?.scheduledAt && latest.scheduledAt < new Date()) {
      throw new ValidationError('Cannot accept past scheduled ride');
    }
    throw new ValidationError('Ride cannot be accepted in current status');
  }

  // Only take driver "off the market" once pickup time has started; future accepts stay available.
  const now = new Date();
  const pickupMs = ride.scheduledAt ? new Date(ride.scheduledAt).getTime() : 0;
  const pickupIsNowOrPast = !ride.scheduledAt || pickupMs <= now.getTime();
  if (pickupIsNowOrPast) {
    driver.isAvailable = false;
    await driver.save();
  }

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
      status: { $nin: ['cancelled', 'completed'] },
    };
  } else {
    // Get latest scheduled ride for rider
    filter = {
      rider: userId,
      isScheduled: true,
      scheduledAt: { $gte: new Date() }, // Only future scheduled rides
      status: { $nin: ['cancelled', 'completed'] },
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
 * Get single scheduled booking by id - GET /api/schedule/show/:id/booking
 */
export const getScheduledBookingById = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;

  const ride = await Ride.findById(id)
    .populate('rider', 'name phone profileImage rating')
    .populate({ path: 'driver', populate: { path: 'user', select: 'name phone profileImage' } })
    .populate('vehicleType');

  if (!ride) {
    throw new NotFoundError('Booking');
  }

  const isRider = ride.rider && ride.rider._id.toString() === userId.toString();
  const driver = await Driver.findOne({ user: userId });
  const isDriver = driver && ride.driver && ride.driver._id.toString() === driver._id.toString();
  if (!isRider && !isDriver) {
    throw new NotFoundError('Booking');
  }

  res.json({
    status: 'success',
    data: formatScheduledRideResponse(ride, !!isDriver),
  });
});

/**
 * Get closest scheduled booking - GET /api/schedule/closest/booking
 *
 * Query:
 * - (default) Open pool: future scheduled rides matching vehicle type, not yet assigned — for Bookings "Available".
 * - assigned_to_driver=true: future scheduled rides already accepted by this driver — for driver home dashboard only.
 */
export const getClosestScheduledBooking = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { latitude, longitude, assigned_to_driver: assignedToDriverRaw } = req.query;
  const assignedToDriver =
    assignedToDriverRaw === true ||
    assignedToDriverRaw === 'true' ||
    assignedToDriverRaw === '1';

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

  const unpaidCardGate = { $nor: [{ paymentMethod: 'card', paymentStatus: 'pending' }] };
  const rideFilter = assignedToDriver
    ? {
        driver: driver._id,
        isScheduled: true,
        scheduledAt: { $gte: new Date() },
        status: { $nin: ['cancelled', 'completed'] },
        ...unpaidCardGate,
      }
    : {
        vehicleType: driver.vehicleDetails.vehicleType,
        isScheduled: true,
        scheduledAt: { $gte: new Date() },
        status: { $in: ['requested', 'scheduled'] },
        driver: null,
        ...unpaidCardGate,
      };

  const scheduledRides = await Ride.find(rideFilter)
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ scheduledAt: 1 });

  if (scheduledRides.length === 0) {
    return res.json({
      status: 'success',
      data: {
        booking: null,
        message: assignedToDriver
          ? 'No accepted scheduled bookings'
          : 'No scheduled bookings available',
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
  let isDriver = false;
  if (ride.driver) {
    const driverDoc = await Driver.findOne({ user: userId }).select('_id').lean();
    const assignedId = ride.driver._id?.toString?.() ?? ride.driver?.toString?.();
    if (driverDoc?._id && assignedId && driverDoc._id.toString() === assignedId) {
      isDriver = true;
    }
  }

  if (!isRider && !isDriver && user.role !== 'admin') {
    throw new ValidationError('You do not have permission to cancel this booking');
  }

  // Check if ride can be cancelled
  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw new ValidationError(`Cannot cancel a ${ride.status} ride`);
  }

  const statusNorm = String(ride.status || '').toLowerCase().replace(/-/g, '_');
  if (statusNorm === 'in_progress' || statusNorm === 'started') {
    throw new ValidationError('Cannot cancel a ride that is already in progress.');
  }

  // Determine who cancelled
  const cancelledBy = isRider ? 'rider' : (isDriver ? 'driver' : 'admin');
  
  // Calculate cancellation fee (usually 0 for scheduled rides cancelled well in advance)
  const cancellationFee = 0; // No fee for scheduled bookings cancelled in advance
  const cancellationScenario = cancelledBy === 'driver' ? 'driverCancel' : 'beforeAccept';

  const riderId = ride.rider?._id ?? ride.rider;
  let driverUserId = ride.driver?.user?._id ?? ride.driver?.user ?? null;
  if (!driverUserId && ride.driver?._id) {
    const driverDoc = await Driver.findById(ride.driver._id).select('user').lean();
    driverUserId = driverDoc?.user ?? null;
  }

  const fareAmount = Number(ride?.fare?.totalFare || 0);
  const hasWalletHold = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${ride._id}`,
    type: 'hold',
  })
    .select('_id')
    .lean();
  const ps = String(ride.paymentStatus || '').toLowerCase();
  const isEscrowRide =
    String(ride.paymentMethod || '').toLowerCase() === 'wallet' &&
    (['held', 'charged'].includes(ps) || !!hasWalletHold) &&
    (fareAmount > 0 || !!hasWalletHold);

  if (isEscrowRide) {
    await processCancellation(ride._id, riderId, driverUserId, fareAmount, cancellationScenario);
  }

  const isChargedCard =
    String(ride.paymentMethod || '').toLowerCase() === 'card' &&
    ['held', 'charged'].includes(String(ride.paymentStatus || '').toLowerCase());
  if (isChargedCard) {
    try {
      const { refundChargedCardRideIfNeeded } = await import('./paymentController.js');
      await refundChargedCardRideIfNeeded(ride);
    } catch (refundErr) {
      logger.error(
        `Card refund failed for cancelled scheduled booking ${rideIdToCancel}: ${refundErr.message}`
      );
    }
  }

  // Cancel the ride using the Ride model method
  await ride.cancelRide(cancelledBy, reason, cancellationFee, isEscrowRide ? cancellationScenario : null);

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideIdToCancel)) {
    const timers = global.automationTimers.get(rideIdToCancel);
    timers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideIdToCancel);
  }

  // Assigned driver must return to the pool when the booking is cancelled (rider or driver).
  if (ride.driver) {
    const { restoreDriverAvailabilityAfterTrip } = await import('../services/driverAvailabilityService.js');
    await restoreDriverAvailabilityAfterTrip(ride.driver._id ?? ride.driver);
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
