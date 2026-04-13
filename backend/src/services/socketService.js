import logger from '../utils/logger.js';
import { mapRideStatusForClientApi, getLifecycleStatus } from '../utils/rideStatus.js';
import { formatOnlineDurationMs } from '../utils/driverOnlineTime.js';

/**
 * Socket.io service for real-time events
 */
class SocketService {
  constructor(io) {
    this.io = io;
    this._onlineTimeInterval = null;
  }

  /**
   * Broadcast live online duration to drivers on socket + Pusher (~every 8s).
   */
  startOnlineTimeBroadcast() {
    if (this._onlineTimeInterval) {
      clearInterval(this._onlineTimeInterval);
    }
    const tick = async () => {
      if (!this.io) return;
      try {
        const Driver = (await import('../models/Driver.js')).default;
        const drivers = await Driver.find({ isOnline: true })
          .select('todayOnlineMs onlineSessionStartedAt user')
          .populate('user', '_id')
          .lean();
        for (const d of drivers) {
          let ms = d.todayOnlineMs || 0;
          if (d.onlineSessionStartedAt) {
            ms += Date.now() - new Date(d.onlineSessionStartedAt).getTime();
          }
          const timeOnline = formatOnlineDurationMs(ms);
          const payload = { timeOnline };
          const id = d._id.toString();
          this.io.to(`driver:${id}`).emit('ONLINE_TIME_UPDATE', payload);
          const uid = d.user?._id?.toString();
          if (uid) {
            this.io.to(`user:${uid}`).emit('ONLINE_TIME_UPDATE', payload);
          }
          try {
            const { getPusherService } = await import('./pusherService.js');
            const ps = getPusherService();
            if (ps?.pusher) {
              ps.pusher.trigger(`private-driver-${id}`, 'ONLINE_TIME_UPDATE', payload);
            }
          } catch (e) {
            logger.debug(`Pusher ONLINE_TIME_UPDATE skip: ${e.message}`);
          }
        }
      } catch (err) {
        logger.warn(`Online time broadcast tick failed: ${err.message}`);
      }
    };
    this._onlineTimeInterval = setInterval(tick, 8000);
    tick();
  }

  /**
   * Emit ride request to nearby drivers
   */
  emitRideRequest(ride, nearbyDrivers) {
    if (!this.io) {
      logger.warn('Socket.io not initialized');
      return;
    }

    const rideData = {
      ride_id: ride._id.toString(),
      rider: {
        user_id: ride.rider._id?.toString() || ride.rider.toString(),
        name: ride.rider.name,
        phone: ride.rider.phone,
        rating: ride.rider.rating || 0,
      },
      pickup: {
        address: ride.pickupLocation.address,
        location: {
          latitude: ride.pickupLocation.coordinates[1],
          longitude: ride.pickupLocation.coordinates[0],
        },
      },
      dropoff: {
        address: ride.dropoffLocation.address,
        location: {
          latitude: ride.dropoffLocation.coordinates[1],
          longitude: ride.dropoffLocation.coordinates[0],
        },
      },
      fare: ride.fare.totalFare,
      distance: ride.distance?.value || 0,
      duration: ride.duration?.estimated || 0,
      vehicle_type: ride.vehicleType._id?.toString() || ride.vehicleType.toString(),
      created_at: ride.createdAt,
    };

    // Emit to all nearby drivers
    nearbyDrivers.forEach((driver) => {
      this.io.to(`driver:${driver._id.toString()}`).emit('ride-request', rideData);
      logger.info(`Ride request emitted to driver ${driver._id}`);
    });

    // Also emit to all available drivers in the area (broadcast)
    this.io.to('available-drivers').emit('new-ride-request', rideData);
  }

  /**
   * Emit a single ride offer to one driver (sequential offer queue payload).
   */
  emitRideOfferToDriver(driverId, ridePayload) {
    if (!this.io) {
      logger.warn('Socket.io not initialized');
      return;
    }
    const id = typeof driverId === 'string' ? driverId : driverId?.toString?.();
    if (!id) return;
    const ackPayload = { ...ridePayload, ack_required: true, sent_at: new Date().toISOString() };
    this.io.to(`driver:${id}`).emit('ride-request', ridePayload);
    this.io.to(`driver:${id}`).emit('NEW_RIDE_REQUEST', ackPayload);
    this.io.to(`driver:${id}`).emit('RIDE_REQUEST_RECEIVED', ackPayload);
    logger.info(`Ride offer emitted via Socket.io to driver ${id}`);
  }

