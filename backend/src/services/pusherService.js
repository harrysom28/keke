import Pusher from 'pusher';
import logger from '../utils/logger.js';

// Initialize Pusher (if configured)
let pusher = null;
try {
  const pusherKey = process.env.PUSHER_KEY || process.env.PUSHER_APP_KEY;
  const pusherCluster = process.env.PUSHER_CLUSTER || process.env.PUSHER_APP_CLUSTER || 'mt1';
  
  if (process.env.PUSHER_APP_ID && pusherKey && process.env.PUSHER_SECRET) {
    pusher = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: pusherKey,
      secret: process.env.PUSHER_SECRET,
      cluster: pusherCluster,
      useTLS: true,
    });
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
        status: status,
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
      
      // Also emit to user-specific channels (mobile app expects private.{channel})
      if (ride.rider) {
        this.pusher.trigger(`private.user.${ride.rider._id.toString()}`, 'ride.status', statusData);
        this.pusher.trigger(`private.user-${ride.rider._id.toString()}`, 'ride.status', statusData); // Support both formats
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
