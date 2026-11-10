import { isUsableLatLng, LIVE_FIX_MAX_ACCURACY_M } from './dropoffProximity.js';

/** A client GPS fix older than this is not a real fix for going online or lastRealFixAt. */
export const REAL_FIX_MAX_AGE_MS = 60 * 1000;

/** Same trusted accuracy ceiling as a trip-ending live fix. */
export const REAL_FIX_MAX_ACCURACY_M = LIVE_FIX_MAX_ACCURACY_M;

/**
 * Looser accuracy ceiling for the going-online gate. The first fresh fix after
 * GPS has been idle (driver was offline) can read 200–500m before warming up;
 * requiring ≤150m at that moment blocks drivers who do have a real fix.
 * Matching freshness and trip-end use the stricter REAL_FIX_MAX_ACCURACY_M.
 */
export const GO_ONLINE_MAX_ACCURACY_M = 500;

/**
 * Fallback tolerance for the client's `capturedAt` wall-clock timestamp when
 * the client does not send `ageMs` (older APKs). A device whose clock is
 * drifted by more than REAL_FIX_MAX_AGE_MS from server time would have every
 * fresh fix rejected under the strict check; this gives wall-clock-skewed
 * phones a reasonable window. Drivers on APKs that send `ageMs` bypass this
 * entirely because `ageMs` is clock-independent.
 */
export const FALLBACK_CLOCK_SKEW_TOLERANCE_MS = 10 * 60 * 1000;

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
 * `{ lat, lng, accuracy, capturedAt, ageMs }` — same shape the driver app sends.
 */
export function hasClientGpsFields(body) {
  if (!body || typeof body !== 'object') return false;
  return (
    body.lat != null ||
    body.lng != null ||
    body.accuracy != null ||
    body.capturedAt != null ||
    body.ageMs != null
  );
}

/**
 * A real client fix: non-zero valid lat/lng, fresh, accuracy in range.
 *
 * Freshness is proved one of two ways:
 *   1. `ageMs` — milliseconds since capture, computed on-device as
 *      `Date.now() - fix.timestamp` at request send time. This is clock-skew
 *      immune: both values come from the same device clock so drift cancels.
 *      Preferred when present.
 *   2. `capturedAt` — device wall-clock timestamp. Checked against server time
 *      with FALLBACK_CLOCK_SKEW_TOLERANCE_MS tolerance for drifted phones.
 *      Only used when `ageMs` is absent (older APKs).
 *
 * Returns null when the payload is missing or fails validation.
 *
 * Options:
 *   - maxAccuracyM: override the accuracy ceiling (going-online uses 500m,
 *     heartbeat/matching uses the strict 150m default).
 */
export function parseClientGpsFix(input, nowMs = Date.now(), options = {}) {
  if (!input || typeof input !== 'object') return null;
  const maxAccuracy = options.maxAccuracyM ?? REAL_FIX_MAX_ACCURACY_M;

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const accuracy =
    input.accuracy == null || input.accuracy === '' ? 0 : Number(input.accuracy);
  if (!isUsableLatLng(lat, lng)) return null;
  if (
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > REAL_FIX_ACCURACY_HARD_MAX_M ||
    accuracy > maxAccuracy
  ) {
    return null;
  }

  // Path 1: ageMs (preferred, clock-skew immune).
  if (input.ageMs != null && input.ageMs !== '') {
    const ageMs = Number(input.ageMs);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > REAL_FIX_MAX_AGE_MS) {
      return null;
    }
    return { lat, lng, accuracy, capturedAt: new Date(nowMs - ageMs) };
  }

  // Path 2: capturedAt fallback for older APKs. A phone whose wall clock is
  // drifted within FALLBACK_CLOCK_SKEW_TOLERANCE_MS of server time passes;
  // when its reported capturedAt is outside the strict freshness window we
  // store server-now instead of the drifted value so matching freshness is
  // measured against our own clock.
  const capturedMs = toMillis(input.capturedAt);
  if (capturedMs == null) return null;
  const skewFromServer = Math.abs(nowMs - capturedMs);
  if (skewFromServer > FALLBACK_CLOCK_SKEW_TOLERANCE_MS) return null;
  const storedCapturedMs = skewFromServer <= REAL_FIX_MAX_AGE_MS ? capturedMs : nowMs;
  return { lat, lng, accuracy, capturedAt: new Date(storedCapturedMs) };
}

/**
 * Going-online body.
 * - no GPS fields → not rejected; caller may accept a fresh stored fix
 * - GPS fields that fail validation → rejected (do not fall through)
 * - valid fix → use it
 *
 * Uses the looser GO_ONLINE_MAX_ACCURACY_M ceiling: the driver is deciding to
 * start driving, GPS will refine as they move, and the strict 150m ceiling
 * excludes real fixes that are just still warming up.
 */
export function readGoOnlineBody(body, nowMs = Date.now()) {
  if (!hasClientGpsFields(body)) return { fix: null, rejected: false };
  const fix = parseClientGpsFix(body, nowMs, { maxAccuracyM: GO_ONLINE_MAX_ACCURACY_M });
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
