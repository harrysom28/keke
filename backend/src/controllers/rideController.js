import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import VehicleType from '../models/VehicleType.js';
import { getAdminSettings } from '../utils/adminSettingsCache.js';
import User from '../models/User.js';
import { calculateDistance, calculateDuration, calculateFare } from '../utils/geolocation.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import rideMatchingService from '../services/rideMatchingService.js';
import surgePricingService from '../services/surgePricingService.js';
import {
  offerRideToDrivers,
  notifyNoDriverFound,
  cancelUnacceptedRide,
} from '../services/driverNotificationService.js';
import { mapRideStatusForClientApi, getLifecycleStatus, logRideLifecycle } from '../utils/rideStatus.js';
import { getSocketService } from '../services/socketService.js';
import { calculateFareBreakdown as calculateFareBreakdownFromSettings } from '../services/settingsService.js';
import {
  validateRiderBalance,
  holdRideFunds,
  chargeServiceFee,
  settleRide,
  processCancellation,
  EscrowWalletError,
} from '../services/escrowWalletService.js';

const normalizeRideCurrency = (currency) => {
  const normalized = String(currency || 'NGN').toUpperCase();
  return normalized === 'USD' ? 'NGN' : normalized;
};

/**
 * Request ride - matches mobile app endpoint /api/booking/request-ride
 */
