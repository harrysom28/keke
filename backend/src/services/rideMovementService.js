/**
 * KEKE — Driver movement detection (abuse guard).
 * When driver location is updated after accepting a ride, record distance to pickup.
 * If after 5+ minutes driver hasn't moved meaningfully closer, flag ride so rider can cancel free.
 */

import Ride from '../models/Ride.js';
import { calculateDistance } from '../utils/geolocation.js';
import logger from '../utils/logger.js';

const APPROACH_THRESHOLD_MINUTES = 5;
const NOT_APPROACHING_RATIO = 0.85;
const MAX_HISTORY_LENGTH = 50;

/**
 * Distance in meters from point to ride pickup.
 */
function distanceToPickupMeters(ride, lat, lng) {
  const coords = ride.pickupLocation?.coordinates;
  if (!coords || coords.length < 2) return null;
  const pickupLng = coords[0];
  const pickupLat = coords[1];
  const km = calculateDistance(pickupLat, pickupLng, lat, lng);
  return Math.round(km * 1000);
}

/**
 * Called when driver location is updated. If driver has an active ride in status 'accepted',
 * append to driverLocationHistory and set driverMovementFlag if not approaching after 5 min.
 * @param {string} driverId - Driver _id (Driver model)
 * @param {{ lat: number, lng: number }} driverLocation
 */
export async function updateDriverLocationForAcceptedRide(driverId, driverLocation) {
  const ride = await Ride.findOne({
    driver: driverId,
    status: 'accepted',
  }).lean();

  if (!ride || !ride.pickupLocation?.coordinates?.length) return;

  const distanceMeters = distanceToPickupMeters(ride, driverLocation.lat, driverLocation.lng);
  if (distanceMeters == null) return;

  const acceptedAt = ride.acceptedAt ? new Date(ride.acceptedAt).getTime() : Date.now();
  const minutesSinceAccepted = (Date.now() - acceptedAt) / 60000;

  const update = {
    $push: {
      driverLocationHistory: {
        $each: [
          {
            coords: { lat: driverLocation.lat, lng: driverLocation.lng },
            distance: distanceMeters,
            timestamp: new Date(),
          },
        ],
        $slice: -MAX_HISTORY_LENGTH,
      },
    },
  };

  if (minutesSinceAccepted >= APPROACH_THRESHOLD_MINUTES && ride.driverMovementFlag !== 'not_approaching') {
    const history = ride.driverLocationHistory || [];
    const firstEntry = history[0];
    const firstDistance = firstEntry?.distance ?? distanceMeters;
    const isNotMoving = distanceMeters >= firstDistance * NOT_APPROACHING_RATIO;
    if (isNotMoving) {
      update.$set = { driverMovementFlag: 'not_approaching' };
      logger.info(`Ride ${ride._id} flagged: driver not approaching pickup after ${Math.round(minutesSinceAccepted)} min`);
    }
  }

  await Ride.updateOne({ _id: ride._id }, update);
}
