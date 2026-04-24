// Load environment variables FIRST, before any other imports
import './config/env.js';

import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}

// Production safety: never skip rate limiting
if (process.env.NODE_ENV === 'production' && process.env.SKIP_RATE_LIMIT === 'true') {
  console.error('FATAL: SKIP_RATE_LIMIT=true is not allowed in production');
  process.exit(1);
}

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB, disconnectDB } from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { ensureRedisConnected, closeRedisConnection, isRedisConfigured } from './config/redis.js';
import { securityMiddleware } from './middleware/security.js';
import { initRateLimiters, limiters } from './middleware/rateLimiter.js';
import { errorHandler, handleUnhandledRejection, handleUncaughtException } from './utils/errors.js';
import logger from './utils/logger.js';
import { initializeSocketService } from './services/socketService.js';
import scheduledRideService from './services/scheduledRideService.js';
import staleTripService from './services/staleTripService.js';
import { schedulePreloadRefresh } from './services/placeSearchPreload.js';
import {
  startOrphanedRideRecovery,
  stopOrphanedRideRecovery,
} from './startup/recoverOrphanedRides.js';

// Handle uncaught exceptions and rejections
handleUncaughtException();
handleUnhandledRejection();

// Create Express app
const app = express();

// Trust first proxy in development (ngrok/reverse proxy) so rate limiter reads X-Forwarded-For correctly.
// In production, control this explicitly via TRUST_PROXY (true/1 or a numeric hop count).
const trustProxyEnv = process.env.TRUST_PROXY;
if (typeof trustProxyEnv === 'string' && trustProxyEnv.trim() !== '') {
  const raw = trustProxyEnv.trim().toLowerCase();
  if (raw === 'true' || raw === '1') {
    app.set('trust proxy', 1);
  } else if (raw === 'false' || raw === '0') {
    app.set('trust proxy', false);
  } else {
    const hops = Number.parseInt(raw, 10);
    app.set('trust proxy', Number.isFinite(hops) ? hops : false);
  }
} else if (process.env.NODE_ENV !== 'production') {
  app.set('trust proxy', 1);
}

// Create HTTP server
const server = createServer(app);

// Create Socket.io server
const io = new Server(server, {
  cors: {
    origin: process.env.SOCKET_ORIGIN?.split(',') || ['http://localhost:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach io to app for use in routes/controllers
app.set('io', io);

// Initialize socket service
initializeSocketService(io);

// Security middleware
securityMiddleware(app);

// Paystack webhook - MUST use raw body for signature verification, before json parser
const paystackWebhookMiddleware = [
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    req.rawBody = req.body?.toString?.() ?? (typeof req.body === 'string' ? req.body : '');
    req.body = req.rawBody ? JSON.parse(req.rawBody) : {};
    next();
  },
  (req, res) => {
    const { handlePaystackWebhook } = require('./controllers/paystackWebhookController.js');
    handlePaystackWebhook(req, res);
  },
];
app.post('/api/payment/paystack/webhook', ...paystackWebhookMiddleware);
app.post('/api/paystack/webhook', ...paystackWebhookMiddleware);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// CORS middleware
const corsOptions = {
  origin: (origin, callback) => {
    // In production, restrict to specific origins
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean) || [];
      
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        callback(null, true);
        return;
      }
      // If CORS_ORIGIN not set, deny browser origins (mobile / no Origin still allowed above)
      if (allowedOrigins.length === 0) {
        callback(new Error('CORS not configured — set CORS_ORIGIN env variable'));
        return;
      }

      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Development: allow all origins
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Auth-Token',
    'ngrok-skip-browser-warning',
  ],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Serve uploaded files (profile images, etc.) at /uploads
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Rate limiting + API routes + 404 + error handler are mounted in startServer() after Redis connectivity is known

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Ride-Hailing API',
    version: '1.0.0',
    docs: '/api-docs',
  });
});