export const requestRide = asyncHandler(async (req, res) => {
  const { pickupLocation, dropoffLocation, vehicleTypeId, paymentMethod, promoCode, scheduledAt } = req.body;
  const riderId = req.user._id;

  // Log received location data for debugging
  logger.info('📍 Ride request received:', {
    pickupLocation: {
      lat: pickupLocation?.lat,
      lng: pickupLocation?.lng,
      name: pickupLocation?.name,
      address: pickupLocation?.address,
      type: typeof pickupLocation?.lat,
    },
    dropoffLocation: {
      lat: dropoffLocation?.lat,
      lng: dropoffLocation?.lng,
      name: dropoffLocation?.name,
      address: dropoffLocation?.address,
      type: typeof dropoffLocation?.lat,
    },
    vehicleTypeId,
  });

  // Validate and normalize location data
  if (!pickupLocation || !pickupLocation.lat || !pickupLocation.lng) {
    logger.error('❌ Invalid pickup location:', pickupLocation);
    throw new ValidationError('Pickup location is required with valid latitude and longitude');
  }

  if (!dropoffLocation || !dropoffLocation.lat || !dropoffLocation.lng) {
    logger.error('❌ Invalid dropoff location:', dropoffLocation);
    throw new ValidationError('Dropoff location is required with valid latitude and longitude');
  }

  // Normalize coordinates to numbers
  const normalizedPickupLat = typeof pickupLocation.lat === 'string' ? parseFloat(pickupLocation.lat) : pickupLocation.lat;
  const normalizedPickupLng = typeof pickupLocation.lng === 'string' ? parseFloat(pickupLocation.lng) : pickupLocation.lng;
  const normalizedDropoffLat = typeof dropoffLocation.lat === 'string' ? parseFloat(dropoffLocation.lat) : dropoffLocation.lat;
  const normalizedDropoffLng = typeof dropoffLocation.lng === 'string' ? parseFloat(dropoffLocation.lng) : dropoffLocation.lng;

  // Validate coordinates are valid numbers
  if (isNaN(normalizedPickupLat) || isNaN(normalizedPickupLng) || isNaN(normalizedDropoffLat) || isNaN(normalizedDropoffLng)) {
    logger.error('❌ Invalid coordinate values:', {
      pickupLat: normalizedPickupLat,
      pickupLng: normalizedPickupLng,
      dropoffLat: normalizedDropoffLat,
      dropoffLng: normalizedDropoffLng,
    });
    throw new ValidationError('Invalid location coordinates. Please ensure latitude and longitude are valid numbers.');
  }

  // Validate coordinate ranges
  if (normalizedPickupLat < -90 || normalizedPickupLat > 90 || normalizedPickupLng < -180 || normalizedPickupLng > 180 ||
      normalizedDropoffLat < -90 || normalizedDropoffLat > 90 || normalizedDropoffLng < -180 || normalizedDropoffLng > 180) {
    logger.error('❌ Coordinates out of valid range:', {
      pickupLat: normalizedPickupLat,
      pickupLng: normalizedPickupLng,
      dropoffLat: normalizedDropoffLat,
      dropoffLng: normalizedDropoffLng,
    });
    throw new ValidationError('Location coordinates are out of valid range');
  }

  logger.info('✅ Validated locations:', {
    pickup: { lat: normalizedPickupLat, lng: normalizedPickupLng, name: pickupLocation.name, address: pickupLocation.address },
    dropoff: { lat: normalizedDropoffLat, lng: normalizedDropoffLng, name: dropoffLocation.name, address: dropoffLocation.address },
  });

  const [activeRide, vehicleType, settings] = await Promise.all([
    Ride.findActiveRideForRider(riderId),
    VehicleType.findById(vehicleTypeId),
    getAdminSettings(),
  ]);

  // Check if rider has active ride
  if (activeRide) {
    throw new ConflictError('You already have an active ride');
  }

  // Validate scheduled time is in the future
  if (scheduledAt) {
    const scheduledTime = new Date(scheduledAt);
    if (isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
      throw new ValidationError('Scheduled time must be a valid future date and time');
    }
  }

  // Validate vehicle type
  if (!vehicleType || !vehicleType.isActive) {
    throw new NotFoundError('Vehicle type');
  }

  // Calculate distance and duration using normalized coordinates
  const distanceKm = calculateDistance(
    normalizedPickupLat,
    normalizedPickupLng,
    normalizedDropoffLat,
    normalizedDropoffLng
  );
  
  logger.info('📏 Calculated distance:', { distanceKm, unit: 'km' });

  const durationMinutes = calculateDuration(distanceKm);

  // Fetch admin pricing settings for KEKE fare formula (Redis-backed when available)
  const pricing = settings?.pricing ? { ...settings.pricing } : null;

  const fareBreakdown = calculateFare(distanceKm, durationMinutes, vehicleTypeId, pricing);

  const surgePricing = await surgePricingService.calculateSurgeMultiplier();

  // Apply surge pricing to fare
  const fareWithSurge = surgePricingService.applySurgePricing(
    fareBreakdown.totalFare,
    surgePricing.multiplier
  );

  const totalFare = fareWithSurge.finalFare;
  const isWalletPayment = paymentMethod === 'wallet';
  let escrowBreakdown = null;
  if (isWalletPayment) {
    try {
      const validated = await validateRiderBalance(riderId, totalFare);
      escrowBreakdown = validated.breakdown;
    } catch (err) {
      if (err.name === 'EscrowWalletError') throw err;
      throw new ValidationError(err.message || 'Wallet validation failed');
    }
  }

  // Create ride request with normalized coordinates
  const rideData = {
    rider: riderId,
    vehicleType: vehicleTypeId,
    pickupLocation: {
      type: 'Point',
      coordinates: [normalizedPickupLng, normalizedPickupLat], // GeoJSON format: [longitude, latitude]
      address: pickupLocation.address || pickupLocation.name || '',
      name: pickupLocation.name || pickupLocation.address || '',
    },
    dropoffLocation: {
      type: 'Point',
      coordinates: [normalizedDropoffLng, normalizedDropoffLat], // GeoJSON format: [longitude, latitude]
      address: dropoffLocation.address || dropoffLocation.name || '',
      name: dropoffLocation.name || dropoffLocation.address || '',
    },
    status: scheduledAt ? 'scheduled' : 'searching',
    isScheduled: !!scheduledAt,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    fare: {
      baseFare: fareBreakdown.baseFare,
      distanceFare: fareBreakdown.distanceFare,
      timeFare: fareBreakdown.timeFare,
      surgeMultiplier: fareWithSurge.surgeMultiplier,
      totalFare,
      ...(escrowBreakdown && {
        riderServiceCharge: escrowBreakdown.riderServiceCharge,
        platformRevenue: escrowBreakdown.platformFee,
        driverNetAmount: escrowBreakdown.driverEarning,
      }),
    },
    ...(isWalletPayment && { paymentStatus: 'held' }),
    distance: {
      value: distanceKm,
      unit: 'km',
    },
    duration: {
      estimated: durationMinutes,
      unit: 'minutes',
    },
    paymentMethod,
    promoCode: promoCode || null,
    statusHistory: [{
      status: scheduledAt ? 'scheduled' : 'searching',
      timestamp: new Date(),
      note: scheduledAt ? 'Ride scheduled' : 'Ride searching for driver',
    }],
  };

  const ride = await Ride.create(rideData);
  logRideLifecycle(logger, ride, { event: 'ride_created' });
  if (isWalletPayment) {
    try {
      await holdRideFunds(riderId, ride._id, totalFare);
    } catch (err) {
      await Ride.deleteOne({ _id: ride._id });
      if (err.name === 'EscrowWalletError') throw err;
      throw new ValidationError(err.message || 'Failed to hold fare');
    }
  }
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType', 'name displayName image');

  // Find and match drivers using ride matching algorithm
  const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, 10, 5);
  
  logger.info(`Found ${matchedDrivers.length} matched drivers for ride ${ride._id}`);

  if (matchedDrivers.length > 0) {
    const notifiedIds = matchedDrivers
      .map((m) => m.driver?._id || m.driver)
      .filter(Boolean);
    await Ride.findByIdAndUpdate(ride._id, { $set: { notifiedDriverIds: notifiedIds } });
    ride.notifiedDriverIds = notifiedIds;
  }

  // Sequential driver offers (FCM + Pusher + Socket.io), background — instant HTTP response for rider
  if (!ride.isScheduled && (ride.status === 'searching' || ride.status === 'requested')) {
    if (matchedDrivers.length > 0) {
      setImmediate(() => {
        (async () => {
          try {
            const assignedDriverId = await offerRideToDrivers(ride, matchedDrivers);
            if (!assignedDriverId) {
              const fresh = await Ride.findById(ride._id).populate('rider');
              if (fresh && (fresh.status === 'searching' || fresh.status === 'requested') && !fresh.driver) {
                await cancelUnacceptedRide(fresh._id);
                const after = await Ride.findById(ride._id).populate('rider');
                if (after) await notifyNoDriverFound(after);
              }
            }
          } catch (err) {
            logger.error(`offerRideToDrivers error for ride ${ride._id}: ${err.message}`);
          }
        })();
      });
    } else {
      logger.warn(`No matched drivers for ride ${ride._id}`);
      setImmediate(() => {
        notifyNoDriverFound(ride).catch((err) =>
          logger.error(`notifyNoDriverFound failed: ${err.message}`)
        );
      });
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Ride requested successfully',
    data: {
      ride: formatRideResponse(ride),
      surge_pricing: {
        multiplier: surgePricing.multiplier,
        is_surged: surgePricing.isSurged,
        reason: surgePricing.reason,
      },
      drivers_notified: matchedDrivers.length,
    },
  });
});

/**
 * Get fare estimate - matches mobile app endpoint /api/booking/destination-details
 */
