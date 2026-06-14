/** Driver search radii (km). Temporarily widened to 10km for discovery/dispatch. */
export const RIDER_PREVIEW_SEARCH_RADIUS_KM = 10;
export const RIDER_MATCH_SEARCH_RADIUS_KM = 10;
export const DISPATCH_RADIUS_ROUND_2_KM = 10;
export const DISPATCH_RADIUS_ROUND_3_KM = 10;
export const ASSIGN_NEW_DRIVER_RADIUS_KM = 10;

/** Drivers must have reported location within this window to appear in search. */
export const DRIVER_LOCATION_MAX_AGE_MS = 2 * 60 * 1000;

/** Background cleanup: flip isOnline off after this idle period. */
export const DRIVER_STALE_OFFLINE_MS = 5 * 60 * 1000;

/**
 * Expanding radius per dispatch round (ride.attempts after each dispatchRide $inc).
 * Currently flat 10km on all rounds.
 */
export function resolveDispatchSearchRadiusKm(ride) {
  const attempts = Number(ride?.attempts) || 0;
  if (attempts <= 0) return RIDER_MATCH_SEARCH_RADIUS_KM;
  if (attempts === 1) return DISPATCH_RADIUS_ROUND_2_KM;
  return DISPATCH_RADIUS_ROUND_3_KM;
}
