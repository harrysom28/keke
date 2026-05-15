import {
  getActiveRideId,
  getRideStatusLower,
  isRiderMatchedOrBeyond,
} from "@/utils/activeRidePayload";

/** Driver / user string fields we never let a patch or stale GET wipe with null/empty when we already had a value. */
const DRIVER_MERGE_STRING_KEYS = [
  "driver_name",
  "name",
  "full_name",
  "fullName",
  "driver_image",
  "image",
  "vehicle_name",
  "vehicleName",
  "vehicle_color",
  "licence_plate_number",
  "license_plate_number",
  "vehicle_make",
  "vehicle_model",
  "vehicle_type",
  "phone",
] as const;

function isEmptyish(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

/**
 * Like `{ ...prev, ...inc }` but keeps non-empty `prev` display strings when `inc` sends null/""/omitted
 * (common when GET active-ride lags population or Pusher sends a partial driver object).
 */
export function mergeDriverPreferNonEmpty(
  prev: Record<string, unknown> | null | undefined,
  inc: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!inc && !prev) return null;
  if (!prev || typeof prev !== "object") return inc && typeof inc === "object" ? { ...inc } : null;
  if (!inc || typeof inc !== "object") return { ...prev };

  const merged: Record<string, unknown> = { ...prev, ...inc };

  for (const key of DRIVER_MERGE_STRING_KEYS) {
    if (isEmptyish(inc[key]) && !isEmptyish(prev[key])) {
      merged[key] = prev[key];
    }
  }

  const pU = prev.user;
  const iU = inc.user;
  if (pU && typeof pU === "object" && !Array.isArray(pU) && iU && typeof iU === "object" && !Array.isArray(iU)) {
    const u = { ...(pU as object), ...(iU as object) } as Record<string, unknown>;
    if (isEmptyish((iU as { name?: unknown }).name) && !isEmptyish((pU as { name?: unknown }).name)) {
      u.name = (pU as { name?: unknown }).name;
    }
    if (isEmptyish((iU as { profileImage?: unknown }).profileImage) && !isEmptyish((pU as { profileImage?: unknown }).profileImage)) {
      u.profileImage = (pU as { profileImage?: unknown }).profileImage;
    }
    merged.user = u;
  }

  return merged;
}

/**
 * Merge backend `emitRideStatusUpdate` payloads (`ride.status` on private.ride.*)
 * into the rider's active-ride object so UI advances before GET active-ride catches up.
 */
export function mergePusherRideStatusPatch(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const incomingId = String(patch.ride_id ?? patch.rideId ?? "").trim();
  const existingId = String(getActiveRideId(existing) ?? "").trim();
  if (!incomingId || !existingId || incomingId !== existingId) {
    return existing;
  }

  const internalRaw = patch.internal_status;
  const internal =
    typeof internalRaw === "string"
      ? internalRaw.toLowerCase()
      : String(internalRaw ?? "").toLowerCase();
  const clientRaw = patch.status;
  const clientSt =
    typeof clientRaw === "string"
      ? clientRaw.toLowerCase()
      : String(clientRaw ?? "").toLowerCase();

  const drvPatch = patch.driver;
  const hasDriverObj =
    drvPatch != null &&
    typeof drvPatch === "object" &&
    !Array.isArray(drvPatch) &&
    Object.keys(drvPatch as object).length > 0;

  const internalPastMatching =
    internal !== "" &&
    internal !== "searching" &&
    internal !== "requested" &&
    internal !== "scheduled" &&
    internal !== "no-driver-found";

  const clientPastMatching = [
    "accepted",
    "arrived",
    "driver_arrived",
    "in-progress",
    "in_progress",
    "started",
  ].includes(clientSt);

  const pastMatching =
    hasDriverObj || internalPastMatching || clientPastMatching;

  const prevDriver = existing.driver;
  const mergedDriver = hasDriverObj
    ? mergeDriverPreferNonEmpty(
        typeof prevDriver === "object" && prevDriver
          ? (prevDriver as Record<string, unknown>)
          : null,
        drvPatch as Record<string, unknown>
      )
    : (prevDriver as Record<string, unknown> | null | undefined);

  const driverIdFromPatch =
    hasDriverObj && (drvPatch as { driver_id?: string }).driver_id != null
      ? String((drvPatch as { driver_id?: string }).driver_id)
      : null;

  const next: Record<string, unknown> = {
    ...existing,
    status: patch.status ?? existing.status,
    internal_status: patch.internal_status ?? existing.internal_status,
    lifecycle_status: patch.lifecycle_status ?? existing.lifecycle_status,
    ...(mergedDriver && Object.keys(mergedDriver).length > 0 ? { driver: mergedDriver } : {}),
    ...(driverIdFromPatch
      ? { driver_id: driverIdFromPatch }
      : {}),
  };

  if (pastMatching) {
    next.accepted_by_driver = true;
    next.acceptedByDriver = true;
  }

  return next;
}