// Socket.io connection handler
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  if (!global.driverOfflineTimers) {
    global.driverOfflineTimers = new Map();
  }

  const clearOfflineTimer = (rideId) => {
    const key = rideId?.toString?.() || String(rideId || '');
    if (!key) return;
    const existing = global.driverOfflineTimers.get(key);
    if (existing?.timeoutId) clearTimeout(existing.timeoutId);
    global.driverOfflineTimers.delete(key);
  };

  const markDriverOfflineDuringTrip = async (driverUserId) => {
    try {
      if (!driverUserId) return;
      const Driver = (await import('./models/Driver.js')).default;
      const Ride = (await import('./models/Ride.js')).default;
      const { logRideAudit } = await import('./services/rideAuditLogService.js');
      const { getSocketService } = await import('./services/socketService.js');

      const driver = await Driver.findOne({ user: driverUserId }).select('_id user').lean();
      if (!driver?._id) return;

      const ride = await Ride.findOne({ driver: driver._id, status: 'in-progress' }).select(
        '_id rider driver status flag statusHistory updatedAt startedAt'
      );
      if (!ride?._id) return;

      const rideId = ride._id.toString();

      // Set flag + history (do not complete)
      if (ride.flag !== 'driver_offline_during_trip') {
        ride.flag = 'driver_offline_during_trip';
        ride.statusHistory.push({
          status: ride.status,
          timestamp: new Date(),
          note: 'Driver went offline during trip (socket disconnect)',
        });
        await ride.save();
      }

      await logRideAudit({
        rideId: ride._id,
        action: 'driver_offline',
        initiatedBy: driverUserId,
        initiatedByRole: 'driver',
        details: { flag: 'driver_offline_during_trip' },
      });

      // Emit event to rider
      const socketService = getSocketService();
      if (socketService?.io && ride.rider) {
        socketService.io.to(`user:${ride.rider.toString()}`).emit('trip:driver_offline', {
          rideId,
          message: 'Driver went offline. You may end the trip manually.',
        });
      }

      // Start 10-minute timer; if no reconnect, flag as stale timeout
      clearOfflineTimer(rideId);
      const timeoutId = setTimeout(async () => {
        try {
          const Ride2 = (await import('./models/Ride.js')).default;
          const { flagRideAsStaleTimeout } = await import('./services/staleTripService.js');
          const r = await Ride2.findById(rideId).select('_id status rider driver flag statusHistory updatedAt startedAt');
          if (!r || r.status !== 'in-progress') return;
          // Treat as stale (timeout) for ops review (do NOT auto-complete)
          await flagRideAsStaleTimeout(r);
        } catch (err) {
          logger.error(`Offline->stale flag failed for ride ${rideId}: ${err.message}`);
        } finally {
          clearOfflineTimer(rideId);
        }
      }, 10 * 60 * 1000);

      global.driverOfflineTimers.set(rideId, { timeoutId, driverUserId: String(driverUserId) });
      logger.warn(`Driver offline timer started (10m) for ride ${rideId}`);
    } catch (err) {
      logger.error(`markDriverOfflineDuringTrip failed: ${err.message}`);
    }
  };

  const handleDriverReconnected = async (driverUserId) => {
    try {
      if (!driverUserId) return;
      const Driver = (await import('./models/Driver.js')).default;
      const Ride = (await import('./models/Ride.js')).default;
      const { logRideAudit } = await import('./services/rideAuditLogService.js');

      const driver = await Driver.findOne({ user: driverUserId }).select('_id user').lean();
      if (!driver?._id) return;
      const ride = await Ride.findOne({ driver: driver._id, status: 'in-progress' }).select('_id flag statusHistory');
      if (!ride?._id) return;

      const rideId = ride._id.toString();
      const timer = global.driverOfflineTimers.get(rideId);
      if (timer?.timeoutId) {
        clearOfflineTimer(rideId);
      }

      if (ride.flag === 'driver_offline_during_trip') {
        ride.flag = null;
        ride.statusHistory.push({
          status: 'in-progress',
          timestamp: new Date(),
          note: 'Driver reconnected during trip; offline flag cleared',
        });
        await ride.save();
        await logRideAudit({
          rideId: ride._id,
          action: 'driver_reconnected',
          initiatedBy: driverUserId,
          initiatedByRole: 'driver',
          details: { clearedFlag: 'driver_offline_during_trip' },
        });
      }
    } catch (err) {
      logger.error(`handleDriverReconnected failed: ${err.message}`);
    }
  };

  // Authenticate socket with JWT token
  socket.on('authenticate', async (data) => {
    try {
      const { token, userId, userRole } = data;

      // In production, require JWT token
      if (process.env.NODE_ENV === 'production' && !token) {
        logger.warn(`Socket ${socket.id} attempted authentication without token`);
        socket.emit('authentication-error', { message: 'Authentication token required' });
        socket.disconnect();
        return;
      }

      let decoded;
      let authenticatedUserId = userId;
      let authenticatedUserRole = userRole;

      // Verify JWT token if provided
      if (token) {
        try {
          const { verifyAccessToken } = await import('./utils/jwt.js');
          decoded = verifyAccessToken(token);
          authenticatedUserId = decoded.id;
          authenticatedUserRole = decoded.role || userRole;

          // Verify user exists and is active
          const User = (await import('./models/User.js')).default;
          const user = await User.findById(authenticatedUserId).select('-password');
          
          if (!user) {
            throw new Error('User not found');
          }

          if (!user.isActive) {
            throw new Error('User account is deactivated');
          }

          // Update userRole from database if different
          authenticatedUserRole = user.role || authenticatedUserRole;
        } catch (error) {
          logger.error(`Socket JWT verification error: ${error.message}`);
          socket.emit('authentication-error', { message: 'Invalid or expired token' });
          socket.disconnect();
          return;
        }
      } else if (process.env.NODE_ENV !== 'production') {
        // Development mode: allow userId directly (for testing)
        if (!userId) {
          logger.warn(`Socket ${socket.id} attempted authentication without userId or token`);
          socket.emit('authentication-error', { message: 'userId required' });
          return;
        }
      } else {
        // Production mode without token
        logger.warn(`Socket ${socket.id} attempted authentication without token in production`);
        socket.emit('authentication-error', { message: 'Authentication token required' });
        socket.disconnect();
        return;
      }

      if (authenticatedUserId) {
        socket.userId = authenticatedUserId;
        socket.userRole = authenticatedUserRole;

        // Join user-specific room
        socket.join(`user:${authenticatedUserId}`);

        // If driver, join driver-specific rooms
        if (authenticatedUserRole === 'driver') {
          socket.driverId = authenticatedUserId;
          socket.join(`driver:${authenticatedUserId}`);
          socket.join('available-drivers');
          // Reconnect: clear any offline timer/flags for in-progress trips.
          handleDriverReconnected(authenticatedUserId).catch(() => {});
        }

        logger.info(`Socket ${socket.id} authenticated for user ${authenticatedUserId} (${authenticatedUserRole})`);
        socket.emit('authenticated', { success: true, userId: authenticatedUserId, role: authenticatedUserRole });
      }
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      socket.emit('authentication-error', { message: 'Authentication failed' });
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
    if (socket.userRole === 'driver' && socket.userId) {
      markDriverOfflineDuringTrip(socket.userId).catch(() => {});
    }
  });

  // Join user room for private messages (only allow own room)
  socket.on('join', (userId) => {
    const uid = userId != null ? String(userId) : '';
    if (socket.userId && socket.userId.toString() !== uid) {
      logger.warn(`Socket ${socket.id} attempted to join user:${uid}, authenticated as ${socket.userId}`);
      return;
    }
    if (uid) {
      socket.join(`user:${uid}`);
      if (!socket.userId) socket.userId = uid;
      logger.info(`Socket ${socket.id} joined room: user:${uid}`);
    }
  });

  // Join driver room (only allow own driver id)
  socket.on('join-driver', (driverId) => {
    const did = driverId != null ? String(driverId) : '';
    if (socket.driverId && socket.driverId.toString() !== did) {
      logger.warn(`Socket ${socket.id} attempted to join driver:${did}, authenticated as driver:${socket.driverId}`);
      return;
    }
    if (did) {
      socket.join(`driver:${did}`);
      socket.join('available-drivers');
      if (!socket.driverId) socket.driverId = did;
      logger.info(`Socket ${socket.id} joined driver room: ${did}`);
    }
  });

  // Leave user room (only allow leaving own room)
  socket.on('leave', (userId) => {
    const uid = userId != null ? String(userId) : '';
    if (socket.userId && socket.userId.toString() !== uid) {
      logger.warn(`Socket ${socket.id} attempted to leave user:${uid}, authenticated as ${socket.userId}`);
      return;
    }
    if (uid) {
      socket.leave(`user:${uid}`);
      logger.info(`Socket ${socket.id} left room: user:${uid}`);
    }
  });

  // Handle ride acceptance from driver
  socket.on('accept-ride', async (data) => {
    try {
      // This would be handled by the driverController.acceptRide
      // Socket is mainly for notifications
      logger.info(`Driver ${socket.driverId} accepted ride ${data.rideId} via socket`);
    } catch (error) {
      logger.error(`Error handling ride acceptance: ${error.message}`);
    }
  });

  // Handle chat room joining
  socket.on('join-ride-chat', (rideId) => {
    socket.join(`ride:${rideId}`);
    logger.info(`Socket ${socket.id} joined ride chat room: ${rideId}`);
  });

  // Handle chat room leaving
  socket.on('leave-ride-chat', (rideId) => {
    socket.leave(`ride:${rideId}`);
    logger.info(`Socket ${socket.id} left ride chat room: ${rideId}`);
  });
});

