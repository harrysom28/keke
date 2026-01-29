import logger from '../utils/logger.js';

/**
 * Socket.io service for real-time events
 */
class SocketService {
  constructor(io) {
    this.io = io;
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
   * Emit ride status update to rider
   */
  async emitRideStatusUpdate(ride, status, driver = null) {
    if (!this.io) {
      logger.warn('Socket.io not initialized');
      return;
    }

    const statusData = {
      ride_id: ride._id.toString(),
      status,
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

    // Emit via Socket.io
    this.io.to(`user:${ride.rider._id.toString()}`).emit('driver-location-update', locationData);

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