export const getFareEstimate = asyncHandler(async (req, res) => {
  const { pickupLocation, dropoffLocation, vehicleTypeId } = req.query;

  if (!pickupLocation || !dropoffLocation || !vehicleTypeId) {
    throw new ValidationError('Pickup location, dropoff location, and vehicle type are required');
  }

  const pickup = JSON.parse(pickupLocation);
  const dropoff = JSON.parse(dropoffLocation);

  // Calculate distance and duration
  const distanceKm = calculateDistance(
    pickup.lat,
    pickup.lng,
    dropoff.lat,
    dropoff.lng
  );

  const durationMinutes = calculateDuration(distanceKm);

  const settings = await getAdminSettings();
  const pricing = settings?.pricing ? { ...settings.pricing } : null;

  const fareBreakdown = calculateFare(distanceKm, durationMinutes, vehicleTypeId, pricing);

  const surgePricing = await surgePricingService.calculateSurgeMultiplier();

  const fareWithSurge = surgePricingService.applySurgePricing(
    fareBreakdown.totalFare,
    surgePricing.multiplier
  );

  const fareAmount = Math.round(Number(fareWithSurge.finalFare || 0));
  const riderBreakdown = await calculateFareBreakdownFromSettings(fareAmount);

  res.json({
    status: 'success',
    data: {
      distance: {
        value: distanceKm,
        unit: 'km',
        text: `${distanceKm.toFixed(2)} km`,
      },
      duration: {
        value: durationMinutes,
        unit: 'minutes',
        text: `${durationMinutes} min`,
      },
      fare: {
        baseFare: fareBreakdown.baseFare,
        distanceFare: fareBreakdown.distanceFare,
        timeFare: fareBreakdown.timeFare,
        minimumFare: fareBreakdown.minimumFare,
        preSurgeFare: fareBreakdown.totalFare,
        totalFare: fareAmount,
        surgeMultiplier: surgePricing.multiplier,
        isSurged: surgePricing.isSurged,
        surgeReason: surgePricing.reason,
        currency: fareBreakdown.currency || 'NGN',
        riderServiceCharge: riderBreakdown.riderServiceCharge,
        riderTotal: riderBreakdown.riderTotal,
      },
      cost: String(fareAmount),
    },
  });
});

/**
 * Fare estimate preview (Keke default) - GET /api/rides/fare-estimate
 * Query: originLat, originLng, destLat, destLng
 * Response shape matches mobile booking sheet preview requirements.
 */
export const getFareEstimatePreview = asyncHandler(async (req, res) => {
  const { originLat, originLng, destLat, destLng } = req.query;

  const oLat = parseFloat(originLat);
  const oLng = parseFloat(originLng);
  const dLat = parseFloat(destLat);
  const dLng = parseFloat(destLng);

  if ([oLat, oLng, dLat, dLng].some((n) => Number.isNaN(n))) {
    throw new ValidationError('originLat, originLng, destLat, destLng must be valid numbers');
  }

  let vehicleType = await VehicleType.findOne({
    isActive: true,
    $or: [
      { name: { $regex: /keke/i } },
      { displayName: { $regex: /keke/i } },
    ],
  })
    .select('_id')
    .lean();

  if (!vehicleType?._id) {
    vehicleType = await VehicleType.findOne({ isActive: true }).select('_id').lean();
  }

  if (!vehicleType?._id) {
    throw new ValidationError('No active vehicle type is configured');
  }

  const distanceKm = calculateDistance(oLat, oLng, dLat, dLng);
  const estimatedMins = calculateDuration(distanceKm);

  const settings = await getAdminSettings();
  const pricing = settings?.pricing ? { ...settings.pricing } : null;

  const fareBreakdown = calculateFare(distanceKm, estimatedMins, vehicleType._id, pricing);
  const surgePricing = await surgePricingService.calculateSurgeMultiplier();
  const fareWithSurge = surgePricingService.applySurgePricing(
    fareBreakdown.totalFare,
    surgePricing.multiplier
  );

  const fareAmount = Math.round(Number(fareWithSurge.finalFare || 0));
  const breakdown = await calculateFareBreakdownFromSettings(fareAmount);

  const formatNgn = (n) => `₦${Number(n || 0).toLocaleString()}`;

  res.json({
    status: 'success',
    data: {
      fareAmount: breakdown.fareAmount,
      riderServiceCharge: breakdown.riderServiceCharge,
      riderTotal: breakdown.riderTotal,
      distanceKm: Number(distanceKm.toFixed(1)),
      estimatedMins,
      display: {
        'Ride fare': formatNgn(breakdown.fareAmount),
        'Service charge': formatNgn(breakdown.riderServiceCharge),
        Total: formatNgn(breakdown.riderTotal),
      },
    },
  });
});

/**
 * Get active ride for rider - matches /api/booking/active-ride
 */
export const getActiveRide = asyncHandler(async (req, res) => {
  // findActiveRideForRider already includes populate, so we don't need to call it again
  const ride = await Ride.findActiveRideForRider(req.user._id);

  if (!ride) {
    return res.json({
      status: 'success',
      data: {
        ride: null,
      },
    });
  }

  res.json({
    status: 'success',
    data: {
      ride: formatRideResponse(ride),
    },
  });
});

/**
 * Get active ride for driver - matches /api/booking/driver/active-ride
 */
export const getDriverActiveRide = asyncHandler(async (req, res) => {
  // Get driver
  const driver = await Driver.findOne({ user: req.user._id });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {},
    });
  }

  const ride = await Ride.findActiveRideForDriver(driver._id);

  if (!ride) {
    return res.json({
      status: 'success',
      data: {},
    });
  }

  res.json({
    status: 'success',
    data: {
      ride: formatDriverRideResponse(ride),
    },
  });
});

/**
 * Find nearby drivers - matches /api/booking/find-driver
 */
