import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';
import { getPusherService } from './pusherService.js';
import { sendToUser } from './notificationService.js';
import { cache } from '../config/redis.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import { processCancellation } from './escrowWalletService.js';

const OFFER_WINDOW_MS = 20_000;
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

async function pushOfferToDriver(driver, ridePayload) {
  const driverId = driver._id.toString();
  const driverUserId = driver.user?._id?.toString() || driver.user?.toString();

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

function waitForAcceptance(rideId, driverId, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    let lastMongoCheckAt = 0;

    const interval = setInterval(async () => {
      try {
        // 1) Fast-path: Redis signal layer
        const acceptedDriverId = await cache.get(`ride_accepted:${rideId}`);
        if (acceptedDriverId) {
          await cache.del(`ride_accepted:${rideId}`);
          clearInterval(interval);
          resolve(String(acceptedDriverId) === String(driverId));
          return;
        }

        // 2) Fallback: Mongo check every 5 seconds
        let doc = null;
        if (Date.now() - lastMongoCheckAt >= 5000) {
          lastMongoCheckAt = Date.now();
          doc = await Ride.findById(rideId).select('status driver').lean();
        }

        if (doc === null) {
          clearInterval(interval);
          resolve(false);
          return;
        }

        if (doc && doc.status === 'cancelled') {
          clearInterval(interval);
          resolve(false);
          return;
        }

        if (doc && doc.driver?.toString() === driverId && doc.status === 'accepted') {
          clearInterval(interval);
          resolve(true);
          return;
        }

        if (Date.now() >= deadline) {
          clearInterval(interval);
          resolve(false);
        }
      } catch (err) {
        clearInterval(interval);
        logger.error(`waitForAcceptance poll error: ${err.message}`);
        resolve(false);
      }
    }, 500);
  });
}

async function cancelUnacceptedRide(rideId) {
  const ride = await Ride.findById(rideId).populate('rider');
  if (!ride || ride.status !== 'requested' || ride.driver) {
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

  await ride.cancelRide('system', 'No driver accepted', 0, isEscrow ? 'beforeAccept' : null);
}

/**
 * Sequential offer queue: one driver at a time, OFFER_WINDOW_MS per driver.
 * @returns {Promise<import('mongoose').Types.ObjectId|null>} assigned driver id or null
 */
export async function offerRideToDrivers(ride, matchedDrivers) {
  const ridePayload = buildRidePayload(ride);
  const startTime = Date.now();

  for (const match of matchedDrivers) {
    if (Date.now() - startTime > MAX_TTL_MS) {
      logger.warn(`Ride ${ride._id} exceeded max TTL, stopping offers`);
      break;
    }

    const driver = await Driver.findById(match.driver?._id || match.driver).populate(
      'user',
      'name deviceToken fcm_token'
    );

    if (!driver?.isAvailable || !driver?.isOnline) {
      logger.info(`Driver ${driver?._id} no longer available, skipping`);
      continue;
    }

    await pushOfferToDriver(driver, ridePayload);
    logger.info(
      `Ride ${ride._id} offered to driver ${driver._id}, waiting ${OFFER_WINDOW_MS / 1000}s`
    );

    const accepted = await waitForAcceptance(ride._id.toString(), driver._id.toString(), OFFER_WINDOW_MS);

    if (accepted) {
      logger.info(`Ride ${ride._id} accepted by driver ${driver._id}`);
      return driver._id;
    }

    logger.info(`Driver ${driver._id} did not accept ride ${ride._id} in time`);
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
  }
}

export { cancelUnacceptedRide };
