import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import { calculateDistance } from '../utils/geolocation.js';
import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';

/**
 * Ride matching service with intelligent algorithm
 */
class RideMatchingService {
  /**
   * Find and match drivers for a ride request
   */
  async findAndMatchDrivers(ride, maxDistanceKm = 10, maxDrivers = 5) {
    try {
      const pickupLat = ride.pickupLocation.coordinates[1];
      const pickupLng = ride.pickupLocation.coordinates[0];

      // Find nearby available drivers using geospatial query
      const nearbyDrivers = await Driver.findNearbyAvailable(
        pickupLat,
        pickupLng,
        maxDistanceKm
      );

      if (nearbyDrivers.length === 0) {
        logger.warn(`No nearby drivers found for ride ${ride._id}`);
        return [];
      }

      // Filter by vehicle type
      const matchingDrivers = nearbyDrivers.filter(
        (driver) => driver.vehicleDetails.vehicleType.toString() === ride.vehicleType.toString()
      );

      if (matchingDrivers.length === 0) {
        logger.warn(`No drivers with matching vehicle type for ride ${ride._id}`);
        return [];
      }

      // Score and rank drivers
      const scoredDrivers = this.scoreDrivers(matchingDrivers, ride, pickupLat, pickupLng);

      // Sort by score (highest first) and limit
      const topDrivers = scoredDrivers
        .sort((a, b) => b.score - a.score)
        .slice(0, maxDrivers);

      logger.info(`Found ${topDrivers.length} suitable drivers for ride ${ride._id}`);

      return topDrivers;
    } catch (error) {
      logger.error(`Error finding drivers for ride ${ride._id}: ${error.message}`);
      return [];
    }
  }

  /**
   * Score drivers based on multiple factors
   */
  scoreDrivers(drivers, ride, pickupLat, pickupLng) {
    return drivers.map((driver) => {
      let score = 100; // Base score

      // Distance factor (closer = higher score)
      const distance = calculateDistance(
        pickupLat,
        pickupLng,
        driver.currentLocation.coordinates[1],
        driver.currentLocation.coordinates[0]
      );
      const distanceScore = Math.max(0, 100 - (distance * 10)); // Deduct 10 points per km
      score += distanceScore * 0.3; // 30% weight

      // Rating factor (higher rating = higher score)
      const rating = driver.rating?.average || 0;
      const ratingScore = (rating / 5) * 100; // Convert to 0-100 scale
      score += ratingScore * 0.25; // 25% weight

      // Acceptance rate factor (higher acceptance = higher score)
      const acceptanceRate = driver.acceptanceRate || 0;
      score += acceptanceRate * 0.2; // 20% weight

      // Cancellation rate factor (lower cancellation = higher score)
      const cancellationRate = driver.cancellationRate || 0;
      score -= cancellationRate * 0.15; // 15% weight (deduct)

      // Recent activity factor (recently active = higher score)
      const lastActiveAt = driver.lastActiveAt || driver.updatedAt;
      const minutesSinceActive = (new Date() - lastActiveAt) / (1000 * 60);
      const activityScore = Math.max(0, 100 - (minutesSinceActive / 5)); // Deduct for each 5 min
      score += activityScore * 0.1; // 10% weight

      // Total rides factor (more experience = slightly higher score)
      const experienceScore = Math.min(20, driver.totalRides || 0); // Max 20 points
      score += experienceScore * 0.05; // 5% weight

      return {
        driver,
        score: Math.max(0, score), // Ensure non-negative
        distance,
      };
    });
  }