export const findNearbyDrivers = asyncHandler(async (req, res) => {
  const { loc_lat, loc_long, vehicleTypeId } = req.query;

  if (!loc_lat || !loc_long) {
    throw new ValidationError('Location latitude and longitude are required');
  }

  const latitude = parseFloat(loc_lat);
  const longitude = parseFloat(loc_long);

  if (isNaN(latitude) || isNaN(longitude)) {
    throw new ValidationError('Invalid location coordinates');
  }

  // Find nearby available drivers (increased radius to 15km for better coverage)
  const nearbyDrivers = await Driver.findNearbyAvailable(
    latitude,
    longitude,
    15 // 15km radius (increased from 10km)
  );

  logger.info(`Found ${nearbyDrivers.length} nearby available drivers at (${latitude}, ${longitude})`);

  if (process.env.DEBUG_DRIVER_STATS === 'true') {
    // Debug: Check total drivers in database with different criteria
    const totalDrivers = await Driver.countDocuments({});
    const onlineDrivers = await Driver.countDocuments({ isOnline: true });
    const availableDrivers = await Driver.countDocuments({ isOnline: true, isAvailable: true });
    const verifiedDrivers = await Driver.countDocuments({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
    });
    const approvedDrivers = await Driver.countDocuments({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
    });
    const withLocation = await Driver.countDocuments({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
      currentLocation: { $exists: true, $ne: null },
    });

    logger.info(
      `Driver statistics: Total=${totalDrivers}, Online=${onlineDrivers}, Available=${availableDrivers}, Verified=${verifiedDrivers}, Approved=${approvedDrivers}, WithLocation=${withLocation}`
    );
  }

  // Filter by vehicle type if provided
  let matchingDrivers = nearbyDrivers;
  if (vehicleTypeId) {
    const beforeFilter = matchingDrivers.length;
    matchingDrivers = nearbyDrivers.filter(
      (driver) => driver.vehicleDetails?.vehicleType?._id?.toString() === vehicleTypeId.toString() ||
                  driver.vehicleDetails?.vehicleType?.toString() === vehicleTypeId.toString()
    );
    logger.info(`Filtered by vehicle type ${vehicleTypeId}: ${beforeFilter} -> ${matchingDrivers.length} drivers`);
  }

  // Format drivers for response
  const formattedDrivers = matchingDrivers.map((driver) => {
    const [lng, lat] = driver.currentLocation.coordinates;
    const distance = calculateDistance(latitude, longitude, lat, lng);

    return {
      driver_id: driver._id.toString(),
      user_id: driver.user?._id?.toString(),
      name: driver.user?.name || 'Driver',
      phone: driver.user?.phone || '',
      profile_image: driver.user?.profileImage || '',
      rating: driver.rating?.average || 0,
      vehicle_type: driver.vehicleDetails?.vehicleType?._id?.toString() || null,
      vehicle_type_name: driver.vehicleDetails?.vehicleType?.name || driver.vehicleDetails?.name || '',
      vehicle_image: driver.vehicleDetails?.vehicleImage || '',
      vehicle_number: driver.vehicleDetails?.plateNumber || '',
      location: {
        lat: lat,
        long: lng,
        address: driver.currentLocation.address || '',
      },
      distance: parseFloat(distance.toFixed(2)),
      is_available: driver.isAvailable,
      is_online: driver.isOnline,
    };
  });

  // Sort by distance (closest first)
  formattedDrivers.sort((a, b) => a.distance - b.distance);

  res.json({
    status: 'success',
    data: {
      drivers: formattedDrivers,
      count: formattedDrivers.length,
    },
  });
});

/**
 * Cancel ride - matches /api/booking/cancel-ride
 */
