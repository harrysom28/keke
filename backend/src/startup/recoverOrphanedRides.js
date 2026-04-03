import Ride from '../models/Ride.js';
import { cancelUnacceptedRide, notifyNoDriverFound } from '../services/driverNotificationService.js';
import logger from '../utils/logger.js';

let intervalId = null;

/**
 * Cancel on-demand rides stuck in `requested` with no driver (e.g. process crash during offer queue).
 * Uses age cutoff > sequential-offer MAX_TTL (90s) so normal flows are not interrupted.
 */
export async function recoverOrphanedRides() {
  const ageMs = Number(process.env.ORPHANED_RIDE_AGE_MS) || 3 * 60 * 1000;
  const cutoff = new Date(Date.now() - ageMs);
  const stuck = await Ride.find({
    status: 'requested',
    isScheduled: false,
    driver: null,
    createdAt: { $lt: cutoff },
  }).populate('rider', 'name phone');

  if (stuck.length === 0) return;

  logger.warn(`Found ${stuck.length} orphaned rides — recovering`);

  for (const ride of stuck) {
    try {
      await cancelUnacceptedRide(ride._id);
      const after = await Ride.findById(ride._id).populate('rider', 'name phone');
      if (after?.status === 'cancelled') {
        await notifyNoDriverFound(after);
        logger.info(`Recovered orphaned ride ${ride._id}`);
      }
    } catch (err) {
      logger.error(`Failed to recover ride ${ride._id}: ${err.message}`);
    }
  }
}

export function startOrphanedRideRecovery() {
  if (process.env.NODE_ENV === 'test' || process.env.DISABLE_ORPHANED_RIDE_RECOVERY === 'true') {
    return;
  }
  if (intervalId) {
    clearInterval(intervalId);
  }
  const intervalMs = Number(process.env.ORPHANED_RIDE_RECOVERY_INTERVAL_MS) || 120_000;
  setImmediate(() => {
    recoverOrphanedRides().catch((e) => logger.error(`recoverOrphanedRides: ${e.message}`));
  });
  intervalId = setInterval(() => {
    recoverOrphanedRides().catch((e) => logger.error(`recoverOrphanedRides: ${e.message}`));
  }, intervalMs);
  logger.info(
    `Orphaned ride recovery: interval ${intervalMs}ms, min age ${Number(process.env.ORPHANED_RIDE_AGE_MS) || 3 * 60 * 1000}ms`
  );
}

export function stopOrphanedRideRecovery() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