  /**
   * Emit ride status update to rider
   */
  async emitRideStatusUpdate(ride, status, driver = null) {
    if (!this.io) {
      logger.warn('Socket.io not initialized');
      return;
    }

    const statusData = {
      ride_id: ride._id.toString(),
      status: mapRideStatusForClientApi(status),
      internal_status: status,
      lifecycle_status: getLifecycleStatus(status),
      driver: driver ? {
        driver_id: driver._id.toString(),
        name: driver.user?.name,
        phone: driver.user?.phone,
        image: driver.user?.profileImage,
        rating: driver.rating?.average || 0,
        vehicle: {
          make: driver.vehicleDetails?.make,
          model: driver.vehicleDetails?.model,
          plate_number: driver.vehicleDetails?.plateNumber,
          color: driver.vehicleDetails?.color,
        },
        location: driver.currentLocation ? {
          latitude: driver.currentLocation.coordinates[1],
          longitude: driver.currentLocation.coordinates[0],
        } : null,
      } : null,
      timestamp: new Date(),
    };

    // Emit via Socket.io
    this.io.to(`user:${ride.rider._id.toString()}`).emit('ride-status-update', statusData);
    
    // Emit to driver if assigned
    if (driver) {
      this.io.to(`driver:${driver._id.toString()}`).emit('ride-status-update', statusData);
    }

    // Also emit via Pusher for mobile app
    try {
      const { getPusherService } = await import('./pusherService.js');
      const pusherService = getPusherService();
      pusherService.emitRideStatusUpdate(ride, status, driver);
    } catch (error) {
      logger.warn(`Failed to emit ride status via Pusher: ${error.message}`);
    }

    logger.info(`Ride status update emitted: ${status} for ride ${ride._id}`);
  }

  /**
   * Emit driver location update to rider
   */
  async emitDriverLocationUpdate(ride, driver) {
    if (!this.io || !driver.currentLocation) {
      return;
    }

    const locationData = {
      ride_id: ride._id.toString(),
      driver_id: driver._id.toString(),
      location: {
        latitude: driver.currentLocation.coordinates[1],
        longitude: driver.currentLocation.coordinates[0],
        address: driver.currentLocation.address,
      },
      timestamp: new Date(),
    };

    // Emit via Socket.io (primary real-time path)
    this.io.to(`user:${ride.rider._id.toString()}`).emit('driver-location-update', locationData);
    const isTrip = ride.status === 'in-progress';
    this.io.to(`user:${ride.rider._id.toString()}`).emit(
      isTrip ? 'TRIP_LOCATION_UPDATE' : 'DRIVER_LOCATION_UPDATE',
      { ...locationData, phase: isTrip ? 'trip' : 'pickup' }
    );

    // Also emit via Pusher for mobile app
    try {
      const { getPusherService } = await import('./pusherService.js');
      const pusherService = getPusherService();
      
      // Calculate ETA and distance if possible
      let eta = null;
      let distance = null;
      if (ride.pickupLocation && driver.currentLocation) {
        // Simple distance calculation (can be improved with proper routing)
        const lat1 = ride.pickupLocation.coordinates[1];
        const lon1 = ride.pickupLocation.coordinates[0];
        const lat2 = driver.currentLocation.coordinates[1];
        const lon2 = driver.currentLocation.coordinates[0];
        
        // Haversine distance
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        distance = R * c; // Distance in km
        
        // Estimate ETA (assuming average speed of 30 km/h in city)
        eta = (distance / 30) * 60; // ETA in minutes
      }
      
      pusherService.emitDriverLocationUpdate(ride, driver, eta, distance);
    } catch (error) {
      logger.warn(`Failed to emit driver location via Pusher: ${error.message}`);
    }
  }

  /**
   * Emit ride accepted notification to rider
   */
  emitRideAccepted(ride, driver) {
    if (!this.io) {
      return;
    }

    const acceptedData = {
      ride_id: ride._id.toString(),
      driver: {
        driver_id: driver._id.toString(),
        name: driver.user?.name,
        phone: driver.user?.phone,
        image: driver.user?.profileImage,
        rating: driver.rating?.average || 0,
        vehicle: {
          make: driver.vehicleDetails?.make,
          model: driver.vehicleDetails?.model,
          plate_number: driver.vehicleDetails?.plateNumber,
          color: driver.vehicleDetails?.color,
        },
        location: driver.currentLocation ? {
          latitude: driver.currentLocation.coordinates[1],
          longitude: driver.currentLocation.coordinates[0],
        } : null,
        eta: null, // Calculate ETA
      },
      status: 'accepted',
      timestamp: new Date(),
    };

    this.io.to(`user:${ride.rider._id.toString()}`).emit('ride-accepted', acceptedData);
    this.io.to(`user:${ride.rider._id.toString()}`).emit('RIDE_ACCEPTED', acceptedData);
    logger.info(`Ride accepted notification sent to rider for ride ${ride._id}`);
  }