export const cancelRide = asyncHandler(async (req, res) => {
  const { rideId, reason } = req.body;
  const userId = req.user._id;

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate('driver');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if user has permission to cancel
  if (ride.rider._id.toString() !== userId.toString() && ride.driver?.user?.toString() !== userId.toString()) {
    throw new ValidationError('You do not have permission to cancel this ride');
  }

  // Check if ride can be cancelled
  if (['completed', 'cancelled'].includes(ride.status)) {
    throw new ValidationError('Ride cannot be cancelled');
  }

  // Determine who is cancelling
  const cancelledBy = ride.rider._id.toString() === userId.toString() ? 'rider' : 'driver';

  const riderId = ride.rider?._id ?? ride.rider;
  let driverUserId = ride.driver?.user?._id ?? ride.driver?.user ?? null;
  if (!driverUserId && ride.driver) {
    const driverDoc = await Driver.findById(ride.driver._id ?? ride.driver).select('user').lean();
    driverUserId = driverDoc?.user ?? null;
  }
  const fareAmount = ride.fare?.totalFare ?? 0;
  const hasWalletHold = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${ride._id}`,
    type: 'hold',
  })
    .select('_id')
    .lean();
  // Wallet rides: release escrow when a hold exists even if paymentStatus was not persisted correctly.
  const isEscrow =
    ride.paymentMethod === 'wallet' &&
    (['held', 'charged'].includes(ride.paymentStatus) || !!hasWalletHold);
  const previousRideStatus = ride.status;

  let cancellationFee = 0;
  let cancellationScenario = null;
  let driverCompensation = 0;

  if (isEscrow && (fareAmount > 0 || !!hasWalletHold)) {
    if (cancelledBy === 'driver') {
      cancellationScenario = 'driverCancel';
    } else if (['requested', 'searching', 'scheduled'].includes(ride.status)) {
      cancellationScenario = 'beforeAccept';
    } else if (ride.status === 'accepted' || ride.status === 'driver_en_route') {
      const { getCancellationGuards } = await import('../services/settingsService.js');
      const { gracePeriodSeconds } = await getCancellationGuards();
      const minutesSinceAccepted = ride.acceptedAt
        ? (Date.now() - new Date(ride.acceptedAt).getTime()) / 60000
        : 999;
      const withinGracePeriod = minutesSinceAccepted * 60 <= (gracePeriodSeconds ?? 60);
      const driverNotMoving = ride.driverMovementFlag === 'not_approaching';
      cancellationScenario = withinGracePeriod || driverNotMoving ? 'beforeAccept' : 'afterAccept';
    } else {
      cancellationScenario = 'afterArrival';
    }
    const { getCancellationPolicy } = await import('../services/settingsService.js');
    const policy = await getCancellationPolicy(cancellationScenario);
    cancellationFee = policy.riderPenalty ?? 0;
    driverCompensation = policy.driverPayout ?? 0;
    try {
      await processCancellation(ride._id, riderId, driverUserId, fareAmount, cancellationScenario);
    } catch (err) {
      logger.error(`Escrow cancellation failed for ride ${rideId}: ${err.message}`);
      throw new ValidationError(err.message || 'Cancellation failed');
    }
  } else {
    const { calculateCancellationFee } = await import('../utils/cancellationFeeCalculator.js');
    const result = calculateCancellationFee(ride, cancelledBy);
    cancellationFee = result.cancellationFee;
    if (cancelledBy === 'rider' && ['accepted', 'driver_en_route', 'arrived'].includes(ride.status)) {
      try {
        const { getCancellationPolicy } = await import('../services/settingsService.js');
        const fallbackScenario = ride.status === 'arrived' ? 'afterArrival' : 'afterAccept';
        const policy = await getCancellationPolicy(fallbackScenario);
        driverCompensation = policy.driverPayout ?? cancellationFee;
      } catch {
        driverCompensation = cancellationFee;
      }
    }
  }

  // Cancel ride
  await ride.cancelRide(cancelledBy, reason, cancellationFee, cancellationScenario);

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideId)) {
    const timers = global.automationTimers.get(rideId);
    timers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideId);
    logger.info(`🧹 Cancelled automation timers for cancelled ride ${rideId}`);
  }

  // Update driver availability if driver cancelled
  if (cancelledBy === 'driver' && ride.driver) {
    const driver = await Driver.findById(ride.driver);
    if (driver) {
      driver.isAvailable = true;
      await driver.save();
    }

    // Find alternative driver if rider cancelled after driver accepted
    if (ride.status === 'accepted') {
      const alternativeDriver = await rideMatchingService.findAlternativeDriver(
        ride,
        ride.driver._id
      );
      if (alternativeDriver) {
        // Reassign ride to alternative driver
        ride.driver = alternativeDriver._id;
        ride.status = 'accepted';
        ride.acceptedByDriver = true;
        ride.acceptedAt = new Date();
        ride.statusHistory.push({
          status: 'accepted',
          timestamp: new Date(),
          note: `Reassigned to alternative driver ${alternativeDriver._id}`,
        });
        await ride.save();

        const socketService = getSocketService();
        if (socketService) {
          socketService.emitRideAccepted(ride, alternativeDriver);
          socketService.emitRideStatusUpdate(ride, 'accepted', alternativeDriver);
        }
      }
    }
  }

  // Send notifications via Socket.io
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideCancelled(ride, cancelledBy, reason);
  }

  try {
    const { sendToUser } = await import('../services/notificationService.js');
    if (cancelledBy === 'driver') {
      await sendToUser(riderId, 'rider', {
        title: 'Driver cancelled',
        message: 'Your driver cancelled the ride. We are finding you a new driver.',
        type: 'alert',
        priority: 'high',
        screen: 'home',
        ride_id: ride._id,
        event_key: 'ride_cancelled_by_driver',
        data: { subType: 'driver_cancelled', rideId: ride._id.toString() },
      });
    }

    if (
      cancelledBy === 'rider' &&
      driverUserId &&
      ['accepted', 'driver_en_route', 'arrived', 'in-progress'].includes(previousRideStatus)
    ) {
      await sendToUser(driverUserId, 'driver', {
        title: 'Rider cancelled',
        message: `${ride.rider?.name || 'The rider'} cancelled the ride. You will receive your ₦${Math.round(Number(driverCompensation || 0)).toLocaleString()} compensation.`,
        type: 'alert',
        priority: 'normal',
        screen: 'home',
        ride_id: ride._id,
        event_key: 'ride_cancelled_by_rider',
        data: { subType: 'passenger_cancelled', rideId: ride._id.toString() },
      });
    }
  } catch (err) {
    logger.error(`Ride cancellation notification failed for ride ${rideId}: ${err.message}`);
  }

  // Process refunds if applicable (only for rider cancellations with fees)
  if (cancelledBy === 'rider' && ride.paymentStatus === 'completed') {
    try {
      const { processRideRefund } = await import('../services/refundService.js');
      await processRideRefund(ride, cancellationFee);
      logger.info(`Refund processed for cancelled ride ${rideId} (fee: ${cancellationFee})`);
    } catch (error) {
      logger.error(`Refund processing failed for ride ${rideId}: ${error.message}`);
      // Don't fail cancellation if refund processing fails
    }
  }

  res.json({
    status: 'success',
    message: 'Ride cancelled successfully',
    data: {
      ride: formatRideResponse(ride),
    },
  });
});

/**
 * GET /api/booking/cancel-ride/preview?rideId= — rider-only fee estimate before cancelling.
 */
export const cancelRidePreview = asyncHandler(async (req, res) => {
  const { rideId } = req.query;
  const userId = req.user._id;

  const ride = await Ride.findById(rideId).populate('rider').populate('driver');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.rider._id.toString() !== userId.toString()) {
    throw new ValidationError('You do not have permission to preview this cancellation');
  }

  if (['completed', 'cancelled'].includes(ride.status)) {
    return res.json({
      status: 'success',
      data: {
        fee_applies: false,
        fee_amount: 0,
        fee_reason: null,
      },
    });
  }

  const fareAmount = ride.fare?.totalFare ?? 0;
  const hasWalletHold = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${ride._id}`,
    type: 'hold',
  })
    .select('_id')
    .lean();

  const isEscrow =
    ride.paymentMethod === 'wallet' &&
    (['held', 'charged'].includes(ride.paymentStatus) || !!hasWalletHold);

  let feeAmount = 0;
  let feeReason = null;

  if (isEscrow && (fareAmount > 0 || !!hasWalletHold)) {
    let cancellationScenario;
    if (['requested', 'searching', 'scheduled'].includes(ride.status)) {
      cancellationScenario = 'beforeAccept';
    } else if (ride.status === 'accepted' || ride.status === 'driver_en_route') {
      const { getCancellationGuards } = await import('../services/settingsService.js');
      const { gracePeriodSeconds } = await getCancellationGuards();
      const minutesSinceAccepted = ride.acceptedAt
        ? (Date.now() - new Date(ride.acceptedAt).getTime()) / 60000
        : 999;
      const withinGracePeriod = minutesSinceAccepted * 60 <= (gracePeriodSeconds ?? 60);
      const driverNotMoving = ride.driverMovementFlag === 'not_approaching';
      cancellationScenario = withinGracePeriod || driverNotMoving ? 'beforeAccept' : 'afterAccept';
    } else {
      cancellationScenario = 'afterArrival';
    }
    const { getCancellationPolicy } = await import('../services/settingsService.js');
    const policy = await getCancellationPolicy(cancellationScenario);
    feeAmount = policy.riderPenalty ?? 0;
    if (feeAmount > 0) {
      if (cancellationScenario === 'afterAccept') {
        feeReason = 'Driver has already accepted and is on the way';
      } else if (cancellationScenario === 'afterArrival') {
        feeReason = 'Driver has arrived at your pickup location';
      }
    }
  } else {
    const { calculateCancellationFee } = await import('../utils/cancellationFeeCalculator.js');
    const result = calculateCancellationFee(ride, 'rider');
    feeAmount = result.cancellationFee ?? 0;
    feeReason = feeAmount > 0 ? result.feeReason || 'A cancellation fee applies' : null;
  }

  res.json({
    status: 'success',
    data: {
      fee_applies: feeAmount > 0,
      fee_amount: feeAmount,
      fee_reason: feeReason,
    },
  });
});

