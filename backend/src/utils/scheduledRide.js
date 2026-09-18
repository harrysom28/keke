/**
 * Shared scheduled-ride matching window.
 * Used by the 60s poller and by driver-cancel rematch so they cannot drift.
 */
export const SCHEDULED_DISPATCH_LEAD_MS = 5 * 60 * 1000;

/**
 * True when pickup is within the dispatch lead (or already overdue).
 * Missing/invalid scheduledAt is treated as due so we rematch immediately.
 */
export function isScheduledRideInDispatchWindow(scheduledAt, now = new Date()) {
  if (!scheduledAt) return true;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return true;
  return t <= now.getTime() + SCHEDULED_DISPATCH_LEAD_MS;
}

export function isScheduledRideOverdue(scheduledAt, now = new Date()) {
  if (!scheduledAt) return true;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return true;
  return t < now.getTime();
}
