import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import { getSocketService } from './socketService.js';
import { logRideAudit } from './rideAuditLogService.js';

const STALE_MINUTES = 15;
const TICK_MS = 5 * 60 * 1000;

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
    } catch (err) {
      logger.error(`Stale trip tick failed: ${err.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}

const staleTripService = new StaleTripService();

export default staleTripService;