/**
 * Get ride history - matches /api/booking/history
 * Returns rides for the current user as rider or driver based on role.
 */
export const getRideHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const userId = req.user._id;
  const role = req.user.role;
  const skip = (page - 1) * limit;

  let filter = {};
  if (role === 'driver') {
    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      return res.json({
        status: 'success',
        data: { rides: [], pagination: { page: parseInt(page), limit: parseInt(limit), total: 0, pages: 0 } },
      });
    }
    filter.driver = driver._id;
  } else {
    filter.rider = userId;
  }

  if (status) {
    filter.status = status;
  }

  const rides = await Ride.find(filter)
    .populate('driver', 'user vehicleDetails currentLocation')
    .populate('driver.user', 'name phone profileImage rating')
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      rides: rides.map(ride => formatRideResponse(ride)),
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
 * Get ride details (user-facing) - GET /api/booking/rides/:rideId
 * Returns ride info and fare breakdown by user type (rider vs driver).
 */
export const getRideDetails = asyncHandler(async (req, res) => {
  const { rideId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  const ride = await Ride.findById(rideId)
    .populate('rider', 'name phone profileImage email')
    .populate({
      path: 'driver',
      populate: { path: 'user', select: 'name phone profileImage' },
    })
    .populate('vehicleType', 'name displayName');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  const isRider = ride.rider._id.toString() === userId.toString();
  const isDriver = ride.driver && ride.driver.user?._id?.toString() === userId.toString();

  if (!isRider && !isDriver) {
    throw new NotFoundError('Ride');
  }

  const base = {
    ride_id: ride._id.toString(),
    status: ride.status,
    origin: {
      name: ride.pickupLocation.name || null,
      address: ride.pickupLocation.address || '',
      lat: ride.pickupLocation.coordinates?.[1],
      lng: ride.pickupLocation.coordinates?.[0],
    },
    destination: {
      name: ride.dropoffLocation.name || null,
      address: ride.dropoffLocation.address || '',
      lat: ride.dropoffLocation.coordinates?.[1],
      lng: ride.dropoffLocation.coordinates?.[0],
    },
    date: ride.createdAt,
    scheduled_at: ride.scheduledAt || null,
    distance_km: ride.distance?.value || 0,
    duration_min: ride.duration?.estimated || ride.duration?.actual || 0,
    payment_method: ride.paymentMethod,
    payment_status: ride.paymentStatus,
  };

  if (isRider) {
    const fare = ride.fare?.totalFare ?? 0;
    const serviceCharge = ride.fare?.riderServiceCharge ?? 0;
    base.fare_breakdown = {
      ride_fare: fare,
      service_charge: serviceCharge,
      total_paid: fare + serviceCharge,
      currency: normalizeRideCurrency(ride.fare?.currency),
    };
    base.driver = ride.driver
      ? {
          name: ride.driver.user?.name || null,
          phone: ride.driver.user?.phone || null,
          image: ride.driver.user?.profileImage || null,
          vehicle_name: ride.driver.vehicleDetails?.make && ride.driver.vehicleDetails?.model
            ? `${ride.driver.vehicleDetails.make} ${ride.driver.vehicleDetails.model}`
            : ride.vehicleType?.name || null,
          vehicle_plate: ride.driver.vehicleDetails?.plateNumber || null,
        }
      : null;
  } else {
    const gross = ride.fare?.totalFare ?? 0;
    const platformFee = ride.fare?.commissionAmount ?? 0;
    const net = ride.fare?.driverNetAmount ?? gross - platformFee;
    base.earnings_breakdown = {
      gross,
      platform_fee: platformFee,
      net,
      currency: normalizeRideCurrency(ride.fare?.currency),
    };
    base.rider = ride.rider
      ? { name: ride.rider.name || null, phone: ride.rider.phone || null }
      : null;
  }

  res.json({
    status: 'success',
    data: { ride: base },
  });
});

/**
 * Format ride response for mobile app compatibility
 */
const formatRideResponse = (ride) => {
  const internalStatus = ride.status;
  const clientStatus = mapRideStatusForClientApi(internalStatus);
  return {
    ride_id: ride._id.toString(),
    user_id: ride.rider._id?.toString() || ride.rider.toString(),
    driver_id: ride.driver?._id?.toString() || null,
    driver: ride.driver ? {
      driver_id: ride.driver._id?.toString(),
      driver_user_id: ride.driver.user?._id?.toString() || ride.driver.user?.toString(),
      user_id: ride.driver.user?._id?.toString() || ride.driver.user?.toString(),
      driver_name: ride.driver.user?.name || null,
      name: ride.driver.user?.name || null,
      phone: ride.driver.user?.phone || null,
      driver_image: ride.driver.user?.profileImage || null,
      image: ride.driver.user?.profileImage || null,
      driver_rating: ride.driver.rating?.average || ride.driver.user?.rating || 0,
      rating: ride.driver.rating?.average || ride.driver.user?.rating || 0,
      driver_review_count: ride.driver.rating?.count || 0,
      vehicle_image: ride.driver.vehicleImages?.[0]?.url || ride.driver.vehicleDetails?.vehicleImage || null,
      vehicle_name: ride.driver.vehicleDetails?.make && ride.driver.vehicleDetails?.model
        ? `${ride.driver.vehicleDetails.make} ${ride.driver.vehicleDetails.model}`
        : (ride.driver.vehicleDetails?.make || ride.driver.vehicleDetails?.model || null),
      vehicle_color: ride.driver.vehicleDetails?.color || null,
      licence_plate_number: ride.driver.vehicleDetails?.plateNumber || null,
      vehicle_type: ride.vehicleType?.name || ride.vehicleType?.displayName || null,
      // Additional vehicle details for verification
      vehicle_make: ride.driver.vehicleDetails?.make || null,
      vehicle_model: ride.driver.vehicleDetails?.model || null,
    } : null,
    vehicle_id: ride.vehicleType?._id?.toString() || ride.vehicleType?.toString(),
    status: clientStatus,
    internal_status: internalStatus,
    lifecycle_status: getLifecycleStatus(internalStatus),
    accepted_by_driver: ride.acceptedByDriver,
    is_ride_started: ride.isRideStarted,
    drop_off_completed: ride.dropOffCompleted,
    origin: {
      lat: ride.pickupLocation.coordinates[1].toString(),
      long: ride.pickupLocation.coordinates[0].toString(),
      name: ride.pickupLocation.name || null, // Return null if name is missing, don't fallback to address
      address: ride.pickupLocation.address || '', // Always return address
    },
    destination: {
      lat: ride.dropoffLocation.coordinates[1].toString(),
      long: ride.dropoffLocation.coordinates[0].toString(),
      name: ride.dropoffLocation.name || null, // Return null if name is missing, don't fallback to address
      address: ride.dropoffLocation.address || '', // Always return address
    },
    cost: ride.fare.totalFare.toString(),
    payment_type: ride.paymentMethod,
    payment_status: ride.paymentStatus,
    arrival_distance: ride.arrivalDistance?.toString() || null,
    arrival_time: ride.arrivalTime?.toString() || null,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    scheduled_at: ride.scheduledAt ? ride.scheduledAt.toISOString() : null, // Include scheduled time
    is_scheduled: ride.isScheduled || false, // Include scheduled flag
    createdAt: ride.createdAt,
    updatedAt: ride.updatedAt,
  };
};

/**
 * Get driver location for ride - GET /api/ride/driver-location
 */
export const getDriverLocation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.query;

  if (!rideId) {
    throw new ValidationError('Ride ID is required');
  }

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate('driver');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if user is part of this ride
  if (ride.rider._id.toString() !== userId.toString() && ride.driver?.user?.toString() !== userId.toString()) {
    throw new ValidationError('You are not authorized to view driver location for this ride');
  }

  const driver = ride.driver;
  if (!driver || !driver.currentLocation) {
    return res.json({
      status: 'success',
      data: {
        driver_location: null,
        message: driver ? 'Driver location not available' : 'No driver assigned to this ride',
      },
    });
  }

  res.json({
    status: 'success',
    data: {
      driver_location: {
        driver_id: driver._id.toString(),
        location: {
          latitude: driver.currentLocation.coordinates[1],
          longitude: driver.currentLocation.coordinates[0],
          address: driver.currentLocation.address,
        },
        last_updated: driver.currentLocation.lastUpdated,
        is_online: driver.isOnline,
        is_available: driver.isAvailable,
      },
      ride: {
        ride_id: ride._id.toString(),
        status: ride.status,
        pickup: {
          latitude: ride.pickupLocation.coordinates[1],
          longitude: ride.pickupLocation.coordinates[0],
          address: ride.pickupLocation.address,
        },
        dropoff: {
          latitude: ride.dropoffLocation.coordinates[1],
          longitude: ride.dropoffLocation.coordinates[0],
          address: ride.dropoffLocation.address,
        },
      },
    },
  });
});

