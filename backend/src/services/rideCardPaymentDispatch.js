/**
 * Start driver search after a card ride is paid.
 * Kept separate so requestRide can skip dispatch until Paystack verifies.
 */
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import rideMatchingService, { getVehicleTypeId } from './rideMatchingService.js';
import {
  dispatchRide,
  notifyNoDriverFound,
} from './driverNotificationService.js';
import { RIDER_MATCH_SEARCH_RADIUS_KM } from '../utils/driverSearchRadius.js';

/**
 * @param {string|import('mongoose').Types.ObjectId} rideId
 * @returns {Promise<{ drivers_notified: number }>}
 */
export async function startRideSearchAfterCardPayment(rideId) {
  const ride = await Ride.findById(rideId)
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType', 'name displayName image');

  if (!ride) {
    logger.warn(`startRideSearchAfterCardPayment: ride ${rideId} not found`);
    return { drivers_notified: 0 };
  }

  if (ride.isScheduled) {
    logger.info(
      `startRideSearchAfterCardPayment: ride ${ride._id} is scheduled — no immediate dispatch`
    );
    return { drivers_notified: 0 };
  }

  if (!['searching', 'requested'].includes(String(ride.status))) {
    logger.info(
      `startRideSearchAfterCardPayment: ride ${ride._id} status=${ride.status} — skip dispatch`
    );
    return { drivers_notified: 0 };
  }

  const preferredDriverId = ride.preferredDriver?.toString?.() || ride.preferredDriver;
  let matchedDrivers = [];
  let usedPreferredDriver = false;

  if (preferredDriverId) {
    try {
      const preferred = await Driver.findById(preferredDriverId)
        .populate('user', 'name deviceToken fcm_token role')
        .populate('vehicleDetails.vehicleType');

      if (preferred?.isOnline && preferred?.isAvailable) {
        const rideVehicleTypeId = getVehicleTypeId(ride.vehicleType);
        const preferredVehicleTypeId = getVehicleTypeId(
          preferred.vehicleDetails?.vehicleType
        );
        const sameVehicle =
          !rideVehicleTypeId ||
          !preferredVehicleTypeId ||
          preferredVehicleTypeId === rideVehicleTypeId;

        if (sameVehicle && String(preferred.user?.role || '') === 'driver') {
          matchedDrivers = [{ driver: preferred, score: 100, distance: 0 }];
          usedPreferredDriver = true;
        }
      }
    } catch (err) {
      logger.warn(
        `startRideSearchAfterCardPayment: preferred driver failed for ${ride._id}: ${err.message}`
      );
    }
  }

  if (matchedDrivers.length === 0) {
    matchedDrivers = await rideMatchingService.findAndMatchDrivers(
      ride,
      RIDER_MATCH_SEARCH_RADIUS_KM,
      5
    );
  }

  logger.info(
    `Card-paid ride ${ride._id} dispatching to ${matchedDrivers.length} driver(s)`
  );

  if (matchedDrivers.length > 0) {
    setImmediate(() => {
      dispatchRide(ride, matchedDrivers, usedPreferredDriver ? { maxOffers: 1 } : {}).catch(
        (err) => logger.error(`dispatchRide after card pay failed: ${err.message}`)
      );
    });
  } else {
    setImmediate(() => {
      notifyNoDriverFound(ride).catch((err) =>
        logger.error(`notifyNoDriverFound after card pay failed: ${err.message}`)
      );
    });
  }

  return { drivers_notified: matchedDrivers.length };
}
