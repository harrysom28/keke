import Ride from '../models/Ride.js';
import logger from '../utils/logger.js';
import rideMatchingService from './rideMatchingService.js';
import notificationService from './notificationService.js';
import { dispatchRide, notifyNoDriverFound } from './driverNotificationService.js';
import { SCHEDULED_DISPATCH_LEAD_MS } from '../utils/scheduledRide.js';

/**
 * Service to handle scheduled rides
 * Automatically assigns drivers when scheduled time arrives
 */
class ScheduledRideService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
  }

  /**
   * Start the scheduled ride processor
   */
  start() {
    // Check for scheduled rides every minute
    this.intervalId = setInterval(() => {
      this.processScheduledRides();
    }, 60000); // 1 minute

    logger.info('Scheduled ride service started');
  }

  /**
   * Stop the scheduled ride processor
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Scheduled ride service stopped');
    }
  }

  /**
   * Process scheduled rides that are ready to be assigned
   */
  async processScheduledRides() {
    if (this.isRunning) {
      logger.warn('Scheduled ride processor still running, skipping this tick');
      return;
    }
    this.isRunning = true;
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + SCHEDULED_DISPATCH_LEAD_MS);

      // Find scheduled rides that are within 5 minutes of their scheduled time
      // and haven't been assigned a driver yet
      const scheduledRides = await Ride.find({
        isScheduled: true,
        status: { $in: ['requested', 'searching', 'scheduled'] },
        scheduledAt: {
          $lte: fiveMinutesFromNow,
          $gte: now,
        },
        driver: null,
        // Do not auto-dispatch unpaid card bookings
        $nor: [{ paymentMethod: 'card', paymentStatus: 'pending' }],
      })
        .populate('rider', 'name phone deviceToken')
        .populate('vehicleType')
        .lean();

      for (const ride of scheduledRides) {
        try {
          const excludeIds = (ride.notifiedDriverIds || []).map((id) => id.toString());
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(
            ride,
            undefined,
            5,
            excludeIds
          );

          if (matchedDrivers.length > 0) {
            setImmediate(() => {
              (async () => {
                try {
                  const rideDoc = await Ride.findById(ride._id)
                    .populate('rider', 'name phone profileImage rating deviceToken')
                    .populate('vehicleType');
                  if (!rideDoc) return;

                  await dispatchRide(rideDoc, matchedDrivers);
                } catch (err) {
                  logger.error(
                    `Scheduled ride dispatchRide failed for ${ride._id}: ${err.message}`
                  );
                }
              })();
            });
          }
        } catch (error) {
          logger.error(`Error processing scheduled ride ${ride._id}: ${error.message}`);
        }
      }

      // Also check for scheduled rides that are past their time but still unassigned
      const overdueRides = await Ride.find({
        isScheduled: true,
        status: { $in: ['requested', 'searching', 'scheduled'] },
        scheduledAt: { $lt: now },
        driver: null,
        $nor: [{ paymentMethod: 'card', paymentStatus: 'pending' }],
      })
        .populate('rider', 'name phone deviceToken')
        .lean();

      for (const ride of overdueRides) {
        try {
          // Try to find alternative drivers with larger radius
          const excludeIds = (ride.notifiedDriverIds || []).map((id) => id.toString());
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(
            ride,
            undefined,
            10,
            excludeIds
          );

          if (matchedDrivers.length > 0) {
            setImmediate(() => {
              (async () => {
                try {
                  const rideDoc = await Ride.findById(ride._id)
                    .populate('rider', 'name phone profileImage rating deviceToken')
                    .populate('vehicleType');
                  if (!rideDoc) return;

                  await dispatchRide(rideDoc, matchedDrivers);
                } catch (err) {
                  logger.error(
                    `Overdue scheduled ride dispatchRide failed for ${ride._id}: ${err.message}`
                  );
                }
              })();
            });
          } else {
            // Re-fetch as document (lean() returns plain object - no .save())
            const rideDoc = await Ride.findById(ride._id);
            if (rideDoc) {
              rideDoc.status = 'no-driver-found';
              rideDoc.statusHistory.push({
                status: 'no-driver-found',
                timestamp: new Date(),
                note: 'No driver found for scheduled ride',
              });
              await rideDoc.save();

              const deviceToken = ride.rider?.deviceToken;
              if (deviceToken) {
                const pushData = notificationService.buildStandardPushData({
                  type: 'ride_update',
                  subType: 'no_driver_found',
                  rideId: ride._id.toString(),
                  screen: 'ride_tracking',
                  priority: 'high',
                });
                await notificationService.sendPushNotification(
                  deviceToken,
                  'No Driver Available',
                  'We couldn\'t find a driver for your scheduled ride. Please try again.',
                  pushData,
                  ride.rider?._id?.toString?.()
                );
              }
            }
          }
        } catch (error) {
          logger.error(`Error processing overdue scheduled ride ${ride._id}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error in scheduled ride processor: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }
}

/**
 * Offer an unassigned scheduled ride to nearby drivers.
 * Does not cancel the booking if nobody is found — the poller/overdue path owns that.
 */
export async function offerUnassignedScheduledRide(
  rideId,
  { excludeDriverIds = [], overdue = false } = {}
) {
  const rideDoc = await Ride.findById(rideId)
    .populate('rider', 'name phone profileImage rating deviceToken')
    .populate('vehicleType');

  if (!rideDoc || rideDoc.driver) return { offered: false };
  if (!['requested', 'searching', 'scheduled'].includes(rideDoc.status)) {
    return { offered: false };
  }
  if (
    rideDoc.paymentMethod === 'card' &&
    String(rideDoc.paymentStatus || '').toLowerCase() === 'pending'
  ) {
    return { offered: false };
  }

  const matchedDrivers = await rideMatchingService.findAndMatchDrivers(
    rideDoc,
    undefined,
    overdue ? 10 : 5,
    excludeDriverIds
  );

  if (matchedDrivers.length === 0) {
    logger.info(`offerUnassignedScheduledRide: no drivers for ${rideId}`);
    return { offered: false };
  }

  await dispatchRide(rideDoc, matchedDrivers);
  return { offered: true, driverCount: matchedDrivers.length };
}

const scheduledRideService = new ScheduledRideService();

export default scheduledRideService;
