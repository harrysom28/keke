/** Shared guards for rider/driver active-ride API payloads (terminal status, restorable, staleness). */

export const ACTIVE_RIDE_TERMINAL_STATUSES = [
  "completed",
  "cancelled",
  "canceled",
  "rejected",
  "failed",
  "expired",
  "done",
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
  "issue_flagged",
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
