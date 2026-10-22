/**
 * Driver search / dispatch radii.
 *
 * Compile-time defaults below match the previous hard-coded values (flat 10 km,
 * 5-minute location freshness). Live values come from AdminSettings.dispatch via
 * getSettings() — see settingsService DEFAULTS.dispatch for the admin defaults
 * (round 1/2/3 = 10/12/15 km when nothing has been saved yet).
 */

/** Rider “nearby drivers” map preview. */
export const RIDER_PREVIEW_SEARCH_RADIUS_KM = 10;
/** First dispatch round (attempts === 0). */
export const RIDER_MATCH_SEARCH_RADIUS_KM = 10;
export const DISPATCH_RADIUS_ROUND_2_KM = 10;
export const DISPATCH_RADIUS_ROUND_3_KM = 10;
/** Admin reassign / find-alternative-driver. */
export const ASSIGN_NEW_DRIVER_RADIUS_KM = 10;

/**
 * Drivers must have reported location within this window to appear in search.
 * Stale location does not flip the driver's Online toggle — that stays on until
 * they go offline themselves (or log out). This window only hides them from matching.
 * Prefer getLocationMaxAgeMs() so admin `dispatch.locationFreshnessSeconds` applies;
 * this export remains as the compile-time fallback for any sync/legacy caller.
 */
export const DRIVER_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

async function readDispatch() {
  try {
    const { getSettings } = await import('../services/settingsService.js');
    const s = await getSettings();
    return s?.dispatch && typeof s.dispatch === 'object' ? s.dispatch : {};
  } catch {
    return {};
  }
}

/**
 * @param {{ phase?: 'preview'|'assign'|'dispatch', attempts?: number }} opts
 * @returns {Promise<number>} radius in km
 */
export async function getSearchRadiusKm({ phase, attempts } = {}) {
  const d = await readDispatch();
  if (phase === 'preview') {
    return Number(d.previewRadiusKm) || RIDER_PREVIEW_SEARCH_RADIUS_KM;
  }
  if (phase === 'assign') {
    return Number(d.assignRadiusKm) || ASSIGN_NEW_DRIVER_RADIUS_KM;
  }
  // Dispatch rounds (phase === 'dispatch' or omitted): keyed by ride.attempts
  // after each dispatchRide $inc — same mapping as the old sync helper.
  const a = Number(attempts) || 0;
  if (a <= 0) return Number(d.round1RadiusKm) || RIDER_MATCH_SEARCH_RADIUS_KM;
  if (a === 1) return Number(d.round2RadiusKm) || DISPATCH_RADIUS_ROUND_2_KM;
  return Number(d.round3RadiusKm) || DISPATCH_RADIUS_ROUND_3_KM;
}

/** Location freshness window for matching (ms). */
export async function getLocationMaxAgeMs() {
  const d = await readDispatch();
  const sec = Number(d.locationFreshnessSeconds);
  if (Number.isInteger(sec) && sec > 0) return sec * 1000;
  return DRIVER_LOCATION_MAX_AGE_MS;
}

/**
 * Expanding radius per dispatch round (ride.attempts after each dispatchRide $inc).
 */
export async function resolveDispatchSearchRadiusKm(ride) {
  return getSearchRadiusKm({ phase: 'dispatch', attempts: ride?.attempts });
}
