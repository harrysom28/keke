import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';
import { logRideAudit } from './rideAuditLogService.js';

const STALE_MINUTES = 8;
const TICK_MS = 5 * 60 * 1000;
const STALE_SEARCHING_MINUTES = 30;
/**
 * Driver accepted (or marked en-route / arrived) but the ride hasn't progressed.
 * When the ride doc has had no updates for this many minutes we treat the driver
 * as a no-show, refund the rider's escrow hold in full and free the driver.
 */
const STALE_PRE_PICKUP_MINUTES = 12;

function stopRideAutomationTimers(rideId) {
  const id = rideId?.toString?.() || String(rideId || '');
  if (!id) return;
  if (global.automationTimers && global.automationTimers.has(id)) {
    const timers = global.automationTimers.get(id);
    timers.forEach((t) => clearTimeout(t));
    global.automationTimers.delete(id);
    logger.info(`🧹 Stopped automation timers for stale ride ${id}`);
  }
}

async function emitTripEventToRiderAndDriver(ride, event, payload) {
  const socketService = getSocketService();
  if (socketService?.io) {
    if (ride?.rider) socketService.io.to(`user:${ride.rider.toString()}`).emit(event, payload);
    const driverDocId = ride?.driver?.toString?.() || null;
    if (driverDocId) socketService.io.to(`driver:${driverDocId}`).emit(event, payload);
    try {
      const driverDoc = driverDocId ? await Driver.findById(driverDocId).select('user').lean() : null;
      const driverUserId = driverDoc?.user?.toString?.();
      if (driverUserId) socketService.io.to(`driver:${driverUserId}`).emit(event, payload);
    } catch {
      // ignore
    }
  }

  try {
    const { getPusherService } = await import('./pusherService.js');
    const ps = getPusherService();
    if (ps?.pusher && ride?._id) {
      ps.pusher.trigger(`private.ride.${ride._id.toString()}`, event, payload);
    }
  } catch (err) {
    logger.warn(`Pusher ${event} emit failed: ${err.message}`);
  }
}

export async function flagRideAsStaleTimeout(ride) {
  if (!ride || ride.status !== 'in-progress') return false;

  stopRideAutomationTimers(ride._id);

  ride.status = 'issue_flagged';
  ride.completed_by = 'system';
  ride.completion_reason = 'timeout';
  ride.flag = ride.flag || 'stale_timeout';
  ride.statusHistory.push({
    status: 'issue_flagged',
    timestamp: new Date(),
    note: `Auto-flagged by system (stale > ${STALE_MINUTES}m)`,
  });
  await ride.save();

  await logRideAudit({
    rideId: ride._id,
    action: 'stale_flag',
    initiatedBy: null,
    initiatedByRole: 'system',
    details: { reason: 'timeout', staleMinutes: STALE_MINUTES },
  });

  await emitTripEventToRiderAndDriver(ride, 'trip:flagged', { rideId: ride._id.toString(), reason: 'timeout' });

  try {
    const { sendToUser } = await import('./notificationService.js');
    await sendToUser(ride.rider, 'rider', {
      title: 'Trip flagged',
      message: 'Your trip was automatically flagged. Support will review it shortly.',
      type: 'alert',
      priority: 'high',
      screen: 'home',
      ride_id: ride._id,
      event_key: 'trip_flagged_timeout',
      data: { subType: 'trip_flagged', rideId: ride._id.toString(), reason: 'timeout' },
    });
  } catch (err) {
    logger.warn(`Stale ride push failed for ride ${ride._id}: ${err.message}`);
  }

  return true;
}