  /**
   * Notify drivers about ride request
   */
  async notifyDrivers(ride, drivers, timeoutMs = 30000) {
    const socketService = getSocketService();
    
    if (!socketService) {
      logger.warn('Socket service not available, cannot notify drivers');
      return null;
    }

    // Emit ride request to all matched drivers
    socketService.emitRideRequest(ride, drivers.map((d) => d.driver));

    // Wait for driver acceptance or timeout
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        logger.info(`Ride request timeout for ride ${ride._id}`);
        resolve(null);
      }, timeoutMs);

      // Listen for driver acceptance (would need to be handled via socket event)
      // For now, return null and let the system handle it
      // In production, you'd set up an event listener here
    });
  }

  /**
   * Auto-assign driver if first driver doesn't respond
   */
  async autoAssignDriver(ride, drivers) {
    if (!drivers || drivers.length === 0) {
      logger.warn(`No drivers available for auto-assignment for ride ${ride._id}`);
      return null;
    }

    // Get the top driver - handle both { driver, score } format and direct driver objects
    const topMatch = drivers[0];
    const topDriver = topMatch.driver || topMatch;
    const driverId = topDriver._id || topDriver;
    
    if (!driverId) {
      logger.error(`Invalid driver reference in auto-assignment for ride ${ride._id}`);
      return null;
    }
    
    try {
      // Refresh driver from DB to ensure we have latest data
      const driverDoc = await Driver.findById(driverId).populate('user');
      if (!driverDoc) {
        logger.warn(`Driver ${driverId} not found in database for auto-assignment`);
        return null;
      }
      
      if (!driverDoc.isAvailable || !driverDoc.isOnline) {
        logger.warn(`Driver ${driverId} is not available (isAvailable: ${driverDoc.isAvailable}, isOnline: ${driverDoc.isOnline}), skipping auto-assignment`);
        return null;
      }
      
      // Verify vehicle type matches
      const driverVehicleType = driverDoc.vehicleDetails?.vehicleType?.toString();
      const rideVehicleType = ride.vehicleType?._id?.toString() || ride.vehicleType?.toString();
      if (driverVehicleType !== rideVehicleType) {
        logger.warn(`Driver ${driverId} vehicle type (${driverVehicleType}) doesn't match ride vehicle type (${rideVehicleType})`);
        return null;
      }

      // Ensure ride is fresh from DB before updating
      const freshRide = await Ride.findById(ride._id).populate('rider vehicleType');
      if (!freshRide) {
        logger.error(`Ride ${ride._id} not found during auto-assignment`);
        return null;
      }
      
      if (freshRide.status !== 'requested' || freshRide.driver) {
        logger.info(`Ride ${ride._id} already has driver or status changed (status: ${freshRide.status}, driver: ${freshRide.driver ? 'assigned' : 'none'})`);
        return null;
      }
      
      // Update ride with driver assignment
      freshRide.driver = driverDoc._id;
      freshRide.status = 'accepted';
      freshRide.acceptedByDriver = true;
      freshRide.acceptedAt = new Date();
      freshRide.statusHistory.push({
        status: 'accepted',
        timestamp: new Date(),
        note: `Auto-assigned to driver ${driverDoc._id}`,
      });
      
      await freshRide.save();
      
      // Populate ride with related data
      await freshRide.populate('rider', 'name phone profileImage rating');
      await freshRide.populate('driver.user', 'name phone profileImage rating');

      // Make driver unavailable
      driverDoc.isAvailable = false;
      await driverDoc.save();

      // Emit notifications (if socket service available)
      const socketService = getSocketService();
      if (socketService) {
        socketService.emitRideAccepted(freshRide, driverDoc);
        socketService.emitRideStatusUpdate(freshRide, 'accepted', driverDoc);
      } else {
        logger.warn('Socket service not available, skipping real-time notifications');
      }

      logger.info(`✅ Ride ${freshRide._id} auto-assigned to driver ${driverDoc._id} (${driverDoc.user?.name || 'Unknown'})`);
      return driverDoc;
    } catch (error) {
      logger.error(`❌ Error auto-assigning driver for ride ${ride._id}: ${error.message}`);
      logger.error(error.stack);
      return null;
    }
  }

  /**
   * Find alternative driver if current driver cancels
   */
  async findAlternativeDriver(ride, excludedDriverId) {
    try {
      const pickupLat = ride.pickupLocation.coordinates[1];
      const pickupLng = ride.pickupLocation.coordinates[0];

      logger.info(`Finding alternative driver for ride ${ride._id} at (${pickupLat}, ${pickupLng}), excluding driver: ${excludedDriverId}`);

      // Find nearby available drivers (excluding the one who cancelled)
      const nearbyDrivers = await Driver.findNearbyAvailable(
        pickupLat,
        pickupLng,
        15 // Larger radius for alternative
      );

      logger.info(`Found ${nearbyDrivers.length} nearby available drivers for alternative search`);

      // Get ride vehicle type ID for comparison
      const rideVehicleTypeId = ride.vehicleType?._id?.toString() || ride.vehicleType?.toString();
      logger.info(`Ride vehicle type ID: ${rideVehicleTypeId}`);

      const excludeSet = new Set();
      if (excludedDriverId) {
        excludeSet.add(excludedDriverId.toString());
      }
      const notified = ride.notifiedDriverIds || [];
      for (const id of notified) {
        if (id) excludeSet.add(id.toString());
      }

      // Filter out excluded driver(s) and match vehicle type
      const availableDrivers = nearbyDrivers.filter((driver) => {
        const isExcluded = excludeSet.has(driver._id.toString());
        
        // Get driver vehicle type ID
        const driverVehicleTypeId = driver.vehicleDetails?.vehicleType?._id?.toString() || 
                                   driver.vehicleDetails?.vehicleType?.toString();
        
        // Check vehicle type match
        const vehicleTypeMatches = driverVehicleTypeId === rideVehicleTypeId;
        
        if (isExcluded) {
          logger.debug(`Excluding driver ${driver._id} (excluded driver)`);
          return false;
        }
        
        if (!vehicleTypeMatches) {
          logger.debug(`Excluding driver ${driver._id} (vehicle type mismatch: ${driverVehicleTypeId} !== ${rideVehicleTypeId})`);
          return false;
        }
        
        return true;
      });

      logger.info(`After filtering: ${availableDrivers.length} drivers match vehicle type and are not excluded`);

      if (availableDrivers.length === 0) {
        logger.warn(`No alternative drivers found for ride ${ride._id} (vehicle type: ${rideVehicleTypeId}, excluded: ${excludedDriverId})`);
        
        // Log breakdown for debugging
        const byVehicleType = {};
        nearbyDrivers.forEach(driver => {
          const driverVehicleTypeId = driver.vehicleDetails?.vehicleType?._id?.toString() || 
                                     driver.vehicleDetails?.vehicleType?.toString();
          byVehicleType[driverVehicleTypeId] = (byVehicleType[driverVehicleTypeId] || 0) + 1;
        });
        logger.info(`Nearby drivers by vehicle type: ${JSON.stringify(byVehicleType)}`);
        
        return null;
      }

      // Score and select best alternative
      const scoredDrivers = this.scoreDrivers(availableDrivers, ride, pickupLat, pickupLng);
      const bestAlternative = scoredDrivers.sort((a, b) => b.score - a.score)[0];

      logger.info(`Found alternative driver ${bestAlternative.driver._id} for ride ${ride._id}`);
      return bestAlternative.driver;
    } catch (error) {
      logger.error(`Error finding alternative driver for ride ${ride._id}: ${error.message}`);
      logger.error(error.stack);
      return null;
    }
  }
}

export default new RideMatchingService();
