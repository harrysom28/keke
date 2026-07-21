import Driver from '../models/Driver.js';

/**
 * Return a driver to the matching pool after a trip ends, is cancelled, or is flagged.
 * Keeps is_online true so the dashboard does not stay on "On a trip" until manual toggle.
 */
export async function restoreDriverAvailabilityAfterTrip(driverIdOrDoc) {
  const driver =
    driverIdOrDoc && typeof driverIdOrDoc.save === 'function'
      ? driverIdOrDoc
      : driverIdOrDoc
        ? await Driver.findById(driverIdOrDoc)
        : null;

  if (!driver) {
    return false;
  }

  driver.isAvailable = true;
  driver.isOnline = true;
  driver.lastActiveAt = new Date();
  if (!driver.onlineSessionStartedAt) {
    driver.onlineSessionStartedAt = new Date();
  }

  await driver.save();
  return true;
}

/**
 * Drivers start offline after login so they must opt in (and see location prompts).
 * Skips if the driver has an active trip.
 */
export async function forceDriverOfflineOnLogin(userId) {
  if (!userId) return false;
  const driver = await Driver.findOne({ user: userId }).select('_id');
  if (!driver) return false;

  try {
    const Ride = (await import('../models/Ride.js')).default;
    const activeRide = await Ride.findActiveRideForDriver?.(driver._id);
    if (activeRide) return false;
  } catch {
    // If ride lookup fails, still prefer starting offline after login.
  }

  const result = await Driver.updateOne(
    { _id: driver._id },
    {
      $set: {
        isOnline: false,
        isAvailable: false,
        onlineSessionStartedAt: null,
      },
    }
  );
  return (result.modifiedCount || result.nModified || 0) > 0;
}
