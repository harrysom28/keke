import { calculateDistanceMeters } from './geolocation.js';

/**
 * Server-side decision for "is the driver close enough to end the trip?".
 *
 * The client only reports a position. Every threshold and every decision lives here
 * (radii come from admin settings `dropoff.*`), so the app can never widen them.
 *
 * Tiers:
 *   free          distance <= max(freeRadius, accuracy + 50)   -> end with no friction
 *   reason        above free, <= confirmRadius                 -> driver must give a reason
 *   rider         above confirmRadius                          -> rider must confirm
 *   unverifiable  no usable position                           -> may end, always flagged
 */

export const DROPOFF_END_REASONS = ['rider_requested_stop', 'pin_inaccurate', 'road_blocked', 'other'];

export const DROPOFF_FLAG_FAR = 'dropoff_far_from_destination';
export const DROPOFF_FLAG_UNVERIFIED = 'dropoff_unverified';
export const DROPOFF_FLAG_DISPUTED = 'dropoff_disputed';

/** A live fix with a worse accuracy than this (meters) is not trusted. */
export const LIVE_FIX_MAX_ACCURACY_M = 150;
/** Padding added to the reported GPS accuracy when widening the free radius. */
export const FREE_ACCURACY_PADDING_M = 50;
/** The saved driver location must be newer than this to be used at all. */
export const SAVED_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
/** A saved location newer than this is "fresh" enough to cross-check a live fix against. */
export const SAVED_LOCATION_FRESH_MS = 60 * 1000;
/** Live fix further than this from a fresh saved location is treated as spoofed/teleported. */
export const LIVE_FIX_MAX_JUMP_M = 3000;

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Valid WGS84 pair that is not the "never set" [0, 0] placeholder. */
export function isUsableLatLng(lat, lng) {
  return (
    isFiniteNumber(lat) &&
    isFiniteNumber(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Destination of a ride as { lat, lng } or null. */
export function getDropoffLatLng(ride) {
  const loc = ride?.dropoffLocation;
  const c = loc?.coordinates;
  if (Array.isArray(c) && c.length >= 2) {
    const lng = Number(c[0]);
    const lat = Number(c[1]);
    if (isUsableLatLng(lat, lng)) return { lat, lng };
  }
  if (loc?.long != null && loc?.lat != null) {
    const lng = parseFloat(loc.long);
    const lat = parseFloat(loc.lat);
    if (isUsableLatLng(lat, lng)) return { lat, lng };
  }
  return null;
}

function toMillis(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return n;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Saved Driver.currentLocation -> { lat, lng, ageMs } or null (missing, placeholder, or too old). */
function readSavedLocation(currentLocation, nowMs) {
  const c = currentLocation?.coordinates;
  if (!Array.isArray(c) || c.length < 2) return null;
  const lng = Number(c[0]);
  const lat = Number(c[1]);
  if (!isUsableLatLng(lat, lng)) return null;
  const updatedMs = toMillis(currentLocation?.lastUpdated);
  if (updatedMs == null) return null;
  const ageMs = nowMs - updatedMs;
  if (ageMs > SAVED_LOCATION_MAX_AGE_MS) return null;
  return { lat, lng, ageMs };
}

/**
 * Pick the position to judge the driver by.
 *
 * Priority: (a) live fix from the request, (b) saved Driver.currentLocation, (c) none.
 * `suspicious` means a live fix was supplied but had to be ignored for a trust reason
 * (mocked, too old, impossible jump, malformed) - the caller flags the ride dropoff_unverified.
 */
export function pickDropoffPosition({ liveFix, savedLocation, settings, nowMs = Date.now() }) {
  const maxAgeMs = Math.max(1, Number(settings?.liveFixMaxAgeSeconds ?? 30)) * 1000;
  const saved = readSavedLocation(savedLocation, nowMs);

  let suspicious = false;
  let ignoredLiveReason = null;
  let live = null;

  if (liveFix && typeof liveFix === 'object') {
    const lat = Number(liveFix.lat);
    const lng = Number(liveFix.lng);
    const accuracy = liveFix.accuracy == null ? 0 : Number(liveFix.accuracy);
    const capturedMs = toMillis(liveFix.capturedAt);

    if (liveFix.mocked === true) {
      suspicious = true;
      ignoredLiveReason = 'mocked';
    } else if (!isUsableLatLng(lat, lng) || !Number.isFinite(accuracy) || accuracy < 0 || capturedMs == null) {
      suspicious = true;
      ignoredLiveReason = 'invalid';
    } else if (Math.abs(nowMs - capturedMs) > maxAgeMs) {
      suspicious = true;
      ignoredLiveReason = 'stale';
    } else if (accuracy > LIVE_FIX_MAX_ACCURACY_M) {
      // Honest but poor GPS: just fall back to the saved position, no suspicion.
      ignoredLiveReason = 'inaccurate';
    } else if (
      saved &&
      saved.ageMs <= SAVED_LOCATION_FRESH_MS &&
      calculateDistanceMeters(lat, lng, saved.lat, saved.lng) > LIVE_FIX_MAX_JUMP_M
    ) {
      suspicious = true;
      ignoredLiveReason = 'jump';
    } else {
      live = { lat, lng, accuracy };
    }
  }

  if (live) {
    return { lat: live.lat, lng: live.lng, accuracy: live.accuracy, source: 'live', suspicious, ignoredLiveReason };
  }
  if (saved) {
    return { lat: saved.lat, lng: saved.lng, accuracy: 0, source: 'saved', suspicious, ignoredLiveReason };
  }
  return { lat: null, lng: null, accuracy: null, source: null, suspicious, ignoredLiveReason };
}

/**
 * Measure the driver against the ride destination and decide the tier.
 *
 * @param {object} args
 * @param {object} args.ride            ride doc/lean (dropoffLocation)
 * @param {object} [args.savedLocation] Driver.currentLocation
 * @param {object} [args.liveFix]       { lat, lng, accuracy, capturedAt, mocked } from the request
 * @param {object} args.settings        getSettings().dropoff
 */
export function measureDropoff({ ride, savedLocation, liveFix, settings, nowMs = Date.now() }) {
  const freeRadiusMeters = Number(settings?.freeRadiusMeters ?? 500);
  const confirmRadiusMeters = Number(settings?.confirmRadiusMeters ?? 3000);

  const destination = getDropoffLatLng(ride);
  const position = pickDropoffPosition({ liveFix, savedLocation, settings, nowMs });

  const base = {
    freeRadiusMeters,
    confirmRadiusMeters,
    freeLimitMeters: freeRadiusMeters,
    distanceMeters: null,
    source: position.source,
    accuracy: position.source === 'live' ? position.accuracy : null,
    suspicious: position.suspicious,
    ignoredLiveReason: position.ignoredLiveReason,
  };

  if (!destination || position.source == null) {
    return { ...base, tier: 'unverifiable', unverified: true };
  }

  const distanceMeters = calculateDistanceMeters(position.lat, position.lng, destination.lat, destination.lng);
  const accuracy = position.source === 'live' ? position.accuracy : 0;
  const freeLimitMeters = Math.max(freeRadiusMeters, accuracy + FREE_ACCURACY_PADDING_M);

  let tier = 'rider';
  if (distanceMeters <= freeLimitMeters) tier = 'free';
  else if (distanceMeters <= confirmRadiusMeters) tier = 'reason';

  return {
    ...base,
    tier,
    distanceMeters,
    freeLimitMeters,
    unverified: position.suspicious,
  };
}

/** Public numbers that go into 409 bodies (never trust the client with more than this). */
export function dropoffErrorNumbers(measure) {
  return {
    distance_meters: measure.distanceMeters,
    free_radius_meters: measure.freeLimitMeters ?? measure.freeRadiusMeters,
    confirm_radius_meters: measure.confirmRadiusMeters,
  };
}

/**
 * Fields to persist on the ride for a measurement.
 * `reason` is the Tier 2 driver reason. A Tier 3 completion (rider confirmed) gets no far flag.
 * Flag precedence: unverified > far. Returns `flag: undefined` when nothing should change.
 */
export function proximityFieldsForCompletion(measure, { reason = null } = {}) {
  const fields = {
    dropoff_distance_from_destination: measure.distanceMeters,
    dropoff_distance_source: measure.source,
    dropoff_live_accuracy: measure.source === 'live' ? measure.accuracy : null,
    dropoff_end_reason: null,
  };

  let flag;
  if (measure.tier === 'free') {
    fields.dropoff_proximity_status = 'confirmed';
  } else if (measure.tier === 'unverifiable') {
    fields.dropoff_proximity_status = 'unverifiable';
    flag = DROPOFF_FLAG_UNVERIFIED;
  } else {
    fields.dropoff_proximity_status = 'unlikely';
    if (measure.tier === 'reason') {
      fields.dropoff_end_reason = reason;
      flag = DROPOFF_FLAG_FAR;
    }
  }

  if (measure.unverified) flag = DROPOFF_FLAG_UNVERIFIED;
  return { fields, flag };
}

// ── Old driver builds ─────────────────────────────────────────────────────────

/** Request body field the current driver app sends on "end trip". */
export const DROPOFF_FLOW_CURRENT = 2;

/**
 * True only when the request opts in to the tiered flow (`dropoff_flow >= 2`).
 * Old app builds never send it and must keep getting the old behaviour: they cannot
 * show the reason / ask-rider sheets, so they must never see the new 409 codes.
 */
export function usesCurrentDropoffFlow(value) {
  if (value == null || value === '') return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= DROPOFF_FLOW_CURRENT;
}

/**
 * The pre-tiering rule, kept verbatim for old app builds. Looks only at the saved
 * Driver.currentLocation (a position in the request body is ignored, as before):
 *   <= 200 m confirmed, <= 500 m probable, <= 1000 m unlikely (+ far flag), above: refused.
 *   no position, or one older than 5 minutes: unverifiable (the trip may end, no flag).
 */
export function measureLegacyDropoff({ ride, savedLocation, nowMs = Date.now() }) {
  const driverCoords = savedLocation?.coordinates; // [lng, lat]
  const loc = ride?.dropoffLocation;
  let dropoffCoords = null;
  if (Array.isArray(loc?.coordinates) && loc.coordinates.length >= 2) {
    dropoffCoords = [Number(loc.coordinates[0]), Number(loc.coordinates[1])];
  } else if (loc?.long && loc?.lat) {
    dropoffCoords = [parseFloat(loc.long), parseFloat(loc.lat)];
  }

  const result = { status: 'unverifiable', distanceMeters: null, refused: false, flag: null };
  const driverOk = Array.isArray(driverCoords) && driverCoords.length >= 2 && driverCoords.every((v) => Number.isFinite(Number(v)));
  const dropoffOk = dropoffCoords && dropoffCoords.every((v) => Number.isFinite(v));
  if (!driverOk || !dropoffOk) return result;

  const lastUpdated = savedLocation?.lastUpdated;
  const isStale = lastUpdated && nowMs - new Date(lastUpdated).getTime() > SAVED_LOCATION_MAX_AGE_MS;
  if (isStale) return result;

  const distanceMeters = calculateDistanceMeters(
    Number(driverCoords[1]),
    Number(driverCoords[0]),
    dropoffCoords[1],
    dropoffCoords[0]
  );
  result.distanceMeters = distanceMeters;
  if (distanceMeters <= 200) result.status = 'confirmed';
  else if (distanceMeters <= 500) result.status = 'probable';
  else if (distanceMeters <= 1000) {
    result.status = 'unlikely';
    result.flag = DROPOFF_FLAG_FAR;
  } else {
    result.refused = true;
  }
  return result;
}
