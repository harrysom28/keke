import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import VehicleType from '../models/VehicleType.js';
import User from '../models/User.js';
import { calculateDistance, calculateDuration, calculateFare } from '../utils/geolocation.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import rideMatchingService from '../services/rideMatchingService.js';
import surgePricingService from '../services/surgePricingService.js';
import { getSocketService } from '../services/socketService.js';

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

  // Check if rider has active ride
  const activeRide = await Ride.findActiveRideForRider(riderId);
  if (activeRide) {
    throw new ConflictError('You already have an active ride');
  }

  // Validate vehicle type
  const vehicleType = await VehicleType.findById(vehicleTypeId);
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

  // Calculate base fare
  const fareBreakdown = calculateFare(distanceKm, durationMinutes, vehicleTypeId);

  // Calculate surge pricing based on demand using normalized coordinates
  const surgePricing = await surgePricingService.calculateSurgeMultiplier(
    normalizedPickupLat,
    normalizedPickupLng,
    vehicleTypeId
  );

  // Apply surge pricing to fare
  const fareWithSurge = surgePricingService.applySurgePricing(
    fareBreakdown.totalFare,
    surgePricing.multiplier
  );

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
    status: scheduledAt ? 'scheduled' : 'requested',
    isScheduled: !!scheduledAt,
    scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    fare: {
      baseFare: fareBreakdown.baseFare,
      distanceFare: fareBreakdown.distanceFare,
      timeFare: fareBreakdown.timeFare,
      surgeMultiplier: fareWithSurge.surgeMultiplier,
      totalFare: fareWithSurge.finalFare,
    },
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
      status: scheduledAt ? 'scheduled' : 'requested',
      timestamp: new Date(),
      note: scheduledAt ? 'Ride scheduled' : 'Ride requested',
    }],
  };

  const ride = await Ride.create(rideData);
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType', 'name displayName image');

  // Find and match drivers using ride matching algorithm
  const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, 10, 5);
  
  logger.info(`Found ${matchedDrivers.length} matched drivers for ride ${ride._id}`);

  // Notify matched drivers via Socket.io (if available)
  if (matchedDrivers.length > 0) {
    const socketService = getSocketService();
    if (socketService) {
      socketService.emitRideRequest(ride, matchedDrivers.map((d) => d.driver));
    } else {
      logger.warn('Socket service not available, skipping driver notifications');
    }
  }
  
  // Auto-assign driver immediately for testing (bypass waiting screen)
  // In production, you can change this to 30000 (30 seconds) or remove for manual acceptance
  // ALWAYS schedule auto-assignment, even if no drivers found initially (will retry in timeout)
  
  // ⛔ AUTO-ASSIGNMENT DISABLED - Check environment variable to enable/disable
  const DISABLE_AUTO_ASSIGNMENT = process.env.DISABLE_AUTO_ASSIGNMENT === 'true' || true; // Set to false to enable
  const autoAssignDelay = process.env.NODE_ENV === 'production' ? 30000 : 1000; // 1 second for dev, 30s for prod

  if (DISABLE_AUTO_ASSIGNMENT) {
    logger.info(`🚫 Auto-assignment DISABLED for ride ${ride._id} - drivers must manually accept rides`);
  } else {
    logger.info(`Scheduling auto-assignment for ride ${ride._id} in ${autoAssignDelay}ms`);
    
    // Store ride ID and vehicle type for re-matching if needed
    const rideId = ride._id.toString();
    // Use the vehicleTypeId from the populated ride object (should match req.body.vehicleTypeId)
    const rideVehicleTypeId = ride.vehicleType._id.toString();
    const pickupLat = ride.pickupLocation.coordinates[1];
    const pickupLng = ride.pickupLocation.coordinates[0];
    
    setTimeout(async () => {
      try {
        const updatedRide = await Ride.findById(rideId).populate('vehicleType');
        if (!updatedRide) {
          logger.warn(`Ride ${rideId} not found for auto-assignment`);
          return;
        }

        if (updatedRide.status !== 'requested' || updatedRide.driver) {
          logger.info(`Ride ${rideId} already has driver or status changed: status=${updatedRide.status}, driver=${updatedRide.driver ? 'assigned' : 'none'}`);
          return;
        }

        logger.info(`Auto-assigning driver for ride ${rideId}`);
        
        let driversToUse = [];
        
        // If we had matched drivers initially, try to validate them first
        if (matchedDrivers.length > 0) {
          // Re-validate matched drivers are still available before auto-assigning
          const validMatchedDrivers = await Promise.all(
            matchedDrivers.map(async (match) => {
              try {
                const driverId = match.driver._id || match.driver;
                const driverDoc = await Driver.findById(driverId).populate('vehicleDetails.vehicleType');
                if (driverDoc && driverDoc.isAvailable && driverDoc.isOnline) {
                  // Verify vehicle type still matches
                  const driverVehicleType = driverDoc.vehicleDetails?.vehicleType?._id?.toString() || driverDoc.vehicleDetails?.vehicleType?.toString();
                  if (driverVehicleType === rideVehicleTypeId) {
                    return match;
                  } else {
                    logger.warn(`Driver ${driverId} vehicle type mismatch: ${driverVehicleType} !== ${rideVehicleTypeId}`);
                  }
                } else {
                  logger.warn(`Driver ${driverId} not available: isAvailable=${driverDoc?.isAvailable}, isOnline=${driverDoc?.isOnline}`);
                }
                return null;
              } catch (err) {
                logger.warn(`Error validating driver ${match.driver._id || match.driver}: ${err.message}`);
                return null;
              }
            })
          );
          
          driversToUse = validMatchedDrivers.filter(Boolean);
          logger.info(`Validated ${driversToUse.length} of ${matchedDrivers.length} initially matched drivers`);
        }
        
        // If no valid drivers from initial match, try to find new drivers
        if (driversToUse.length === 0) {
          logger.warn(`No valid drivers from initial match for ride ${rideId}, attempting to re-match...`);
          const newMatchedDrivers = await rideMatchingService.findAndMatchDrivers(updatedRide, 10, 5);
          if (newMatchedDrivers.length > 0) {
            logger.info(`Found ${newMatchedDrivers.length} new drivers, attempting auto-assignment...`);
            driversToUse = newMatchedDrivers;
          } else {
            logger.warn(`⚠️ No drivers found for auto-assignment for ride ${rideId}`);
          }
        }

        // Attempt auto-assignment if we have drivers
        if (driversToUse.length > 0) {
          const assignedDriver = await rideMatchingService.autoAssignDriver(updatedRide, driversToUse);
          if (assignedDriver) {
            logger.info(`✅ Successfully auto-assigned driver ${assignedDriver._id} to ride ${rideId}`);
          } else {
            logger.warn(`⚠️ Auto-assignment failed for ride ${rideId} - driver assignment returned null`);
            
            // In development, try to find ANY available driver (ignore vehicle type temporarily)
            if (process.env.NODE_ENV !== 'production') {
              logger.info(`🔄 Development mode: Attempting to find any available driver...`);
              const anyDrivers = await Driver.find({
                isOnline: true,
                isAvailable: true,
                documentsVerified: true,
                verificationStatus: 'approved',
              }).limit(1).populate('user');
              
              if (anyDrivers.length > 0) {
                logger.info(`✅ Found fallback driver ${anyDrivers[0]._id}, attempting assignment...`);
                // Update driver's vehicle type to match ride temporarily
                const fallbackDriver = anyDrivers[0];
                const originalVehicleType = fallbackDriver.vehicleDetails?.vehicleType;
                if (fallbackDriver.vehicleDetails) {
                  fallbackDriver.vehicleDetails.vehicleType = updatedRide.vehicleType._id || updatedRide.vehicleType;
                  await fallbackDriver.save();
                }
                
                const fallbackAssigned = await rideMatchingService.autoAssignDriver(updatedRide, [{ driver: fallbackDriver }]);
                if (fallbackAssigned) {
                  logger.info(`✅ Successfully auto-assigned fallback driver ${fallbackAssigned._id} to ride ${rideId}`);
                } else {
                  // Restore original vehicle type
                  if (fallbackDriver.vehicleDetails && originalVehicleType) {
                    fallbackDriver.vehicleDetails.vehicleType = originalVehicleType;
                    await fallbackDriver.save();
                  }
                }
              }
            }
          }
        } else {
          logger.warn(`⚠️ No drivers available for auto-assignment for ride ${rideId}`);
          
          // In development, try to find ANY available driver as fallback
          if (process.env.NODE_ENV !== 'production') {
            logger.info(`🔄 Development mode: No matched drivers, trying fallback...`);
            const anyDrivers = await Driver.find({
              isOnline: true,
              isAvailable: true,
              documentsVerified: true,
              verificationStatus: 'approved',
            }).limit(1).populate('user');
            
            if (anyDrivers.length > 0) {
              logger.info(`✅ Found fallback driver ${anyDrivers[0]._id}, updating vehicle type and assigning...`);
              const fallbackDriver = anyDrivers[0];
              const originalVehicleType = fallbackDriver.vehicleDetails?.vehicleType;
              
              // Temporarily update vehicle type to match ride
              if (fallbackDriver.vehicleDetails) {
                fallbackDriver.vehicleDetails.vehicleType = updatedRide.vehicleType._id || updatedRide.vehicleType;
                await fallbackDriver.save();
              }
              
              // Try to find drivers again with updated vehicle type
              const retryDrivers = await rideMatchingService.findAndMatchDrivers(updatedRide, 10, 5);
              if (retryDrivers.length > 0) {
                const fallbackAssigned = await rideMatchingService.autoAssignDriver(updatedRide, retryDrivers);
                if (fallbackAssigned) {
                  logger.info(`✅ Successfully auto-assigned fallback driver ${fallbackAssigned._id} to ride ${rideId}`);
                } else {
                  // Restore original vehicle type if assignment failed
                  if (fallbackDriver.vehicleDetails && originalVehicleType) {
                    fallbackDriver.vehicleDetails.vehicleType = originalVehicleType;
                    await fallbackDriver.save();
                  }
                }
              } else {
                // Restore original vehicle type
                if (fallbackDriver.vehicleDetails && originalVehicleType) {
                  fallbackDriver.vehicleDetails.vehicleType = originalVehicleType;
                  await fallbackDriver.save();
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error(`❌ Error in auto-assignment timeout for ride ${rideId}: ${error.message}`);
        logger.error(error.stack);
      }
    }, autoAssignDelay);
  } // End of auto-assignment block

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

  // Calculate fare
  const fareBreakdown = calculateFare(distanceKm, durationMinutes, vehicleTypeId);

  // Calculate surge pricing based on demand
  const surgePricing = await surgePricingService.calculateSurgeMultiplier(
    pickup.lat,
    pickup.lng,
    vehicleTypeId
  );

  // Apply surge pricing to fare
  const fareWithSurge = surgePricingService.applySurgePricing(
    fareBreakdown.totalFare,
    surgePricing.multiplier
  );

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
        totalFare: fareWithSurge.finalFare,
        surgeMultiplier: surgePricing.multiplier,
        isSurged: surgePricing.isSurged,
        surgeReason: surgePricing.reason,
        currency: 'USD',
      },
      cost: fareWithSurge.finalFare.toString(), // For mobile app compatibility
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

  // Debug: Check total drivers in database with different criteria
  const totalDrivers = await Driver.countDocuments({});
  const onlineDrivers = await Driver.countDocuments({ isOnline: true });
  const availableDrivers = await Driver.countDocuments({ isOnline: true, isAvailable: true });
  const verifiedDrivers = await Driver.countDocuments({ 
    isOnline: true, 
    isAvailable: true, 
    documentsVerified: true 
  });
  const approvedDrivers = await Driver.countDocuments({ 
    isOnline: true, 
    isAvailable: true, 
    documentsVerified: true, 
    verificationStatus: 'approved' 
  });
  const withLocation = await Driver.countDocuments({ 
    isOnline: true, 
    isAvailable: true, 
    documentsVerified: true, 
    verificationStatus: 'approved',
    currentLocation: { $exists: true, $ne: null }
  });

  logger.info(`Driver statistics: Total=${totalDrivers}, Online=${onlineDrivers}, Available=${availableDrivers}, Verified=${verifiedDrivers}, Approved=${approvedDrivers}, WithLocation=${withLocation}`);

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
  
  // Calculate cancellation fee
  const { calculateCancellationFee } = await import('../utils/cancellationFeeCalculator.js');
  const { cancellationFee, feeReason } = calculateCancellationFee(ride, cancelledBy);

  // Cancel ride
  await ride.cancelRide(cancelledBy, reason, cancellationFee);

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
 * Get ride history - matches /api/history
 */
export const getRideHistory = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const userId = req.user._id;
  const skip = (page - 1) * limit;

  const filter = {
    rider: userId,
  };

  if (status) {
    filter.status = status;
  }

  const rides = await Ride.find(filter)
    .populate('driver.user', 'name phone profileImage rating')
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
 * Format ride response for mobile app compatibility
 */
const formatRideResponse = (ride) => {
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

  if (!ride.driver) {
    return res.json({
      status: 'success',
      data: {
        driver_location: null,
        message: 'No driver assigned to this ride',
      },
    });
  }

  const driver = await Driver.findById(ride.driver._id);
  if (!driver || !driver.currentLocation) {
    return res.json({
      status: 'success',
      data: {
        driver_location: null,
        message: 'Driver location not available',
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
    throw new NotFoundError('No alternative driver available at this time');
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

  // Send real-time notifications
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideAccepted(ride, alternativeDriver);
    socketService.emitRideStatusUpdate(ride, 'accepted', alternativeDriver);
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