// Connect to databases
const startServer = async () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      const corsOrigins =
        process.env.CORS_ORIGIN?.split(',')
          .map((o) => o.trim())
          .filter(Boolean) || [];
      if (corsOrigins.length === 0) {
        logger.warn(
          'CORS_ORIGIN is empty in production — browser requests with an Origin header will be rejected until CORS_ORIGIN is set'
        );
      }
    }

    // Connect to MongoDB
    await connectDB();

    // Learning pipeline crons (production)
    if (process.env.NODE_ENV === 'production') {
      await import('./cron/learningJobs.js');
      logger.info('✅ Learning pipeline cron jobs registered');
    }

    // Preload places + pickup points into memory for 1–3ms autocomplete
    schedulePreloadRefresh();

    // Weekly: deactivate learned places with no rides in 90 days
    setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const result = await (await import('./models/Place.js')).default.updateMany(
          {
            source: 'learned',
            active: true,
            lastRideAt: { $lt: cutoff },
          },
          { $set: { active: false } }
        );
        if (result.modifiedCount > 0) {
          logger.info(`[PlaceCleanup] Deactivated ${result.modifiedCount} stale learned places`);
        }
      } catch (err) {
        logger.warn(`[PlaceCleanup] Failed: ${err.message}`);
      }
    }, 7 * 24 * 60 * 60 * 1000);

    let redisOk = false;
    if (isRedisConfigured()) {
      redisOk = await ensureRedisConnected();
      if (!redisOk) {
        logger.warn(
          'Redis unavailable — distributed rate limits fall back to per-process memory; OTP requires a working Redis when REDIS_URL or REDIS_HOST is set'
        );
      }
    } else {
      logger.info('Redis not configured, skipping cache initialization');
    }

    process.env.USE_REDIS_RATE_LIMIT_STORE =
      process.env.NODE_ENV === 'test'
        ? 'false'
        : redisOk && isRedisConfigured()
          ? 'true'
          : 'false';

    initRateLimiters();
    const { default: routes } = await import('./routes/index.js');
    app.use('/api', limiters.apiLimiter);
    app.use('/api', routes);

    // 404 catch-all must run after all route mounts
    app.use((req, res) => {
      res.status(404).json({
        status: 'error',
        message: `Route ${req.originalUrl} not found`,
      });
    });

    // Global error handler must be last
    app.use(errorHandler);

    logger.info(
      `Rate limiting store: ${process.env.USE_REDIS_RATE_LIMIT_STORE === 'true' ? 'Redis' : 'in-memory'}`
    );

    // Start server; if preferred port is in use, try next port (8001, 8002, ...)
    const preferredPort = parseInt(process.env.PORT, 10) || 8000;
    const maxTries = 10;
    let tryCount = 0;

    const tryListen = (port) => {
      tryCount += 1;
      if (tryCount > maxTries) {
        logger.error(`Could not bind to any port ${preferredPort}..${preferredPort + maxTries - 1}. All in use.`);
        process.exit(1);
      }
      const onError = (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn(`Port ${port} is in use, trying ${port + 1}...`);
          tryListen(port + 1);
          return;
        }
        logger.error(`Server error: ${err.message}`);
        process.exit(1);
      };
      server.once('error', onError);
      server.listen(port, () => {
        server.removeListener('error', onError);
        logger.info(`🚀 Server running on port ${port}`);
        if (port !== preferredPort) {
          logger.info(`   (Port ${preferredPort} was in use; using ${port}. Admin/API: set API to http://localhost:${port})`);
        }
        logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`🌐 API URL: http://localhost:${port}/api`);
        if (process.env.NODE_ENV !== 'test') {
          scheduledRideService.start();
          staleTripService.start();
          startOrphanedRideRecovery();
        }
        import('./services/socketService.js')
          .then(({ getSocketService }) => {
            getSocketService()?.startOnlineTimeBroadcast?.();
          })
          .catch(() => {});
      });
    };

    tryListen(preferredPort);
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Start server
startServer();

// Graceful shutdown: stop accepting connections, then close DB
async function gracefulShutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  try {
    const { getSocketService } = await import('./services/socketService.js');
    const svc = getSocketService();
    if (svc?._onlineTimeInterval) {
      clearInterval(svc._onlineTimeInterval);
      svc._onlineTimeInterval = null;
    }
  } catch (_) {
    /* ignore */
  }
  scheduledRideService.stop();
  staleTripService.stop();
  stopOrphanedRideRecovery();
  server.close(() => {
    Promise.all([disconnectDB(), closeRedisConnection()])
      .then(() => {
        logger.info('Process terminated');
        process.exit(0);
      })
      .catch((err) => {
        logger.error(`Shutdown error: ${err.message}`);
        process.exit(1);
      });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
