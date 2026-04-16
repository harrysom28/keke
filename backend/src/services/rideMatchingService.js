import Driver from '../models/Driver.js';
import { calculateDistance } from '../utils/geolocation.js';
import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';

/** Normalize VehicleType ref whether stored as ObjectId or populated document (same as findNearbyDrivers filter). */
function getVehicleTypeId(ref) {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref._id != null) return ref._id.toString();
  return ref.toString();
}

/**
 * Ride matching service with intelligent algorithm
 */
class RideMatchingService {
  /**
   * Find and match drivers for a ride request
   */
  /**
   * @param {string[]} excludeDriverIds - Driver IDs to skip (already notified in prior dispatch rounds).
   */
  async findAndMatchDrivers(ride, maxDistanceKm = 10, maxDrivers = 5, excludeDriverIds = []) {
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

      const rideVehicleTypeId = getVehicleTypeId(ride.vehicleType);
      const excludeSet = new Set(excludeDriverIds.map(String));

      // Filter by vehicle type and skip already-notified drivers
      const matchingDrivers = nearbyDrivers.filter((driver) => {
        if (excludeSet.has(driver._id.toString())) return false;
        const driverVehicleTypeId = getVehicleTypeId(driver.vehicleDetails?.vehicleType);
        return (
          rideVehicleTypeId &&
          driverVehicleTypeId &&
          driverVehicleTypeId === rideVehicleTypeId
        );
      });

      if (matchingDrivers.length === 0) {
        logger.warn(
          `No drivers with matching vehicle type for ride ${ride._id} (ride vehicleType: ${rideVehicleTypeId})`
        );
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
