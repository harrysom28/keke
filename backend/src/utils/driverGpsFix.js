import { isUsableLatLng, LIVE_FIX_MAX_ACCURACY_M } from './dropoffProximity.js';

/** A client GPS fix older than this is not a real fix for going online or lastRealFixAt. */
export const REAL_FIX_MAX_AGE_MS = 60 * 1000;

/** Same trusted accuracy ceiling as a trip-ending live fix. */
export const REAL_FIX_MAX_ACCURACY_M = LIVE_FIX_MAX_ACCURACY_M;

/** Express-validator ceiling on location.accuracy for the trip-ending field. */
export const REAL_FIX_ACCURACY_HARD_MAX_M = 100000;

export const LOCATION_REQUIRED_CODE = 'LOCATION_REQUIRED';
export const LOCATION_REQUIRED_MESSAGE =
  'Enable location and wait for GPS before going online';

/** Nudge fires this long before the matching freshness cutoff. */
export const GPS_NUDGE_LEAD_SECONDS = 30;
/** And only for this long after the cutoff (one-shot window). */
export const GPS_NUDGE_TAIL_SECONDS = 5 * 60;
export const GPS_NUDGE_REPEAT_MS = 60 * 60 * 1000;

export const GPS_NUDGE_TITLE = 'Location stopped updating';
export const GPS_NUDGE_BODY =
  'Open the app and keep it in the foreground to continue receiving rides.';

const DAY_MS = 24 * 60 * 60 * 1000;

function toMillis(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return n;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Body carries a client fix attempt when any GPS field is present.
 * `{ lat, lng, accuracy, capturedAt }` — same shape the driver app sends.
 */
export function hasClientGpsFields(body) {
  if (!body || typeof body !== 'object') return false;
  return (
    body.lat != null ||
    body.lng != null ||
    body.accuracy != null ||
    body.capturedAt != null
  );
}

/**
 * A real client fix: non-zero valid lat/lng, capturedAt within 60s, accuracy in range.
 * Returns null when the payload is missing or fails those checks.
 */
export function parseClientGpsFix(input, nowMs = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const accuracy =
    input.accuracy == null || input.accuracy === '' ? 0 : Number(input.accuracy);
  const capturedMs = toMillis(input.capturedAt);
  if (!isUsableLatLng(lat, lng)) return null;
  if (
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > REAL_FIX_ACCURACY_HARD_MAX_M ||
    accuracy > REAL_FIX_MAX_ACCURACY_M
  ) {
    return null;
  }
  if (capturedMs == null || Math.abs(nowMs - capturedMs) > REAL_FIX_MAX_AGE_MS) return null;
  return { lat, lng, accuracy, capturedAt: new Date(capturedMs) };
}

/**
 * Going-online body.
 * - no GPS fields → not rejected; caller may accept a fresh stored fix
 * - GPS fields that fail validation → rejected (do not fall through)
 * - valid fix → use it
 */
export function readGoOnlineBody(body, nowMs = Date.now()) {
  if (!hasClientGpsFields(body)) return { fix: null, rejected: false };
  const fix = parseClientGpsFix(body, nowMs);
  if (!fix) return { fix: null, rejected: true };
  return { fix, rejected: false };
}

/** Missing coordinates, non-numeric, or the [0, 0] placeholder. */
export function isZeroOrMissingCoordinates(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return true;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return true;
  return lng === 0 && lat === 0;
}

/** Stored lastRealFixAt is recent enough to go online without a new body fix. */
export function realFixIsFresh(lastRealFixAt, nowMs = Date.now(), maxAgeMs = REAL_FIX_MAX_AGE_MS) {
  const t = toMillis(lastRealFixAt);
  if (t == null) return false;
  return nowMs - t <= maxAgeMs && t - nowMs <= maxAgeMs;
}

/**
 * Matching freshness.
 * A recorded lastRealFixAt wins. Drivers saved before that field existed
 * (the key is absent, not null) stay matchable off lastUpdated until the
 * next real fix writes lastRealFixAt.
 * An explicit null means "no real fix" and does not fall back.
 */
export function realFixFreshnessClause(locationFreshSince) {
  return {
    $or: [
      { 'currentLocation.lastRealFixAt': { $gte: locationFreshSince } },
      {
        'currentLocation.lastRealFixAt': { $exists: false },
        'currentLocation.lastUpdated': { $gte: locationFreshSince },
      },
    ],
  };
}

/**
 * Admin GPS dot.
 * Red when lastRealFixAt is missing or coordinates are [0,0] / missing,
 * even if lastUpdated is recent.
 */
export function gpsDotStatus(currentLocation, freshnessSeconds, nowMs = Date.now()) {
  const sec = Number(freshnessSeconds);
  const freshnessMs = (Number.isFinite(sec) && sec > 0 ? sec : 300) * 1000;
  const coords = currentLocation?.coordinates;
  const lng = Number(coords?.[0]);
  const lat = Number(coords?.[1]);
  const coordsBad =
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    (lng === 0 && lat === 0);
  const fixMs = toMillis(currentLocation?.lastRealFixAt);
  if (coordsBad || fixMs == null) return 'red';
  const age = nowMs - fixMs;
  if (age <= freshnessMs) return 'green';
  if (age <= DAY_MS) return 'yellow';
  return 'red';
}

export function lastRealFixIso(currentLocation) {
  const t = toMillis(currentLocation?.lastRealFixAt);
  return t == null ? null : new Date(t).toISOString();
}
