import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import rideMatchingService from './rideMatchingService.js';
import { getSocketService } from './socketService.js';
import notificationService from './notificationService.js';

/**
 * Service to handle scheduled rides
 * Automatically assigns drivers when scheduled time arrives
 */
class ScheduledRideService {
  constructor() {
    this.intervalId = null;
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
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // Find scheduled rides that are within 5 minutes of their scheduled time
      // and haven't been assigned a driver yet
      const scheduledRides = await Ride.find({
        isScheduled: true,
        status: { $in: ['requested', 'scheduled'] },
        scheduledAt: {
          $lte: fiveMinutesFromNow,
          $gte: now,
        },
        driver: null,
      })
        .populate('rider', 'name phone deviceToken')
        .populate('vehicleType')
        .lean();

      for (const ride of scheduledRides) {
        try {
          // Find and match drivers
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, 10, 5);

          if (matchedDrivers.length > 0) {
            // Notify drivers about upcoming scheduled ride
            const socketService = getSocketService();
            if (socketService) {
              socketService.emitRideRequest(ride, matchedDrivers.map((d) => d.driver));
            }

            // Auto-assign if within 2 minutes of scheduled time
            const minutesUntilScheduled = (ride.scheduledAt - now) / (1000 * 60);
            if (minutesUntilScheduled <= 2) {
              await rideMatchingService.autoAssignDriver(ride, matchedDrivers);

            // Send notification to rider (need to find rider again since using lean)
            if (ride.rider?.deviceToken) {
              await notificationService.sendPushNotification(
                ride.rider.deviceToken,
                'Driver Assigned',
                `Your scheduled ride has been assigned. Driver will arrive soon.`,
                { rideId: ride._id.toString(), type: 'driver_assigned' }
              );
            }
            }
          }
        } catch (error) {
          logger.error(`Error processing scheduled ride ${ride._id}: ${error.message}`);
        }
      }

      // Also check for scheduled rides that are past their time but still unassigned
      const overdueRides = await Ride.find({
        isScheduled: true,
        status: { $in: ['requested', 'scheduled'] },
        scheduledAt: { $lt: now },
        driver: null,
      })
        .populate('rider', 'name phone deviceToken')
        .lean();

      for (const ride of overdueRides) {
        try {
          // Try to find alternative drivers with larger radius
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(ride, 20, 10);

          if (matchedDrivers.length > 0) {
            await rideMatchingService.autoAssignDriver(ride, matchedDrivers);
          } else {
            // Mark as no driver found
            ride.status = 'no-driver-found';
            ride.statusHistory.push({
              status: 'no-driver-found',
              timestamp: new Date(),
              note: 'No driver found for scheduled ride',
            });
            await ride.save();

            // Send notification to rider (need to find rider again since using lean)
            if (ride.rider?.deviceToken) {
              await notificationService.sendPushNotification(
                ride.rider.deviceToken,
                'No Driver Available',
                'We couldn\'t find a driver for your scheduled ride. Please try again.',
                { rideId: ride._id.toString(), type: 'no_driver_found' }
              );
            }
          }
        } catch (error) {
          logger.error(`Error processing overdue scheduled ride ${ride._id}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error in scheduled ride processor: ${error.message}`);
    }
  }
}

const scheduledRideService = new ScheduledRideService();

export default scheduledRideService;
