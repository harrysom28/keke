export type RideCancelActor = "rider" | "driver" | "system";

const RIDER_CANCEL_SUPPRESS_MS = 5000;
let suppressRiderCancelToastUntil = 0;

/** Call after the rider successfully cancels via API to avoid duplicate Pusher toasts. */
export function suppressRiderCancelToast(ms = RIDER_CANCEL_SUPPRESS_MS): void {
  suppressRiderCancelToastUntil = Date.now() + ms;
}

export function shouldSuppressRiderCancelToast(): boolean {
  return Date.now() < suppressRiderCancelToastUntil;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

/** Infer who cancelled from Pusher / notification payload fields. */
export function resolveRideCancelledActor(
  payload?: Record<string, unknown> | null
): RideCancelActor {
  if (!payload || typeof payload !== "object") {
    return "driver";
  }

  const reason = normalizeKey(payload.reason);
  const status = normalizeKey(
    payload.internal_status ?? payload.status ?? payload.ride_status
  );
  if (
    reason === "no_driver" ||
    reason === "no_show" ||
    reason === "timeout" ||
    reason === "expired" ||
    status === "no_driver_found" ||
    status === "expired"
  ) {
    return "system";
  }

  const cancelledBy = normalizeKey(
    payload.cancelled_by ?? payload.cancelledBy ?? payload.canceled_by
  );
  if (cancelledBy === "rider" || cancelledBy === "passenger" || cancelledBy === "user") {
    return "rider";
  }
  if (cancelledBy === "driver") {
    return "driver";
  }
  if (cancelledBy === "system" || cancelledBy === "admin") {
    return "system";
  }

  const subType = normalizeKey(
    payload.subType ?? payload.sub_type ?? payload.event_key ?? payload.eventKey
  );
  if (
    subType === "passenger_cancelled" ||
    subType === "ride_cancelled_by_rider" ||
    subType === "rider_cancelled"
  ) {
    return "rider";
  }
  if (
    subType === "driver_cancelled" ||
    subType === "ride_cancelled_by_driver"
  ) {
    return "driver";
  }
  if (
    subType === "ride_cancelled_no_driver" ||
    subType === "ride_cancelled_no_show" ||
    subType === "no_driver_found"
  ) {
    return "system";
  }

  // Generic ride_cancelled without actor — treat as rider (self) on rider app
  // unless rematching (driver dropped before pickup).
  if (subType === "ride_cancelled") {
    const rematching = status === "searching" || status === "requested";
    return rematching ? "driver" : "rider";
  }

  return "driver";
}

export function getRiderAppCancelToastMessage(
  actor: RideCancelActor,
  rematching: boolean,
  reason?: unknown
): { type: "success" | "danger" | "warning" | "info"; message: string } {
  const reasonNorm = normalizeKey(reason);

  if (actor === "rider") {
    return { type: "success", message: "Ride cancelled" };
  }

  if (actor === "system") {
    if (reasonNorm === "no_driver") {
      return {
        type: "warning",
        message: "No driver found. Please try again.",
      };
    }
    if (reasonNorm === "no_show") {
      return {
        type: "info",
        message: "Ride cancelled — driver did not arrive in time.",
      };
    }
    return { type: "info", message: "Ride cancelled" };
  }

  if (rematching) {
    return {
      type: "danger",
      message: "Your driver cancelled. Finding another driver…",
    };
  }

  return {
    type: "danger",
    message: "Your driver has cancelled the ride",
  };
}
