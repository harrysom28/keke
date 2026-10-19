import Driver from '../models/Driver.js';
import DriverWallet from '../models/DriverWallet.js';
import Ride from '../models/Ride.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { learnFromRide } from './placeIntelligence.js';
import { getSettings } from './settingsService.js';
import { measureDropoff } from '../utils/dropoffProximity.js';

/**
 * Shared "driver side" trip completion.
 *
 * Used by:
 *  - driverController.completeRide (driver ends the trip near the destination, or far with a reason)
 *  - rideController.confirmDropoff (rider confirms a trip the driver could not end alone)
 *
 * Everything here used to live inline in completeRide, after the proximity check.
 * Fare calculation and processRidePayment are untouched.
 */

/** Human distance for notification copy: "350 m" / "1.2 km". */
export function formatDistanceForCopy(meters) {
  const m = Math.round(Number(meters) || 0);
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

/** Load admin dropoff settings and measure the driver against the ride destination. */
export async function measureDriverDropoff(ride, driverId, liveFix) {
  const [driverDoc, settings] = await Promise.all([
    Driver.findById(driverId).select('currentLocation').lean(),
    getSettings(),
  ]);
  const measure = measureDropoff({
    ride,
    savedLocation: driverDoc?.currentLocation,
    liveFix,
    settings: settings?.dropoff,
  });
  return { measure, settings: settings?.dropoff };
}

/**
 * Emit a realtime event to the rider and/or the driver of a ride (socket rooms + Pusher ride channel).
 * Best-effort: never throws.
 */
export async function emitTripEvent(ride, event, payload, { rider = true, driver = true } = {}) {
  try {
    const { getSocketService } = await import('./socketService.js');
    const socketService = getSocketService();
    const riderId = ride?.rider?._id?.toString?.() || ride?.rider?.toString?.() || null;
    const driverDocId = ride?.driver?._id?.toString?.() || ride?.driver?.toString?.() || null;

    if (socketService?.io) {
      if (rider && riderId) socketService.io.to(`user:${riderId}`).emit(event, payload);
      if (driver && driverDocId) {
        socketService.io.to(`driver:${driverDocId}`).emit(event, payload);
        const driverDoc = await Driver.findById(driverDocId).select('user').lean();
        const driverUserId = driverDoc?.user?.toString?.();
        if (driverUserId) socketService.io.to(`driver:${driverUserId}`).emit(event, payload);
      }
    }

    const { getPusherService } = await import('./pusherService.js');
    const ps = getPusherService();
    if (ps?.pusher && ride?._id) {
      await ps.pusher.trigger(`private.ride.${ride._id.toString()}`, event, payload);
    }
  } catch (err) {
    logger.warn(`Trip event ${event} emit failed: ${err.message}`);
  }
}

/**
 * Finish a trip on behalf of the driver. Single winner: the status flip is one atomic
 * conditional update on `status: 'in-progress'`, so two simultaneous completions
 * (driver tap + rider confirm, double tap, retry) cannot both pay.
 *
 * @param {object} ride    Ride document (in-progress)
 * @param {object} driver  Driver document
 * @param {object} opts
 * @param {string} [opts.paymentStatus]  client-supplied status for non-cash, non-prepaid rides
 * @param {string} [opts.completedBy]    'driver' (default)
 * @param {object} [opts.proximity]      { fields, flag } from proximityFieldsForCompletion
 * @param {object} [opts.extraSet]       additional fields to set atomically (e.g. rider response)
 * @returns {Promise<{ride: object, payment: object|null}>}
 */
export async function finalizeDriverCompletion(
  ride,
  driver,
  { paymentStatus, completedBy = 'driver', proximity = null, extraSet = null } = {}
) {
  const rideId = ride._id.toString();
  const userId = driver.user;
  const now = new Date();

  const set = {
    status: 'completed',
    completed_by: completedBy,
    completion_reason: 'normal',
    dropOffCompleted: true,
    completedAt: now,
    ...(proximity?.fields || {}),
    ...(extraSet || {}),
  };
  if (proximity?.flag) set.flag = proximity.flag;

  const isEscrowWallet = ride.paymentMethod === 'wallet' && ['held', 'charged'].includes(ride.paymentStatus);
  // Prepaid Paystack card — keep charged until processRidePayment settles + credits driver
  const isPrepaidCard = ride.paymentMethod === 'card' && ['held', 'charged'].includes(ride.paymentStatus);
  if (!isEscrowWallet && !isPrepaidCard) {
    if (ride.paymentMethod === 'cash') {
      set.paymentStatus = 'pending';
    } else {
      set.paymentStatus = paymentStatus || 'completed';
    }
  }

  const claim = await Ride.updateOne(
    { _id: ride._id, status: 'in-progress' },
    {
      $set: set,
      $push: { statusHistory: { status: 'completed', timestamp: now, note: 'Ride completed' } },
    }
  );
  if (claim.modifiedCount !== 1) {
    throw new ValidationError('Ride is not in progress');
  }

  ride = await Ride.findById(ride._id);
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Make driver available again for the next trip
  const { restoreDriverAvailabilityAfterTrip } = await import('./driverAvailabilityService.js');
  await restoreDriverAvailabilityAfterTrip(driver);

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideId)) {
    const timers = global.automationTimers.get(rideId);
    timers.forEach((timer) => clearTimeout(timer));
    global.automationTimers.delete(rideId);
    logger.info(`🧹 Cancelled automation timers for manually completed ride ${rideId}`);
  }

  // Process payment first
  let payment = null;
  try {
    const { processRidePayment, sendPaymentReceipt } = await import('./paymentService.js');
    const paymentResult = await processRidePayment(ride);

    // Send receipt if payment was processed
    if (paymentResult.success && paymentResult.payment && paymentResult.payment.status === 'completed') {
      payment = paymentResult.payment;
      await sendPaymentReceipt(ride, payment);
    }
  } catch (error) {
    logger.error(`Payment processing failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if payment processing fails
  }

  // Send real-time notification to rider (after payment processing)
  const { getSocketService } = await import('./socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    await socketService.emitRideCompleted(ride);
    await socketService.emitRideStatusUpdate(ride, 'completed', driver);
    try {
      const payload = { rideId: ride._id.toString(), completedBy: 'driver', fare: ride.fare?.totalFare ?? 0 };
      socketService.io?.to(`user:${ride.rider._id.toString()}`).emit('trip:completed', payload);
      socketService.io?.to(`driver:${driver._id.toString()}`).emit('trip:completed', payload);
      socketService.io?.to(`driver:${userId.toString()}`).emit('trip:completed', payload);
      const { getPusherService } = await import('./pusherService.js');
      const ps = getPusherService();
      ps?.pusher?.trigger(`private.ride.${ride._id.toString()}`, 'trip:completed', payload);
    } catch (e) {
      logger.debug(`trip:completed emit skipped: ${e.message}`);
    }
  }

  try {
    const { sendToUser } = await import('./notificationService.js');
    const fareAmount = Math.round(Number(ride?.fare?.totalFare || payment?.amount || 0));
    const driverEarnings = Math.round(Number(ride?.fare?.driverNetAmount ?? ride?.fare?.totalFare ?? 0));
    const isCashRide = String(ride.paymentMethod || '').toLowerCase() === 'cash';

    await sendToUser(ride.rider._id, 'rider', {
      title: 'Ride completed',
      message: isCashRide
        ? `Please pay ₦${fareAmount.toLocaleString()} cash to your driver. Thanks for riding with Keke!`
        : `₦${fareAmount.toLocaleString()} has been deducted from your wallet. Thanks for riding with Keke!`,
      type: 'alert',
      priority: 'high',
      screen: 'home',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'RideDetails', rideId: ride._id.toString() },
      event_key: 'ride_completed',
      data: { subType: 'ride_completed', rideId: ride._id.toString() },
    });

    if (isCashRide) {
      // Cash is collected in person — it does not affect the withdrawable wallet.
      await sendToUser(userId, 'driver', {
        title: `Collect ₦${fareAmount.toLocaleString()} cash`,
        message: `Collect ₦${fareAmount.toLocaleString()} cash from the passenger for this trip.`,
        type: 'alert',
        priority: 'high',
        screen: 'home',
        ride_id: ride._id,
        action_type: 'navigate',
        action_payload: { screen: 'DriverHome', rideId: ride._id.toString() },
        event_key: 'cash_collection',
        data: {
          subType: 'cash_collection',
          rideId: ride._id.toString(),
          amountNaira: String(fareAmount),
        },
      });
    } else {
      const walletDoc = await DriverWallet.findOne({ driverId: driver._id }).lean();
      const pendingBal = Math.round(Number(walletDoc?.pendingBalance ?? 0));
      const availableBal = Math.round(Number(walletDoc?.availableBalance ?? 0));

      await sendToUser(userId, 'driver', {
        title: `₦${driverEarnings.toLocaleString()} earned from completed trip`,
        message: `Driver wallet — Pending: ₦${pendingBal.toLocaleString()} · Available: ₦${availableBal.toLocaleString()}.`,
        type: 'alert',
        priority: 'high',
        screen: 'wallet',
        ride_id: ride._id,
        action_type: 'navigate',
        action_payload: { screen: 'wallet', rideId: ride._id.toString() },
        event_key: 'fare_received',
        data: {
          subType: 'fare_received',
          rideId: ride._id.toString(),
          amountNaira: String(driverEarnings),
          pendingBalance: String(pendingBal),
          availableBalance: String(availableBal),
        },
      });
    }
  } catch (err) {
    logger.error(`Ride completion notification failed: ${err.message}`);
  }

  // Request rating/review from rider
  try {
    const { requestRiderReview } = await import('./reviewService.js');
    await requestRiderReview(ride);
  } catch (error) {
    logger.error(`Review request failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if review request fails
  }

  // Check and award driver challenges (gamified tasks)
  try {
    const { checkAndAwardTasks } = await import('./driverTaskService.js');
    await checkAndAwardTasks(driver._id, ride);
  } catch (error) {
    logger.error(`Driver task check failed for ride ${rideId}: ${error.message}`);
  }

  logger.info(`Ride ${rideId} completed by driver ${driver._id}`);

  // Self-learning: teach places from completed ride (fire-and-forget)
  const pickup = ride.pickupLocation;
  const drop = ride.dropoffLocation;
  learnFromRide({
    _id: ride._id.toString(),
    origin: {
      lat: pickup?.coordinates?.[1],
      lng: pickup?.coordinates?.[0],
      label: pickup?.name || pickup?.address,
    },
    destination: {
      lat: drop?.coordinates?.[1],
      lng: drop?.coordinates?.[0],
      label: drop?.name || drop?.address,
    },
  }).catch((err) => logger.warn('[Learn]', err.message));

  return { ride, payment };
}

