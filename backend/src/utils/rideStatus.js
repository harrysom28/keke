/**
 * Canonical ride lifecycle (internal DB values) vs API compatibility for existing mobile clients.
 */

export const MATCHING_STATUSES = ['searching', 'requested'];

export const LIFECYCLE = {
  SEARCHING: 'SEARCHING',
  DRIVER_ASSIGNED: 'DRIVER_ASSIGNED',
  DRIVER_EN_ROUTE: 'DRIVER_EN_ROUTE',
  DRIVER_ARRIVED: 'DRIVER_ARRIVED',
  RIDE_STARTED: 'RIDE_STARTED',
  RIDE_COMPLETED: 'RIDE_COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_DRIVER_FOUND: 'NO_DRIVER_FOUND',
};

export function getLifecycleStatus(internal) {
  switch (internal) {
    case 'searching':
    case 'requested':
      return LIFECYCLE.SEARCHING;
    case 'scheduled':
      return 'SCHEDULED';
    case 'accepted':
      return LIFECYCLE.DRIVER_ASSIGNED;
    case 'driver_en_route':
      return LIFECYCLE.DRIVER_EN_ROUTE;
    case 'arrived':
      return LIFECYCLE.DRIVER_ARRIVED;
    case 'in-progress':
      return LIFECYCLE.RIDE_STARTED;
    case 'completed':
      return LIFECYCLE.RIDE_COMPLETED;
    case 'cancelled':
      return LIFECYCLE.CANCELLED;
    case 'no-driver-found':
      return LIFECYCLE.NO_DRIVER_FOUND;
    default:
      return internal ? String(internal).toUpperCase() : '';
  }
}

/** Rider/driver API `status` field — maps new internal states to legacy strings. */
export function mapRideStatusForClientApi(internal) {
  if (internal === 'searching') return 'requested';
  if (internal === 'driver_en_route') return 'accepted';
  return internal;
}

export function logRideLifecycle(logger, ride, extra = {}) {
  const r = ride?._doc || ride;
  if (!r?._id) return;
  const timestamps = {
    requested: r.createdAt,
    accepted: r.acceptedAt,
    arrived: r.arrivedAt,
    started: r.startedAt,
    completed: r.completedAt,
  };
  const requestedAt = r.createdAt ? new Date(r.createdAt).getTime() : null;
  const acceptedAt = r.acceptedAt ? new Date(r.acceptedAt).getTime() : null;
  let latency_ms = null;
  if (requestedAt && acceptedAt) latency_ms = acceptedAt - requestedAt;

  logger.info('ride_lifecycle', {
    rideId: r._id.toString(),
    status: r.status,
    lifecycle: getLifecycleStatus(r.status),
    driverId: r.driver?._id?.toString?.() || r.driver?.toString?.() || null,
    timestamps,
    latency_ms,
    ...extra,
  });
}
