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