/** Patch when driver cancels but ride returns to matching (not terminal). */
export function buildRideRematchingStatusPatch(
  rideId: string
): Record<string, unknown> {
  const id = String(rideId || "").trim();
  return {
    ride_id: id,
    rideId: id,
    status: "requested",
    internal_status: "searching",
    accepted_by_driver: false,
    acceptedByDriver: false,
    driver: null,
    driver_id: null,
    driverId: null,
  };
}

/** Optimistic patch when driver accepts — used when push arrives before Pusher/GET catch up. */
export function buildRideAcceptedStatusPatch(
  rideId: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const id = String(rideId || "").trim();
  const driverPatch = extra.driver;
  const hasDriverObj =
    driverPatch != null &&
    typeof driverPatch === "object" &&
    !Array.isArray(driverPatch) &&
    Object.keys(driverPatch as object).length > 0;

  return {
    ride_id: id,
    rideId: id,
    status: "accepted",
    internal_status: "accepted",
    lifecycle_status: "DRIVER_ASSIGNED",
    accepted_by_driver: true,
    acceptedByDriver: true,
    ...(extra.driver_id != null || extra.driverId != null
      ? { driver_id: String(extra.driver_id ?? extra.driverId) }
      : {}),
    ...(hasDriverObj ? { driver: driverPatch } : {}),
    ...extra,
  };
}

/**
 * If GET active-ride briefly lags Pusher (replica/caching), don't let a stale body
 * wipe acceptance/driver data we already know is true.
 */
export function reconcileStaleActiveRideGet(
  prev: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const prevId = String(getActiveRideId(prev) ?? "").trim();
  const incId = String(getActiveRideId(incoming) ?? "").trim();
  if (!prevId || !incId || prevId !== incId) {
    return incoming;
  }

  if (!isRiderMatchedOrBeyond(prev)) {
    return incoming;
  }

  if (isRiderMatchedOrBeyond(incoming)) {
    if (!isRiderMatchedOrBeyond(prev)) {
      return incoming;
    }
    const out: Record<string, unknown> = { ...incoming };
    const pd = prev.driver;
    const id = incoming.driver;
    const prevHasDriver =
      pd != null && typeof pd === "object" && !Array.isArray(pd) && Object.keys(pd as object).length > 0;
    const incHasDriver =
      id != null && typeof id === "object" && !Array.isArray(id) && Object.keys(id as object).length > 0;
    if (prevHasDriver && incHasDriver) {
      out.driver = mergeDriverPreferNonEmpty(
        pd as Record<string, unknown>,
        id as Record<string, unknown>
      );
    } else if (prevHasDriver && !incHasDriver) {
      out.driver = pd;
    }
    return out;
  }

  const merged: Record<string, unknown> = { ...incoming };
  merged.accepted_by_driver = true;
  merged.acceptedByDriver = true;

  const pd = prev.driver;
  const id = incoming.driver;
  const prevHasDriver =
    pd != null &&
    typeof pd === "object" &&
    Object.keys(pd as object).length > 0;
  const incHasDriver =
    id != null &&
    typeof id === "object" &&
    Object.keys(id as object).length > 0;
  if (prevHasDriver && !incHasDriver) {
    merged.driver = pd;
  }

  const prevDriverId = prev.driver_id ?? prev.driverId;
  const incDriverId = incoming.driver_id ?? incoming.driverId;
  if (prevDriverId != null && String(prevDriverId).trim() !== "" && !incDriverId) {
    merged.driver_id = prevDriverId;
  }

  const pst = getRideStatusLower(prev);
  const ist = getRideStatusLower(incoming);
  const prevLooksAhead =
    ["accepted", "arrived", "driver_arrived", "in-progress", "in_progress", "started"].includes(
      pst
    ) &&
    ["requested", "searching", "pending"].includes(ist);
  if (prevLooksAhead) {
    merged.status = prev.status ?? merged.status;
    merged.internal_status = prev.internal_status ?? merged.internal_status;
  }

  return merged;
}