/**
 * Assign new driver - POST /api/booking/ride/assign-new-driver
 */
export const assignNewDriver = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, reason } = req.body;

  const ride = await Ride.findById(rideId)
    .populate('rider')
    .populate('driver');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Only rider or admin can request new driver assignment
  if (ride.rider._id.toString() !== userId.toString()) {
    throw new ValidationError('Only the rider can request a new driver assignment');
  }

  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw new ValidationError('Cannot assign new driver to completed or cancelled ride');
  }

  // Ensure vehicleType is populated
  if (!ride.vehicleType || !ride.vehicleType._id) {
    await ride.populate('vehicleType');
  }

  // Find alternative driver
  const excludedDriverId = ride.driver?._id || ride.driver || null;
  logger.info(`Attempting to find alternative driver for ride ${rideId}, vehicle type: ${ride.vehicleType?._id || ride.vehicleType}, excluding driver: ${excludedDriverId}`);
  
  const alternativeDriver = await rideMatchingService.findAlternativeDriver(
    ride,
    excludedDriverId
  );

  if (!alternativeDriver) {
    logger.warn(`No alternative driver found for ride ${rideId} (vehicle type: ${ride.vehicleType?._id || ride.vehicleType})`);
    throw new NotFoundError('No alternative driver available at this time.');
  }

  // Remove previous driver
  if (ride.driver) {
    const previousDriver = await Driver.findById(ride.driver._id);
    if (previousDriver) {
      previousDriver.isAvailable = true;
      await previousDriver.save();
    }
  }

  // Assign new driver
  ride.driver = alternativeDriver._id;
  ride.status = 'accepted';
  ride.acceptedByDriver = true;
  ride.acceptedAt = new Date();
  ride.statusHistory.push({
    status: 'accepted',
    timestamp: new Date(),
    note: `Reassigned to driver ${alternativeDriver._id}: ${reason || 'Previous driver unavailable'}`,
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');
  await ride.populate('driver.user', 'name phone profileImage rating');

  // Make new driver unavailable
  alternativeDriver.isAvailable = false;
  await alternativeDriver.save();

  await Ride.findByIdAndUpdate(rideId, {
    $addToSet: { notifiedDriverIds: alternativeDriver._id },
  });

  // Send real-time notifications
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideAccepted(ride, alternativeDriver);
    socketService.emitRideStatusUpdate(ride, 'accepted', alternativeDriver);
  }

  // Push notification to rider: new driver assigned
  try {
    const { createNotification } = await import('../services/notificationService.js');
    const riderUser = await User.findById(ride.rider._id).select('deviceToken').lean();
    if (riderUser?.deviceToken) {
      await createNotification(
        { _id: ride.rider._id, deviceToken: riderUser.deviceToken },
        'ride_accepted',
        'New driver assigned',
        'A new driver has been assigned to your ride and is on the way.',
        { rideId: ride._id.toString(), screen: 'home' },
        ride._id
      );
    }
  } catch (err) {
    logger.error(`New driver assigned push notification failed: ${err.message}`);
  }

  logger.info(`Ride ${rideId} reassigned to driver ${alternativeDriver._id}`);

  res.json({
    status: 'success',
    message: 'New driver assigned successfully',
    data: {
      ride: formatRideResponse(ride),
      driver: {
        driver_id: alternativeDriver._id.toString(),
        name: alternativeDriver.user?.name,
        phone: alternativeDriver.user?.phone,
        image: alternativeDriver.user?.profileImage,
        rating: alternativeDriver.rating?.average || 0,
        vehicle: {
          make: alternativeDriver.vehicleDetails?.make,
          model: alternativeDriver.vehicleDetails?.model,
          plate_number: alternativeDriver.vehicleDetails?.plateNumber,
          color: alternativeDriver.vehicleDetails?.color,
        },
      },
    },
  });
});

