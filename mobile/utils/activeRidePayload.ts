/** Shared guards for rider/driver active-ride API payloads (terminal status, restorable, staleness). */

export const ACTIVE_RIDE_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "canceled",
  "rejected",
  "failed",
  "expired",
  "done",
  /** Trip ended for review (stale timeout, driver offline, etc.) — not an active ride. */
  "issue_flagged",
] as const;

export const ACTIVE_RIDE_RESTORABLE_STATUSES = [
  "requested",
  "searching",
  "scheduled",
  "accepted",
  "driver_en_route",
  "arrived",
  "started",
  "in-progress",
  "in_progress",
] as const;

export const STALE_ACTIVE_RIDE_MS = 2 * 60 * 60 * 1000;

export function getRideStatusLower(ride: Record<string, unknown>): string {
  const raw = ride.status;
  return typeof raw === "string"
    ? raw.toLowerCase()
    : String(raw ?? "").toLowerCase();
}

export function getActiveRideId(
  ride: Record<string, unknown> | null | undefined
): string | null {
  if (!ride || typeof ride !== "object") return null;
  const id = ride.ride_id ?? ride._id;
  if (id == null || id === "") return null;
  return String(id);
}

export function parseRideFreshnessTimestamp(
  ride: Record<string, unknown>
): number | null {
  const raw =
    ride.updated_at ??
    ride.updatedAt ??
    ride.created_at ??
    ride.createdAt;
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

export function isActiveRidePayloadStale(ride: Record<string, unknown>): boolean {
  const ts = parseRideFreshnessTimestamp(ride);
  if (ts == null) return false;
  return Date.now() - ts > STALE_ACTIVE_RIDE_MS;
}

export function isTerminalRideStatus(status: string): boolean {
  return (ACTIVE_RIDE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isRestorableRideStatus(status: string): boolean {
  return (ACTIVE_RIDE_RESTORABLE_STATUSES as readonly string[]).includes(status);
}

/** Status strings the API uses while no driver is locked in yet (see backend mapRideStatusForClientApi). */
const RIDER_MATCHING_PHASE_STATUSES = ["requested", "searching", "pending"];

/**
 * True once a driver is assigned / ride left the “finding driver” phase.
 * Prefer this over `accepted_by_driver` alone — some payloads briefly lag the boolean
 * after Pusher/events, which kept the per-driver countdown UI stuck until the next poll.
 */
export function isRiderMatchedOrBeyond(
  ride: Record<string, unknown> | null | undefined
): boolean {
  if (!ride || typeof ride !== "object") return false;
  const r = ride as Record<string, unknown>;
  if (r.accepted_by_driver === true || r.acceptedByDriver === true) return true;

  const st = getRideStatusLower(r);
  const driverIdRaw = r.driver_id ?? r.driverId;
  const driverId =
    driverIdRaw != null && String(driverIdRaw).trim() !== ""
      ? String(driverIdRaw).trim()
      : "";

  const drv = r.driver;
  const hasDriverPayload =
    drv != null &&
    typeof drv === "object" &&
    Object.keys(drv as object).length > 0;

  if (driverId || hasDriverPayload) {
    return true;
  }

  if (!st || RIDER_MATCHING_PHASE_STATUSES.includes(st)) {
    return false;
  }

  return true;
}
