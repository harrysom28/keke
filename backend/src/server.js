// Load environment variables FIRST, before any other imports
import './config/env.js';

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/database.js';
import { createRedisClient } from './config/redis.js';
import { securityMiddleware } from './middleware/security.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { errorHandler, handleUnhandledRejection, handleUncaughtException } from './utils/errors.js';
import logger from './utils/logger.js';
import routes from './routes/index.js';
import { initializeSocketService } from './services/socketService.js';
import scheduledRideService from './services/scheduledRideService.js';

// Handle uncaught exceptions and rejections
handleUncaughtException();
handleUnhandledRejection();

// Create Express app
const app = express();

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
      const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || [];
      
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin || allowedOrigins.length === 0) {
        callback(null, true);
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Auth-Token'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
}

// Rate limiting
app.use('/api', apiLimiter);

// API routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Ride-Hailing API',
    version: '1.0.0',
    docs: '/api-docs',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Error handler (must be last)
app.use(errorHandler);

// Socket.io connection handler
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

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
  });

  // Join user room for private messages
  socket.on('join', (userId) => {
    socket.join(`user:${userId}`);
    socket.userId = userId;
    logger.info(`Socket ${socket.id} joined room: user:${userId}`);
  });

  // Join driver room
  socket.on('join-driver', (driverId) => {
    socket.join(`driver:${driverId}`);
    socket.join('available-drivers');
    socket.driverId = driverId;
    logger.info(`Socket ${socket.id} joined driver room: ${driverId}`);
  });

  // Leave user room
  socket.on('leave', (userId) => {
    socket.leave(`user:${userId}`);
    logger.info(`Socket ${socket.id} left room: user:${userId}`);
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
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis (optional - continues without it)
    // Only connect if Redis is explicitly configured
    if (process.env.REDIS_HOST && process.env.REDIS_HOST !== '') {
      try {
        createRedisClient();
      } catch (error) {
        logger.warn(`Redis connection skipped: ${error.message}`);
      }
    } else {
      logger.info('Redis not configured, skipping cache initialization');
    }

    // Start server
    const PORT = process.env.PORT || 8000;
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 API URL: http://localhost:${PORT}/api`);
      
      // Start scheduled ride service
      if (process.env.NODE_ENV !== 'test') {
        scheduledRideService.start();
      }
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Start server
startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  scheduledRideService.stop();
  server.close(() => {
    logger.info('Process terminated');
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  scheduledRideService.stop();
  server.close(() => {
    process.exit(0);
  });
});

export default app;
