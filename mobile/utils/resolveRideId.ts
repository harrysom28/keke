/**
 * Normalize ride id from API / Redux shapes (ride_id, rideId, _id).
 */
export function resolveRideId(
  source: Record<string, unknown> | null | undefined
): string {
  if (!source || typeof source !== "object") return "";
  const raw =
    source.ride_id ??
    source.rideId ??
    source._id ??
    source.id;
  if (raw == null) return "";
  const id = String(raw).trim();
  return id;
}

/** MongoDB ObjectId is 24 hex chars. */
export function isValidMongoRideId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(String(id || "").trim());
}
