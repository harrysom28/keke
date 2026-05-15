import Pusher from 'pusher';
import logger from '../utils/logger.js';
import { mapRideStatusForClientApi, getLifecycleStatus } from '../utils/rideStatus.js';

// Initialize Pusher (if configured). Supports PUSHER_APP_* and PUSHER_* env vars.
let pusher = null;
try {
  const pusherKey = process.env.PUSHER_KEY || process.env.PUSHER_APP_KEY;
  const pusherSecret = process.env.PUSHER_APP_SECRET || process.env.PUSHER_SECRET;
  const pusherCluster = (process.env.PUSHER_CLUSTER || process.env.PUSHER_APP_CLUSTER || 'mt1').replace(/^["']|["']$/g, '').trim();
  const useTLS = process.env.PUSHER_SCHEME !== 'http';
  const pusherHost = process.env.PUSHER_HOST;
  const pusherPort = process.env.PUSHER_PORT ? parseInt(process.env.PUSHER_PORT, 10) : undefined;

  if (process.env.PUSHER_APP_ID && pusherKey && pusherSecret) {
    const options = {
      appId: process.env.PUSHER_APP_ID,
      key: pusherKey,
      secret: pusherSecret,
      cluster: pusherCluster,
      useTLS,
    };
    if (pusherHost) options.host = pusherHost;
    if (pusherPort) options.port = pusherPort;
    pusher = new Pusher(options);
    logger.info('Pusher service initialized successfully');
  } else {
    logger.warn('Pusher not configured - missing environment variables');
  }
} catch (error) {
  logger.warn('Pusher initialization failed:', error.message);
}

/**
 * Pusher service for emitting real-time events to mobile app
 */
class PusherService {
  constructor() {
    this.pusher = pusher;
  }

  /**
   * Emit driver location update to rider via Pusher
   */
  emitDriverLocationUpdate(ride, driver, eta = null, distance = null) {
    if (!this.pusher || !driver.currentLocation) {
      return;
    }

    try {
      const locationData = {
        driver_location: {
          lat: driver.currentLocation.coordinates[1],
          long: driver.currentLocation.coordinates[0],
          name: driver.currentLocation.address || null,
        },
        eta: eta,
        distance: distance,
      };

      // Emit to ride-specific channel (mobile app expects private.ride.{rideId})
      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'driver.location', locationData);
      logger.debug(`Pusher: Driver location update emitted for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit driver location via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit ride status update
   */
  emitRideStatusUpdate(ride, status, driver = null) {
    if (!this.pusher) {
      return;
    }

    try {
      const statusData = {
        ride_id: ride._id.toString(),
        status: mapRideStatusForClientApi(status),
        internal_status: status,
        lifecycle_status: getLifecycleStatus(status),
        driver: driver ? {
          driver_id: driver._id.toString(),
          driver_user_id: driver.user?._id?.toString(),
          driver_name: driver.user?.name,
          driver_image: driver.user?.profileImage,
          driver_rating: driver.rating?.average || 0,
          vehicle_image: driver.vehicleImages?.[0]?.url || null,
          vehicle_name: driver.vehicleDetails?.make && driver.vehicleDetails?.model
            ? `${driver.vehicleDetails.make} ${driver.vehicleDetails.model}`
            : null,
          vehicle_color: driver.vehicleDetails?.color || null,
          licence_plate_number: driver.vehicleDetails?.plateNumber || null,
        } : null,
        timestamp: new Date().toISOString(),
      };

      // Emit to ride channel (mobile app expects private.ride.{rideId})
      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride.status', statusData);

      // Rider mobile listens on private-user-{userId} (hyphen form); keep dot variants for older clients.
      if (ride.rider) {
        const riderId = ride.rider._id?.toString?.() || ride.rider.toString();
        this.pusher.trigger(`private-user-${riderId}`, 'ride.status', statusData);
        this.pusher.trigger(`private.user.${riderId}`, 'ride.status', statusData);
        this.pusher.trigger(`private.user-${riderId}`, 'ride.status', statusData);
      }
      if (driver) {
        this.pusher.trigger(`private.driver-${driver._id.toString()}`, 'ride.status', statusData);
      }

      logger.debug(`Pusher: Ride status update emitted: ${status} for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit ride status via Pusher: ${error.message}`);
    }
  }

  /**
   * Explicit rider event when a driver accepts (mobile listens on private-user-{riderId}).
   */
  emitRideAccepted(ride, driver = null) {
    if (!this.pusher || !ride?.rider) {
      return;
    }

    try {
      const riderId = ride.rider._id?.toString?.() || ride.rider.toString();
      const payload = {
        ride_id: ride._id.toString(),
        rideId: ride._id.toString(),
        status: 'accepted',
        internal_status: 'accepted',
        subType: 'ride_accepted',
        event_key: 'ride_accepted',
        driver: driver
          ? {
              driver_id: driver._id.toString(),
              driver_user_id: driver.user?._id?.toString(),
              driver_name: driver.user?.name,
              driver_image: driver.user?.profileImage,
              driver_rating: driver.rating?.average || 0,
              vehicle_name:
                driver.vehicleDetails?.make && driver.vehicleDetails?.model
                  ? `${driver.vehicleDetails.make} ${driver.vehicleDetails.model}`
                  : null,
              vehicle_color: driver.vehicleDetails?.color || null,
              licence_plate_number: driver.vehicleDetails?.plateNumber || null,
            }
          : null,
        timestamp: new Date().toISOString(),
      };

      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride_accepted', payload);
      this.pusher.trigger(`private-user-${riderId}`, 'ride_accepted', payload);
      this.pusher.trigger(`private.user.${riderId}`, 'ride_accepted', payload);
      this.pusher.trigger(`private.user-${riderId}`, 'ride_accepted', payload);
      logger.debug(`Pusher: ride_accepted emitted for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit ride_accepted via Pusher: ${error.message}`);
    }
  }

  /**
   * Rider/driver cancel — mobile clears active ride UI from private-user / private.ride channels.
   */
  emitRideCancelled(ride, cancelledBy = 'driver', reason = null) {
    if (!this.pusher || !ride?.rider) {
      return;
    }

    try {
      const riderId = ride.rider._id?.toString?.() || ride.rider.toString();
      const internalStatus = ride.status || 'cancelled';
      const clientStatus =
        internalStatus === 'searching' ? 'requested' : internalStatus;
      const payload = {
        ride_id: ride._id.toString(),
        rideId: ride._id.toString(),
        status: clientStatus,
        internal_status: internalStatus,
        cancelled_by: cancelledBy,
        reason: reason || null,
        subType: cancelledBy === 'driver' ? 'driver_cancelled' : 'ride_cancelled',
        event_key:
          cancelledBy === 'driver' ? 'ride_cancelled_by_driver' : 'ride_cancelled_by_rider',
        timestamp: new Date().toISOString(),
      };

      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride.status', payload);
      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride_cancelled', payload);
      this.pusher.trigger(`private-user-${riderId}`, 'ride.status', payload);
      this.pusher.trigger(`private-user-${riderId}`, 'ride_cancelled', payload);
      this.pusher.trigger(`private.user.${riderId}`, 'ride.status', payload);
      this.pusher.trigger(`private.user-${riderId}`, 'ride_cancelled', payload);
      // Legacy channel the rider app still listens on
      this.pusher.trigger('private.driver_cancelled', 'driver_cancelled', payload);
      this.pusher.trigger(`private-user-${riderId}`, 'driver_cancelled', payload);
      logger.debug(`Pusher: ride_cancelled emitted for ride ${ride._id} (${internalStatus})`);
    } catch (error) {
      logger.error(`Failed to emit ride_cancelled via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit ride completed event
   */
  emitRideCompleted(ride) {
    if (!this.pusher) {
      return;
    }

    try {
      const completedData = {
        ride_id: ride._id.toString(),
        status: 'completed',
        completed_at: ride.completedAt || new Date().toISOString(),
        fare: ride.fare.totalFare,
        payment_status: ride.paymentStatus,
        timestamp: new Date().toISOString(),
      };

      // Emit to user channel (for trip completed modal) - mobile app expects private.completed_ride
      if (ride.rider) {
        this.pusher.trigger(`private.completed_ride`, 'completed_ride', completedData);
        this.pusher.trigger(`private.user-${ride.rider._id.toString()}`, 'completed_ride', completedData);
      }
      
      // Emit to ride channel
      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride.completed', completedData);

      logger.info(`Pusher: Ride completed event emitted for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit ride completed via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit payment receipt event
   */
  emitPaymentReceipt(ride, payment) {
    if (!this.pusher) {
      return;
    }

    try {
      const receiptData = {
        ride_id: ride._id.toString(),
        payment_id: payment._id?.toString(),
        amount: payment.amount || ride.fare.totalFare,
        payment_method: payment.method || ride.paymentMethod,
        status: payment.status || 'completed',
        timestamp: new Date().toISOString(),
      };

      // Emit to user channel (for payment receipt modal) - mobile app expects private.payment
      if (ride.rider) {
        this.pusher.trigger(`private.payment`, 'payment', receiptData);
        this.pusher.trigger(`private.user-${ride.rider._id.toString()}`, 'payment', receiptData);
      }

      logger.info(`Pusher: Payment receipt event emitted for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit payment receipt via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit ride started event
   */
  emitRideStarted(ride, driver) {
    if (!this.pusher) {
      return;
    }

    try {
      const startedData = {
        ride_id: ride._id.toString(),
        status: 'in-progress',
        started_at: ride.startedAt || new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      // Emit to user channel - mobile app expects private.started
      this.pusher.trigger(`private.started`, 'started', startedData);
      
      // Also emit to user-specific channel
      if (ride.rider) {
        this.pusher.trigger(`private.user-${ride.rider._id.toString()}`, 'started', startedData);
      }
      
      // Emit to ride channel
      this.pusher.trigger(`private.ride.${ride._id.toString()}`, 'ride.started', startedData);

      logger.info(`Pusher: Ride started event emitted for ride ${ride._id}`);
    } catch (error) {
      logger.error(`Failed to emit ride started via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit a generic in-app notification to a user-specific channel.
   */
  emitNotification(userId, payload) {
    if (!this.pusher || !userId) {
      return false;
    }

    try {
      this.pusher.trigger(`private-user-${userId.toString()}`, 'notification', payload);
      logger.debug(`Pusher: Notification emitted for user ${userId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to emit notification via Pusher: ${error.message}`);
      return false;
    }
  }

  /**
   * Live driver GPS for rider map while driver is en route / at pickup (accepted | arrived).
   */
  async emitDriverLiveLocationToRider(driverId, lat, lng, heading = null) {
    if (!this.pusher || driverId == null) {
      return;
    }
    try {
      const Ride = (await import('../models/Ride.js')).default;
      const activeRide = await Ride.findOne({
        driver: driverId,
        status: { $in: ['accepted', 'arrived'] },
      })
        .select('rider')
        .lean();

      if (!activeRide?.rider) {
        return;
      }

      const riderId = activeRide.rider.toString();
      const h =
        heading != null && heading !== '' && !Number.isNaN(Number(heading))
          ? Number(heading)
          : null;

      this.pusher.trigger(`private-user-${riderId}`, 'driver-location-update', {
        lat,
        lng,
        heading: h,
        rideId: activeRide._id.toString(),
      });
      logger.debug(`Pusher: driver-location-update for rider ${riderId}`);
    } catch (error) {
      logger.error(`Failed to emit driver-location-update: ${error.message}`);
    }
  }
}

let pusherServiceInstance = null;

/**
 * Get Pusher service instance
 */
export const getPusherService = () => {
  if (!pusherServiceInstance) {
    pusherServiceInstance = new PusherService();
  }
  return pusherServiceInstance;
};

export default PusherService;
