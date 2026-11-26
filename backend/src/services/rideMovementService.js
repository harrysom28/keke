/**
 * KEKE — Driver movement detection (abuse guard) + transition to driver_en_route on first GPS ping after accept.
 */

import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import { calculateDistance } from '../utils/geolocation.js';
import logger from '../utils/logger.js';

const APPROACH_THRESHOLD_MINUTES = 5;
const NOT_APPROACHING_RATIO = 0.85;
const MAX_HISTORY_LENGTH = 50;

function distanceToPickupMeters(ride, lat, lng) {
  const coords = ride.pickupLocation?.coordinates;
  if (!coords || coords.length < 2) return null;
  const pickupLng = coords[0];
  const pickupLat = coords[1];
  const km = calculateDistance(pickupLat, pickupLng, lat, lng);
  return Math.round(km * 1000);
}

export async function updateDriverLocationForAcceptedRide(driverId, driverLocation) {
  let ride = await Ride.findOne({
    driver: driverId,
    status: { $in: ['accepted', 'driver_en_route', 'in-progress'] },
  }).lean();

  if (!ride) return;

  // During an active trip, just bump the trip-level ping timestamp.
  // Everything below (driverLocationHistory, movement flag, en-route
  // transition) only makes sense for the pre-pickup phase. Without this,
  // staleTripService flags every long trip as "stale_timeout" because
  // nothing else writes to the Ride doc during in-progress.
  if (ride.status === 'in-progress') {
    await Ride.updateOne(
      { _id: ride._id, status: 'in-progress' },
      { $set: { lastDriverLocationAt: new Date() } }
    );
    return;
  }

  if (!ride.pickupLocation?.coordinates?.length) return;

  if (ride.status === 'accepted') {
    const t = new Date();
    const transitioned = await Ride.findOneAndUpdate(
      { _id: ride._id, status: 'accepted' },
      {
        $set: { status: 'driver_en_route' },
        $push: {
          statusHistory: {
            status: 'driver_en_route',
            timestamp: t,
            note: 'Driver en route (GPS)',
          },
        },
      },
      { new: true }
    )
      .populate('rider', 'name phone profileImage rating')
      .populate('vehicleType');

    if (transitioned) {
      try {
        const { getSocketService } = await import('./socketService.js');
        const driverDoc = await Driver.findById(driverId).populate('user');
        const socketService = getSocketService();
        if (socketService && driverDoc) {
          await socketService.emitRideStatusUpdate(transitioned, 'driver_en_route', driverDoc);
        }
      } catch (e) {
        logger.warn(`driver_en_route socket emit: ${e.message}`);
      }
      ride = transitioned.toObject ? transitioned.toObject() : transitioned;
    }
  }

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
