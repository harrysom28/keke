import Pusher from 'pusher';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';

// Initialize Pusher (if configured). Same env vars as pusherService for auth.
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
  }
} catch (error) {
  logger.warn('Pusher not configured or initialization failed');
}

/**
 * Pusher user authentication - POST /api/broadcasting/pusher/user-auth
 * This endpoint authenticates users for private Pusher channels
 */
export const pusherUserAuth = asyncHandler(async (req, res) => {
  const { socket_id, channel_name } = req.body;

  if (!socket_id || !channel_name) {
    throw new ValidationError('Socket ID and channel name are required');
  }

  if (!pusher) {
    throw new ValidationError('Pusher is not configured');
  }

  // Authenticate user (already authenticated via protect middleware)
  const userId = req.user._id;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new NotFoundError('User');
  }

  // Authorize private channels (user-specific, driver-specific, or ride-specific)
  // Support both formats: private-{type}-{id} and private.{type}.{id}
  const isPrivateChannel = channel_name.startsWith('private-') || channel_name.startsWith('private.');
  const isPresenceChannel = channel_name.startsWith('presence-') || channel_name.startsWith('presence.');

  if (isPrivateChannel) {
    // Support multiple channel formats:
    // - private-user-{userId} or private.user.{userId}
    // - private-driver-{driverId} or private.driver.{driverId}
    // - private-ride-{rideId} or private.ride.{rideId} (user must be part of the ride)
    // - private.completed_ride, private.payment, private.started (global channels)
    const separator = channel_name.includes('.') ? '.' : '-';
    const channelParts = channel_name.split(separator);
    
    // Handle special global channels
    // Support both dot and hyphen formats for backward compatibility with clients.
    const GLOBAL_PRIVATE_CHANNELS = new Set([
      'private.completed_ride',
      'private.payment',
      'private.started',
      'private.driver_cancelled',
      'private.passenger_cancelled',
      'private-completed_ride',
      'private-payment',
      'private-started',
      'private-driver_cancelled',
      'private-passenger_cancelled',
    ]);
    if (GLOBAL_PRIVATE_CHANNELS.has(channel_name)) {
      // These are global channels - authorize for any authenticated user
      const auth = pusher.authorizeChannel(socket_id, channel_name);
      logger.info(`Pusher global channel authorized: ${channel_name} for user ${userId}`);
      return res.json(auth);
    }
    
    const channelType = channelParts[1]; // 'user', 'driver', or 'ride'
    const channelId = channelParts[channelParts.length - 1];

    if (channelType === 'ride') {
      // For ride channels, verify user is part of the ride
      const Ride = (await import('../models/Ride.js')).default;
      const ride = await Ride.findById(channelId)
        .populate('rider')
        .populate('driver.user');

      if (!ride) {
        throw new ValidationError('Ride not found');
      }

      const isRider = ride.rider._id.toString() === userId.toString();
      const isDriver = ride.driver?.user?._id?.toString() === userId.toString();

      if (!isRider && !isDriver) {
        throw new ValidationError('Unauthorized access to this ride channel');
      }
    } else if (channelType === 'user') {
      if (channelId !== userId.toString()) {
        throw new ValidationError('Unauthorized access to this channel');
      }
    } else if (channelType === 'driver') {
      const driver = await Driver.findById(channelId).select('user').lean();
      if (!driver?.user || driver.user.toString() !== userId.toString()) {
        throw new ValidationError('Unauthorized access to this channel');
      }
    } else {
      // Unknown channel type
      throw new ValidationError('Invalid channel type');
    }
  }

  // For presence channels, include user info
  if (isPresenceChannel) {
    const presenceData = {
      user_id: userId.toString(),
      user_info: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.profileImage,
      },
    };

    const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
    
    logger.info(`Pusher presence channel authorized: ${channel_name} for user ${userId}`);
    
    return res.json(auth);
  }

  // For private channels
  const auth = pusher.authorizeChannel(socket_id, channel_name);
  
  logger.info(`Pusher private channel authorized: ${channel_name} for user ${userId}`);
  
  res.json(auth);
});

/**
 * Test Pusher trigger - GET /api/test-pusher (public, no auth)
 * Disabled in production to avoid abuse and config leakage.
 */
export const testPusher = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ status: 'fail', message: 'Not found' });
  }
  if (!pusher) {
    return res.status(503).json({
      status: 'fail',
      message: 'Pusher not configured. Set PUSHER_APP_ID, PUSHER_APP_KEY, PUSHER_APP_SECRET, PUSHER_APP_CLUSTER in .env',
    });
  }
  const cluster = (process.env.PUSHER_CLUSTER || process.env.PUSHER_APP_CLUSTER || 'mt1').replace(/^["']|["']$/g, '').trim();
  try {
    pusher.trigger('test-channel', 'test-event', {
      message: 'Pusher is working!',
      timestamp: new Date().toISOString(),
      cluster,
    });
    res.json({
      status: 'success',
      message: 'Event sent to test-channel',
      pusherConfig: {
        cluster,
        appId: process.env.PUSHER_APP_ID,
      },
    });
  } catch (error) {
    logger.warn('Pusher test trigger failed:', error.message);
    res.status(500).json({
      status: 'fail',
      message: error.message,
    });
  }
});