class StaleTripService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  start() {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.tick(), TICK_MS);
    // Run once on boot
    this.tick().catch(() => {});
    logger.info('Stale trip service started');
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    logger.info('Stale trip service stopped');
  }

  async tick() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      // ── Flag stale in-progress rides ──────────────────────────────────
      const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
      const staleRides = await Ride.find({
        status: 'in-progress',
        updatedAt: { $lt: cutoff },
      }).select('_id rider driver status startedAt updatedAt flag completed_by completion_reason statusHistory fare');

      if (staleRides.length > 0) {
        logger.warn(`Found ${staleRides.length} stale in-progress rides to flag`);
      }

      for (const ride of staleRides) {
        try {
          await flagRideAsStaleTimeout(ride);
        } catch (err) {
          logger.error(`Failed to flag stale ride ${ride?._id}: ${err.message}`);
        }
      }

      // ── Cancel stale searching/requested rides ────────────────────────
      const searchCutoff = new Date(Date.now() - STALE_SEARCHING_MINUTES * 60 * 1000);
      const staleSearchingRides = await Ride.find({
        status: { $in: ['searching', 'requested'] },
        updatedAt: { $lt: searchCutoff },
      }).select('_id rider driver status createdAt updatedAt statusHistory completed_by completion_reason');

      if (staleSearchingRides.length > 0) {
        logger.warn(`Found ${staleSearchingRides.length} stale searching/requested rides to cancel`);
      }

      for (const ride of staleSearchingRides) {
        try {
          ride.status = 'cancelled';
          ride.completed_by = null;
          ride.completion_reason = null;
          ride.cancellation = {
            cancelledBy: 'system',
            reason: 'No driver found within time limit',
            cancelledAt: new Date(),
            cancellationFee: 0,
          };
          ride.statusHistory.push({
            status: 'cancelled',
            timestamp: new Date(),
            note: `Auto-cancelled by system: no driver found after ${STALE_SEARCHING_MINUTES} minutes`,
          });
          await ride.save({ validateBeforeSave: false });

          stopRideAutomationTimers(ride._id);

          logger.info(`Auto-cancelled stale searching ride ${ride._id}`);

          // Notify rider
          try {
            const { sendToUser } = await import('./notificationService.js');
            await sendToUser(ride.rider, 'rider', {
              title: 'No driver found',
              message: 'We could not find a driver for your ride. Please try again.',
              type: 'alert',
              priority: 'high',
              screen: 'home',
              ride_id: ride._id,
              event_key: 'ride_cancelled_no_driver',
              data: { subType: 'ride_cancelled', rideId: ride._id.toString(), reason: 'no_driver' },
            });
          } catch (err) {
            logger.warn(`Stale searching ride push failed for ride ${ride._id}: ${err.message}`);
          }

          // Notify via Pusher
          await emitTripEventToRiderAndDriver(ride, 'trip:cancelled', {
            rideId: ride._id.toString(),
            reason: 'no_driver',
          });

        } catch (err) {
          logger.error(`Failed to cancel stale searching ride ${ride?._id}: ${err.message}`);
        }
      }
      // ── End stale searching cleanup ───────────────────────────────────

      // ── Cancel rides stuck after accept (driver no-show) ──────────────
      const prePickupCutoff = new Date(Date.now() - STALE_PRE_PICKUP_MINUTES * 60 * 1000);
      const stuckPrePickupRides = await Ride.find({
        status: { $in: ['accepted', 'driver_en_route', 'arrived'] },
        updatedAt: { $lt: prePickupCutoff },
      }).select(
        '_id rider driver status paymentMethod paymentStatus fare statusHistory acceptedAt arrivedAt completed_by completion_reason cancellation'
      );

      if (stuckPrePickupRides.length > 0) {
        logger.warn(
          `Found ${stuckPrePickupRides.length} stuck pre-pickup rides to auto-cancel (driver no-show)`
        );
      }

      for (const ride of stuckPrePickupRides) {
        try {
          await autoCancelStuckPrePickupRide(ride);
        } catch (err) {
          logger.error(`Failed to auto-cancel stuck ride ${ride?._id}: ${err.message}`);
        }
      }
      // ── End stuck pre-pickup cleanup ──────────────────────────────────

    } catch (err) {
      logger.error(`Stale trip tick failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}

async function autoCancelStuckPrePickupRide(ride) {
  const previousStatus = ride.status;
  const rideId = ride._id;

  if (ride.paymentMethod === 'wallet') {
    try {
      const riderId = ride.rider?._id ?? ride.rider;
      const fareAmount = Number(ride.fare?.totalFare) || 0;
      if (riderId) {
        const hasHold = await UserWalletTransaction.findOne({
          idempotencyKey: `hold:${rideId}`,
          type: 'hold',
        })
          .select('_id')
          .lean();
        if (hasHold) {
          const { processCancellation } = await import('./escrowWalletService.js');
          await processCancellation(rideId, riderId, null, fareAmount, 'driverCancel');
          logger.info(`Escrow released for stuck pre-pickup ride ${rideId}`);
        }
      }
    } catch (escrowErr) {
      logger.error(
        `Escrow release failed for stuck pre-pickup ride ${rideId}: ${escrowErr.message}`
      );
    }
  }

  ride.status = 'cancelled';
  ride.completed_by = 'system';
  ride.completion_reason = 'timeout';
  ride.cancellation = {
    cancelledBy: 'system',
    reason: `Auto-cancelled: stuck in ${previousStatus} > ${STALE_PRE_PICKUP_MINUTES}m without progress`,
    cancelledAt: new Date(),
    cancellationFee: 0,
    cancellationScenario: 'driverCancel',
  };
  ride.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: `Auto-cancelled by system: no progress from ${previousStatus} for ${STALE_PRE_PICKUP_MINUTES}m`,
  });
  if (ride.paymentMethod === 'wallet') ride.paymentStatus = 'refunded';
  await ride.save({ validateBeforeSave: false });

  stopRideAutomationTimers(rideId);

  // Free the driver
  if (ride.driver) {
    try {
      await Driver.findByIdAndUpdate(ride.driver, { isAvailable: true });
    } catch (err) {
      logger.warn(`Failed to free driver ${ride.driver} after auto-cancel: ${err.message}`);
    }
  }

  await logRideAudit({
    rideId,
    action: 'auto_cancel_no_progress',
    initiatedBy: null,
    initiatedByRole: 'system',
    details: {
      reason: 'driver_no_show',
      previousStatus,
      staleMinutes: STALE_PRE_PICKUP_MINUTES,
    },
  });

  // Notify rider
  const wasArrived = previousStatus === 'arrived';
  const refundNote =
    ride.paymentMethod === 'wallet' ? ' Your wallet hold has been released.' : '';
  const riderMessage = wasArrived
    ? `Your ride was cancelled because it never started.${refundNote}`
    : `Your driver did not arrive in time.${refundNote}`;
  try {
    const { sendToUser } = await import('./notificationService.js');
    await sendToUser(ride.rider, 'rider', {
      title: 'Ride cancelled',
      message: riderMessage,
      type: 'alert',
      priority: 'high',
      screen: 'home',
      ride_id: rideId,
      event_key: 'ride_cancelled_no_show',
      data: {
        subType: 'ride_cancelled',
        rideId: rideId.toString(),
        reason: wasArrived ? 'no_pickup' : 'driver_no_show',
      },
    });
  } catch (err) {
    logger.warn(`No-show rider push failed for ride ${rideId}: ${err.message}`);
  }

  // Notify driver (so the dashboard clears the stale ride card)
  if (ride.driver) {
    try {
      const driverDoc = await Driver.findById(ride.driver).select('user').lean();
      if (driverDoc?.user) {
        const { sendToUser } = await import('./notificationService.js');
        await sendToUser(driverDoc.user, 'driver', {
          title: 'Ride auto-cancelled',
          message: `A ride was auto-cancelled by the system after ${STALE_PRE_PICKUP_MINUTES}m of no progress.`,
          type: 'alert',
          priority: 'normal',
          ride_id: rideId,
          event_key: 'ride_auto_cancelled',
          data: { subType: 'ride_auto_cancelled', rideId: rideId.toString() },
        });
      }
    } catch (err) {
      logger.warn(`No-show driver push failed for ride ${rideId}: ${err.message}`);
    }
  }

  await emitTripEventToRiderAndDriver(ride, 'trip:cancelled', {
    rideId: rideId.toString(),
    reason: wasArrived ? 'no_pickup' : 'driver_no_show',
    previousStatus,
  });

  logger.info(`Auto-cancelled stuck pre-pickup ride ${rideId} (was ${previousStatus})`);
}

const staleTripService = new StaleTripService();

export default staleTripService;

