/**
 * Haversine distance between two points in km.
 * Used for driver filtering (e.g. only show drivers within 3km).
 */
const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_KM * c;
}

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  return haversineKm(a, b) * 1000;
}

/**
 * Initial bearing from a → b, degrees clockwise from true north [0, 360).
 * Use for “direction of travel” when OS heading/course is missing.
 */
export function bearingBetweenDegrees(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

const NEARBY_RADIUS_KM = 3;

/**
 * True if driver is within NEARBY_RADIUS_KM of user (for map rendering).
 * Keeps marker count low on low-end devices.
 */
export function isDriverNearby(
  driver: { latitude: number; longitude: number },
  user: { latitude: number; longitude: number }
): boolean {
  if (user.latitude === 0 && user.longitude === 0) return true;
  return haversineKm(user, driver) < NEARBY_RADIUS_KM;
}
