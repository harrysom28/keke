/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

/**
 * Convert degrees to radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Calculate estimated duration based on distance and average speed
 * @param {number} distanceKm - Distance in kilometers
 * @param {number} averageSpeedKmh - Average speed in km/h (default: 30)
 * @returns {number} Duration in minutes
 */
export const calculateDuration = (distanceKm, averageSpeedKmh = 30) => {
  const durationHours = distanceKm / averageSpeedKmh;
  const durationMinutes = Math.ceil(durationHours * 60);
  return durationMinutes;
};

/**
 * Check if coordinates are within service area bounds
 */
export const isWithinServiceArea = (lat, lon) => {
  const minLat = parseFloat(process.env.SERVICE_AREA_MIN_LAT || '-90');
  const maxLat = parseFloat(process.env.SERVICE_AREA_MAX_LAT || '90');
  const minLon = parseFloat(process.env.SERVICE_AREA_MIN_LNG || '-180');
  const maxLon = parseFloat(process.env.SERVICE_AREA_MAX_LNG || '180');

  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
};

/**
 * Find nearest drivers within radius
 * @param {Array} drivers - Array of driver objects with location
 * @param {number} lat - Latitude of pickup point
 * @param {number} lon - Longitude of pickup point
 * @param {number} radiusKm - Search radius in kilometers (default: 10)
 * @returns {Array} Sorted array of nearby drivers (closest first)
 */
export const findNearbyDrivers = (drivers, lat, lon, radiusKm = 10) => {
  const nearbyDrivers = drivers
    .filter((driver) => {
      if (!driver.currentLocation || !driver.currentLocation.coordinates) {
        return false;
      }

      const [driverLon, driverLat] = driver.currentLocation.coordinates;
      const distance = calculateDistance(lat, lon, driverLat, driverLon);

      return (
        distance <= radiusKm &&
        driver.isOnline === true &&
        driver.isAvailable === true &&
        driver.documentsVerified === true
      );
    })
    .map((driver) => {
      const [driverLon, driverLat] = driver.currentLocation.coordinates;
      const distance = calculateDistance(lat, lon, driverLat, driverLon);

      return {
        driver,
        distance,
      };
    })
    .sort((a, b) => a.distance - b.distance);

  return nearbyDrivers;
};

/**
 * Calculate fare based on distance, duration, and base rates
 */
export const calculateFare = (distanceKm, durationMinutes, vehicleTypeId = null) => {
  const baseFare = parseFloat(process.env.BASE_FARE || '2.50');
  const perKmRate = parseFloat(process.env.PER_KM_RATE || '1.50');
  const perMinuteRate = parseFloat(process.env.PER_MINUTE_RATE || '0.30');

  // Vehicle type multipliers (can be extended)
  const vehicleMultipliers = {
    '1': 1.0, // Standard
    '2': 1.2, // Premium
    '3': 1.5, // Luxury
  };

  const multiplier = vehicleMultipliers[vehicleTypeId] || 1.0;

  const distanceFare = distanceKm * perKmRate;
  const timeFare = durationMinutes * perMinuteRate;
  const totalFare = (baseFare + distanceFare + timeFare) * multiplier;

  return {
    baseFare,
    distanceFare: distanceKm * perKmRate,
    timeFare: durationMinutes * perMinuteRate,
    totalFare: Math.round(totalFare * 100) / 100, // Round to 2 decimal places
    multiplier,
    breakdown: {
      base: baseFare,
      distance: distanceKm,
      distanceRate: perKmRate,
      duration: durationMinutes,
      durationRate: perMinuteRate,
      vehicleMultiplier: multiplier,
    },
  };
};

/**
 * Apply surge pricing multiplier
 */
export const applySurgePricing = (baseFare, surgeMultiplier = 1.0) => {
  const maxSurge = parseFloat(process.env.SURGE_MULTIPLIER_MAX || '3.0');
  const multiplier = Math.min(Math.max(surgeMultiplier, 1.0), maxSurge);
  const surgedFare = baseFare * multiplier;

  return {
    originalFare: baseFare,
    surgeMultiplier: multiplier,
    finalFare: Math.round(surgedFare * 100) / 100,
    isSurged: multiplier > 1.0,
  };
};
