import logger from '../utils/logger.js';
import RideAuditLog from '../models/RideAuditLog.js';

export async function logRideAudit({ rideId, action, initiatedBy = null, initiatedByRole = null, details = {} }) {
  try {
    await RideAuditLog.create({
      ride: rideId,
      action,
      initiatedBy,
      initiatedByRole,
      details,
    });
  } catch (err) {
    logger.error(`Ride audit log failed (${action}) for ride ${rideId}: ${err.message}`);
    // Do not throw: audit log must not break ride resolution.
  }
}

export default { logRideAudit };