/**
 * Format driver ride response
 */
const formatDriverRideResponse = (ride) => {
  return {
    ride_id: ride._id.toString(),
    driver_id: ride.driver?._id?.toString() || null,
    driver_user_id: ride.driver?.user?._id?.toString() || null,
    passenger: ride.rider ? {
      user_id: ride.rider._id?.toString(),
      name: ride.rider.name,
      phone: ride.rider.phone,
      image: ride.rider.profileImage,
      rating: ride.rider.rating || 0,
    } : null,
    vehicle_id: ride.vehicleType?._id?.toString() || null,
    status: ride.status,
    accepted_by_driver: ride.acceptedByDriver,
    is_ride_started: ride.isRideStarted,
    drop_off_completed: ride.dropOffCompleted,
    origin: {
      lat: ride.pickupLocation.coordinates[1].toString(),
      long: ride.pickupLocation.coordinates[0].toString(),
      name: ride.pickupLocation.name || null, // Return null if name is missing, don't fallback to address
      address: ride.pickupLocation.address || '', // Always return address
    },
    destination: {
      lat: ride.dropoffLocation.coordinates[1].toString(),
      long: ride.dropoffLocation.coordinates[0].toString(),
      name: ride.dropoffLocation.name || null, // Return null if name is missing, don't fallback to address
      address: ride.dropoffLocation.address || '', // Always return address
    },
    cost: ride.fare.totalFare.toString(),
    payment_type: ride.paymentMethod,
    payment_status: ride.paymentStatus,
    arrival_distance: ride.arrivalDistance?.toString() || null,
    arrival_time: ride.arrivalTime?.toString() || null,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    createdAt: ride.createdAt,
  };
};
