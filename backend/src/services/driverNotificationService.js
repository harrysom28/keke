import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';
import { getPusherService } from './pusherService.js';
import { sendToUser } from './notificationService.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import RideOffer from '../models/RideOffer.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import { processCancellation } from './escrowWalletService.js';
import { MATCHING_STATUSES } from '../utils/rideStatus.js';

const OFFER_WINDOW_MS = 60_000;
const DEFAULT_MAX_OFFERS = 6;

function buildRidePayload(ride, offerId, expiresAt) {
  return {
    ride_id: ride._id.toString(),
    offer_id: offerId,
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
    offer_expires_in: Math.max(
      1,
      Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
    ),
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
          // Ride offers are inherently time-sensitive; retries can spam drivers when push is misconfigured.
          disable_retry: true,
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
 * Send "no driver found" exactly once per ride and move ride to terminal state.
 */
export async function sendNoDriverFoundOnce(rideId) {
  const ride = await Ride.findById(rideId).populate('rider');
  if (!ride) return;
  if (ride.driver || !MATCHING_STATUSES.includes(ride.status)) return;
  if (ride.noDriverNotified) return;

  // Atomically mark as notified + move to no-driver-found.
  const updated = await Ride.findOneAndUpdate(
    { _id: rideId, driver: null, status: { $in: MATCHING_STATUSES }, noDriverNotified: false },
    { $set: { noDriverNotified: true, status: 'no-driver-found' } },
    { new: true }
  ).populate('rider');

  if (!updated) return;

  const riderId = updated.rider?._id ?? updated.rider;
  const fareAmount = Number(updated.fare?.totalFare) || 0;
  const hasWalletHold = await UserWalletTransaction.findOne({
    idempotencyKey: `hold:${updated._id}`,
    type: 'hold',
  })
    .select('_id')
    .lean();

  const isEscrow =
    updated.paymentMethod === 'wallet' &&
    (['held', 'charged'].includes(updated.paymentStatus) || !!hasWalletHold);

  if (isEscrow && (fareAmount > 0 || hasWalletHold)) {
    try {
      await processCancellation(updated._id, riderId, null, fareAmount, 'beforeAccept');
    } catch (err) {
      logger.error(`processCancellation failed for ride ${rideId}: ${err.message}`);
    }
  }

  updated.statusHistory.push({
    status: 'no-driver-found',
    timestamp: new Date(),
    note: 'No driver accepted within offer window',
  });
  await updated.save();

  // Expire any pending offers for hygiene.
  await RideOffer.updateMany(
    { ride_id: updated._id, status: 'pending' },
    { $set: { status: 'expired', expired_at: new Date() } }
  ).catch(() => {});

  await notifyNoDriverFound(updated);
}

/**
 * Offer-based dispatch.
 * - Create one RideOffer per driver (pending, expires_at = now + 60s)
 * - Send offers to drivers (Socket.io/Pusher + push)
 * - After 60s, check acceptance once; if still unassigned, notify rider once.
 */
export async function dispatchRide(ride, matchedDrivers, options = {}) {
  const maxOffers = Number(options.maxOffers || DEFAULT_MAX_OFFERS) || DEFAULT_MAX_OFFERS;
  const now = Date.now();
  const expiresAt = new Date(now + OFFER_WINDOW_MS);

  // Increment attempt counter (single dispatch attempt; no internal retry loops).
  await Ride.updateOne({ _id: ride._id }, { $inc: { attempts: 1 } }).catch(() => {});

  const driverIds = (matchedDrivers || [])
    .map((m) => m?.driver?._id || m?.driver)
    .filter(Boolean)
    .slice(0, maxOffers);

  if (driverIds.length === 0) {
    logger.info(`dispatchRide: no drivers for ride ${ride._id}`);
    await sendNoDriverFoundOnce(ride._id);
    return { offersCreated: 0 };
  }

  const driverDocs = await Promise.all(
    driverIds.map((id) =>
      Driver.findById(id).populate('user', 'name deviceToken fcm_token onboardingStage kycStatus role')
    )
  );

  const eligible = driverDocs.filter((d) => {
    if (!d?.isAvailable || !d?.isOnline) return false;
    if (!d?.documentsVerified || d?.verificationStatus !== 'approved') return false;
    const u = d.user;
    return u?.onboardingStage === 'driver_complete' && String(u?.role || '') === 'driver';
  });

  if (eligible.length === 0) {
    logger.info(`dispatchRide: no eligible drivers for ride ${ride._id}`);
    await sendNoDriverFoundOnce(ride._id);
    return { offersCreated: 0 };
  }

  // Create offers (idempotent per ride+driver due to unique index).
  const offerDocs = eligible.map((d) => ({
    ride_id: ride._id,
    driver_id: d._id,
    status: 'pending',
    expires_at: expiresAt,
  }));

  let newOffers = [];
  try {
    newOffers = await RideOffer.insertMany(offerDocs, { ordered: false });
  } catch (err) {
    // Partial inserts can happen on restarts — only notify offers that haven't been notified yet.
    logger.warn(`dispatchRide: insertMany partial for ride ${ride._id}: ${err.message}`);
    newOffers = await RideOffer.find({
      ride_id: ride._id,
      driver_id: { $in: eligible.map((d) => d._id) },
      status: 'pending',
      notified_at: null,
    }).lean();
  }

  logger.info(`offer_created: ride=${ride._id} offers=${newOffers.length} expires_at=${expiresAt.toISOString()}`);

  if (newOffers.length === 0) {
    logger.info(`dispatchRide: all offers already notified for ride ${ride._id}, skipping`);
    return { offersCreated: 0, expiresAt };
  }

  // Mark as notified before sending to prevent double-notify on concurrent dispatch calls.
  const notifiedAt = new Date();
  await RideOffer.updateMany(
    { _id: { $in: newOffers.map((o) => o._id) } },
    { $set: { notified_at: notifiedAt } }
  ).catch(() => {});

  // Send each offer with its own offer_id.
  const byDriverId = new Map(eligible.map((d) => [d._id.toString(), d]));
  await Promise.all(
    newOffers.map((o) => {
      const d = byDriverId.get(String(o.driver_id || o.driver_id?.toString?.() || o.driver_id));
      if (!d) return Promise.resolve();
      const payload = buildRidePayload(ride, o._id.toString(), o.expires_at || expiresAt);
      return pushOfferToDriver(d, payload, ride._id);
    })
  );

  // Single timeout check (60s) — no polling loops.
  setTimeout(() => {
    (async () => {
      try {
        const r = await Ride.findById(ride._id).select('status driver noDriverNotified').lean();
        if (!r) return;
        if (r.driver || r.status === 'accepted') return;
        if (r.noDriverNotified) return;
        await sendNoDriverFoundOnce(ride._id);
      } catch (e) {
        logger.warn(`dispatchRide timeout check failed for ride ${ride._id}: ${e.message}`);
      }
    })();
  }, OFFER_WINDOW_MS);

  return { offersCreated: newOffers.length, expiresAt };
}

export async function notifyNoDriverFound(ride) {
  const riderId = ride.rider?._id?.toString() || ride.rider?.toString();
  if (!riderId) {
    logger.warn('notifyNoDriverFound: missing rider');
    return;
  }

  if (ride.noDriverNotified) {
    // already emitted (idempotency)
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
      disable_retry: true,
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

// Backwards compatible export name
export { sendNoDriverFoundOnce as cancelUnacceptedRide };
