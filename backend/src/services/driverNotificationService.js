import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';
import { getPusherService } from './pusherService.js';
import { sendToUser } from './notificationService.js';
import { cache } from '../config/redis.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import { processCancellation } from './escrowWalletService.js';
import { MATCHING_STATUSES } from '../utils/rideStatus.js';

const OFFER_WINDOW_MS = 15_000;
const MAX_PARALLEL_OFFERS = 2;
const MAX_TTL_MS = 90_000;

function buildRidePayload(ride) {
  return {
    ride_id: ride._id.toString(),
    event_key: 'ride_requested',
    rider: {
      name: ride.rider?.name,
      rating: ride.rider?.rating || 0,
    },
    pickup: {
      address: ride.pickupLocation.address,
      lat: ride.pickupLocation.coordinates[1],
      lng: ride.pickupLocation.coordinates[0],
    },
    dropoff: {
      address: ride.dropoffLocation.address,
      lat: ride.dropoffLocation.coordinates[1],
      lng: ride.dropoffLocation.coordinates[0],
    },
    fare: ride.fare?.totalFare ?? 0,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    payment_method: ride.paymentMethod,
    offer_expires_in: OFFER_WINDOW_MS / 1000,
  };
}

async function recordOfferSent(rideId, driverId) {
  try {
    await Ride.findByIdAndUpdate(rideId, {
      $push: {
        offerTracking: {
          driver: driverId,
          sentAt: new Date(),
        },
      },
    });
  } catch (err) {
    logger.warn(`recordOfferSent failed for ride ${rideId}: ${err.message}`);
  }
}

async function pushOfferToDriver(driver, ridePayload, rideId) {
  const driverId = driver._id.toString();
  const driverUserId = driver.user?._id?.toString() || driver.user?.toString();

  await recordOfferSent(rideId, driver._id);

  const fareLabel = Math.round(Number(ridePayload.fare) || 0).toLocaleString();

  const results = await Promise.allSettled([
    driverUserId
      ? sendToUser(driverUserId, 'driver', {
          title: 'New ride request',
          message: `${ridePayload.pickup.address} → ${ridePayload.dropoff.address} · ₦${fareLabel}`,
          type: 'alert',
          priority: 'high',
          ride_id: ridePayload.ride_id,
          event_key: 'ride_requested',
          screen: 'ride_request',
          action_type: 'navigate',
          action_payload: { screen: 'DriverHome', rideId: ridePayload.ride_id },
          data: {
            subType: 'ride_requested',
            rideId: ridePayload.ride_id,
            screen: 'ride_request',
          },
        })
      : Promise.resolve(),

    (async () => {
      const svc = getPusherService();
      if (!svc?.pusher) return;
      svc.pusher.trigger(`private-driver-${driverId}`, 'ride-request', ridePayload);
    })(),

    (async () => {
      const socket = getSocketService();
      if (socket) {
        socket.emitRideOfferToDriver(driverId, ridePayload);
      }
    })(),
  ]);

  ['FCM', 'Pusher', 'Socket.io'].forEach((channel, i) => {
    const r = results[i];
    if (r.status === 'rejected') {
      logger.warn(`Driver ${driverId} notification via ${channel} failed: ${r.reason?.message || r.reason}`);
    } else {
      logger.info(`Driver ${driverId} notified via ${channel}`);
    }
  });
}

/**
 * Poll until any driver accepts, ride is cancelled/no-driver, or deadline.
 * @param {string[]} driverIds
 */
function waitForAnyAccept(rideId, driverIds, timeoutMs) {
  const idSet = new Set(driverIds.map(String));
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const interval = setInterval(async () => {
      try {
        const acceptedDriverId = await cache.get(`ride_accepted:${rideId}`);
        if (acceptedDriverId && idSet.has(String(acceptedDriverId))) {
          await cache.del(`ride_accepted:${rideId}`);
          clearInterval(interval);
          resolve(true);
          return;
        }
        if (acceptedDriverId && !idSet.has(String(acceptedDriverId))) {
          await cache.del(`ride_accepted:${rideId}`);
          clearInterval(interval);
          resolve(false);
          return;
        }

        const doc = await Ride.findById(rideId).select('status driver').lean();

        if (!doc) {
          clearInterval(interval);
          resolve(false);
          return;
        }

        if (doc.status === 'cancelled' || doc.status === 'no-driver-found') {
          clearInterval(interval);
          resolve(false);
          return;
        }

        if (
          doc.driver &&
          idSet.has(doc.driver.toString()) &&
          ['accepted', 'driver_en_route', 'arrived', 'in-progress'].includes(doc.status)
        ) {
          clearInterval(interval);
          resolve(true);
          return;
        }

        if (doc.driver && !idSet.has(doc.driver.toString())) {
          clearInterval(interval);
          resolve(false);
          return;
        }

        if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(false);
        }
      } catch (err) {
        clearInterval(interval);
        logger.error(`waitForAnyAccept poll error: ${err.message}`);
        resolve(false);
      }
    }, 400);
  });
}