  /**
   * Emit ride started notification
   */
  async emitRideStarted(ride, driver) {
    if (!this.io) {
      return;
    }

    const startedData = {
      ride_id: ride._id.toString(),
      status: 'in-progress',
      started_at: ride.startedAt || new Date(),
      timestamp: new Date(),
    };

    // Emit via Socket.io
    this.io.to(`user:${ride.rider._id.toString()}`).emit('ride-started', startedData);
    this.io.to(`driver:${driver._id.toString()}`).emit('ride-started', startedData);
    
    // Also emit via Pusher for mobile app
    try {
      const { getPusherService } = await import('./pusherService.js');
      const pusherService = getPusherService();
      pusherService.emitRideStarted(ride, driver);
    } catch (error) {
      logger.warn(`Failed to emit ride started via Pusher: ${error.message}`);
    }
    
    logger.info(`Ride started notification sent for ride ${ride._id}`);
  }

  /**
   * Emit ride completed notification
   */
  async emitRideCompleted(ride) {
    if (!this.io) {
      return;
    }

    const completedData = {
      ride_id: ride._id.toString(),
      status: 'completed',
      completed_at: ride.completedAt || new Date(),
      fare: ride.fare.totalFare,
      payment_status: ride.paymentStatus,
      timestamp: new Date(),
    };

    // Emit via Socket.io
    this.io.to(`user:${ride.rider._id.toString()}`).emit('ride-completed', completedData);
    if (ride.driver) {
      this.io.to(`driver:${ride.driver._id.toString()}`).emit('ride-completed', completedData);
    }
    
    // Also emit via Pusher for mobile app
    try {
      const { getPusherService } = await import('./pusherService.js');
      const pusherService = getPusherService();
      pusherService.emitRideCompleted(ride);
    } catch (error) {
      logger.warn(`Failed to emit ride completed via Pusher: ${error.message}`);
    }
    
    logger.info(`Ride completed notification sent for ride ${ride._id}`);
  }

  /**
   * Emit ride cancelled notification
   */
  emitRideCancelled(ride, cancelledBy, reason) {
    if (!this.io) {
      return;
    }

    const cancelledData = {
      ride_id: ride._id.toString(),
      status: 'cancelled',
      cancelled_by: cancelledBy,
      reason: reason || null,
      cancellation_fee: ride.cancellation?.cancellationFee || 0,
      timestamp: new Date(),
    };

    this.io.to(`user:${ride.rider._id.toString()}`).emit('ride-cancelled', cancelledData);
    if (ride.driver) {
      this.io.to(`driver:${ride.driver._id.toString()}`).emit('ride-cancelled', cancelledData);
    }
    logger.info(`Ride cancelled notification sent for ride ${ride._id}`);
  }

  /**
   * Handle driver joining/leaving availability
   */
  handleDriverAvailability(driverId, isAvailable) {
    if (!this.io) {
      return;
    }

    if (isAvailable) {
      this.io.sockets.sockets.forEach((socket) => {
        if (socket.driverId === driverId.toString()) {
          socket.join('available-drivers');
          socket.join(`driver:${driverId}`);
        }
      });
    } else {
      this.io.to(`driver:${driverId}`).socketsLeave('available-drivers');
    }
  }

  /**
   * Emit message to ride chat room
   */
  emitChatMessage(rideId, message) {
    if (!this.io) {
      return;
    }

    this.io.to(`ride:${rideId}`).emit('new-chat-message', message);
    logger.info(`Chat message emitted to ride ${rideId}`);
  }

  /**
   * Push inbox notification to a user's connected clients (real-time list + badge).
   */
  emitNewNotification(userId, payload) {
    if (!this.io || !userId) {
      return;
    }
    const uid = typeof userId === 'string' ? userId : userId?.toString?.();
    if (!uid) return;
    this.io.to(`user:${uid}`).emit('NEW_NOTIFICATION', payload);
  }
}

let socketServiceInstance = null;

/**
 * Initialize socket service
 */
export const initializeSocketService = (io) => {
  socketServiceInstance = new SocketService(io);
  return socketServiceInstance;
};

/**
 * Get socket service instance
 */
export const getSocketService = () => {
  if (!socketServiceInstance) {
    logger.warn('Socket service not initialized');
  }
  return socketServiceInstance;
};

export default SocketService;
