import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import { calculateDistance } from '../utils/geolocation.js';
import logger from '../utils/logger.js';

/**
 * Surge pricing service for demand-based pricing
 */
class SurgePricingService {
  /**
   * Calculate surge multiplier based on demand
   */
  async calculateSurgeMultiplier(pickupLat, pickupLng, vehicleTypeId, radiusKm = 5) {
    try {
      // Count available drivers in the area
      const availableDrivers = await Driver.findNearbyAvailable(
        pickupLat,
        pickupLng,
        radiusKm
      );

      // Filter by vehicle type
      const matchingDrivers = availableDrivers.filter(
        (driver) => driver.vehicleDetails.vehicleType.toString() === vehicleTypeId.toString()
      );

      // Count active ride requests in the area (last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      // Use $geoWithin with $centerSphere instead of $near (which requires sorting)
      // Radius in radians = distance in meters / Earth's radius in meters (6378100)
      const radiusInRadians = (radiusKm * 1000) / 6378100;
      const activeRequests = await Ride.countDocuments({
        vehicleType: vehicleTypeId,
        status: 'requested',
        createdAt: { $gte: fiveMinutesAgo },
        pickupLocation: {
          $geoWithin: {
            $centerSphere: [
              [pickupLng, pickupLat], // Center point [longitude, latitude]
              radiusInRadians, // Radius in radians
            ],
          },
        },
      });

      // Calculate supply/demand ratio
      const supply = matchingDrivers.length || 1; // Avoid division by zero
      const demand = activeRequests + 1; // +1 for current request
      const ratio = supply / demand;

      // Calculate surge multiplier based on ratio
      let surgeMultiplier = 1.0;

      if (ratio < 0.5) {
        // High demand, low supply
        surgeMultiplier = 1.5; // 50% surge
      } else if (ratio < 1.0) {
        // Moderate demand
        surgeMultiplier = 1.25; // 25% surge
      } else if (ratio < 1.5) {
        // Balanced
        surgeMultiplier = 1.1; // 10% surge
      } else {
        // Low demand, high supply
        surgeMultiplier = 1.0; // No surge
      }

      // Time-based surge (rush hours)
      const hour = new Date().getHours();
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        // Rush hours
        surgeMultiplier = Math.max(surgeMultiplier, 1.2); // Minimum 20% surge during rush hours
      }

      // Weekend/holiday surge
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Weekend
        surgeMultiplier = Math.max(surgeMultiplier, 1.15); // Minimum 15% surge on weekends
      }

      // Cap maximum surge at 2.0x (100% increase)
      surgeMultiplier = Math.min(surgeMultiplier, 2.0);

      logger.info(
        `Surge multiplier calculated: ${surgeMultiplier.toFixed(2)}x (supply: ${supply}, demand: ${demand}, ratio: ${ratio.toFixed(2)})`
      );

      return {
        multiplier: surgeMultiplier,
        isSurged: surgeMultiplier > 1.0,
        reason: this.getSurgeReason(ratio, hour, dayOfWeek),
      };
    } catch (error) {
      logger.error(`Error calculating surge multiplier: ${error.message}`);
      // Return default (no surge) on error
      return {
        multiplier: 1.0,
        isSurged: false,
        reason: 'Error calculating surge pricing',
      };
    }
  }

  /**
   * Get reason for surge pricing
   */
  getSurgeReason(ratio, hour, dayOfWeek) {
    const reasons = [];

    if (ratio < 0.5) {
      reasons.push('High demand, limited drivers');
    } else if (ratio < 1.0) {
      reasons.push('Moderate demand');
    }

    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      reasons.push('Rush hour');
    }

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      reasons.push('Weekend');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Normal pricing';
  }

  /**
   * Apply surge pricing to fare
   */
  applySurgePricing(baseFare, surgeMultiplier) {
    const surgedFare = baseFare * surgeMultiplier;
    return {
      baseFare,
      surgeMultiplier,
      finalFare: Math.round(surgedFare * 100) / 100, // Round to 2 decimal places
      isSurged: surgeMultiplier > 1.0,
    };
  }
}

export default new SurgePricingService();
