import Ride from '../models/Ride.js';
import logger from '../utils/logger.js';
import rideMatchingService from './rideMatchingService.js';
import notificationService from './notificationService.js';
import { dispatchRide, notifyNoDriverFound } from './driverNotificationService.js';

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
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

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
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, undefined, 5);

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
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, undefined, 10);

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

const scheduledRideService = new ScheduledRideService();

export default scheduledRideService;