async function finalizeNoDriverFound(rideId) {
  const ride = await Ride.findById(rideId).populate('rider');
  if (!ride || ride.driver || !MATCHING_STATUSES.includes(ride.status)) {
    return;
  }

  const riderId = ride.rider?._id ?? ride.rider;
  const fareAmount = Number(ride.fare?.totalFare) || 0;
  const hasWalletHold = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${ride._id}`,
    type: 'hold',
  })
    .select('_id')
    .lean();

  const isEscrow =
    ride.paymentMethod === 'wallet' &&
    (['held', 'charged'].includes(ride.paymentStatus) || !!hasWalletHold);

  if (isEscrow && (fareAmount > 0 || hasWalletHold)) {
    try {
      await processCancellation(ride._id, riderId, null, fareAmount, 'beforeAccept');
    } catch (err) {
      logger.error(`processCancellation failed for ride ${rideId}: ${err.message}`);
    }
  }

  ride.status = 'no-driver-found';
  ride.statusHistory.push({
    status: 'no-driver-found',
    timestamp: new Date(),
    note: 'No driver accepted within offer window',
  });
  await ride.save();
}

/**
 * Sequential batches of up to MAX_PARALLEL_OFFERS drivers; first explicit accept wins (atomic on server).
 * @returns {Promise<import('mongoose').Types.ObjectId|null>}
 */
export async function offerRideToDrivers(ride, matchedDrivers) {
  const ridePayload = buildRidePayload(ride);
  const startTime = Date.now();
  let offset = 0;

  while (offset < matchedDrivers.length && Date.now() - startTime < MAX_TTL_MS) {
    const batch = matchedDrivers.slice(offset, offset + MAX_PARALLEL_OFFERS);
    offset += batch.length;

    const driverDocs = await Promise.all(
      batch.map((m) => Driver.findById(m.driver?._id || m.driver).populate('user', 'name deviceToken fcm_token'))
    );

    const valid = driverDocs.filter((d) => d?.isAvailable && d?.isOnline);
    if (valid.length === 0) {
      logger.info(`Batch skipped — no online/available drivers for ride ${ride._id}`);
      continue;
    }

    await Promise.all(valid.map((d) => pushOfferToDriver(d, ridePayload, ride._id)));

    logger.info(
      `Ride ${ride._id} offered to ${valid.length} driver(s), waiting ${OFFER_WINDOW_MS / 1000}s for accept`
    );

    const accepted = await waitForAnyAccept(
      ride._id.toString(),
      valid.map((d) => d._id.toString()),
      OFFER_WINDOW_MS
    );

    if (accepted) {
      const assigned = await Ride.findById(ride._id).select('driver').lean();
      if (assigned?.driver) {
        logger.info(`Ride ${ride._id} accepted by driver ${assigned.driver}`);
        return assigned.driver;
      }
    }

    logger.info(`No accept in window for batch on ride ${ride._id}`);
  }

  logger.warn(`No driver accepted ride ${ride._id}`);
  return null;
}

export async function notifyNoDriverFound(ride) {
  const riderId = ride.rider?._id?.toString() || ride.rider?.toString();
  if (!riderId) {
    logger.warn('notifyNoDriverFound: missing rider');
    return;
  }

  try {
    await sendToUser(riderId, 'rider', {
      title: 'No driver found',
      message: "We couldn't find a driver nearby. Please try again in a moment.",
      type: 'alert',
      priority: 'high',
      ride_id: ride._id.toString(),
      event_key: 'no_driver_found',
      screen: 'home',
    });
  } catch (err) {
    logger.error(`notifyNoDriverFound failed: ${err.message}`);
  }

  const socket = getSocketService();
  if (socket?.io) {
    socket.io.to(`user:${riderId}`).emit('ride-no-driver', {
      ride_id: ride._id.toString(),
      message: 'No driver found',
    });
    socket.io.to(`user:${riderId}`).emit('NO_DRIVER_FOUND', {
      ride_id: ride._id.toString(),
      message: 'No driver found',
    });
  }
}

export { finalizeNoDriverFound as cancelUnacceptedRide };