/**
 * After a Tier 2 completion: tell the rider where the driver ended the trip so they can
 * confirm or dispute it (POST /api/rides/:rideId/dropoff-confirm). Best-effort.
 */
export async function notifyRiderDropoffReview(ride, distanceMeters) {
  const rideId = ride._id.toString();
  const distance = formatDistanceForCopy(distanceMeters);
  const message = `Your driver ended the trip about ${distance} from your destination. Was this right?`;

  await emitTripEvent(
    ride,
    'dropoff_review',
    { subType: 'dropoff_review', rideId, distanceMeters: Math.round(distanceMeters || 0), message },
    { rider: true, driver: false }
  );

  try {
    const { sendToUser } = await import('./notificationService.js');
    const riderId = ride.rider?._id || ride.rider;
    await sendToUser(riderId, 'rider', {
      title: 'Trip ended away from your destination',
      message,
      type: 'alert',
      priority: 'high',
      screen: 'ride',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'ActiveRide', rideId },
      event_key: 'dropoff_review',
      data: {
        subType: 'dropoff_review',
        rideId,
        distanceMeters: String(Math.round(distanceMeters || 0)),
      },
    });
  } catch (err) {
    logger.warn(`dropoff_review push failed for ride ${rideId}: ${err.message}`);
  }
}
