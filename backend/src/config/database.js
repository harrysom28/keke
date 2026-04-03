import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const maxPoolSize = parseInt(process.env.MONGO_POOL_SIZE || '10', 10);
const minPoolSize = parseInt(process.env.MONGO_MIN_POOL_SIZE || '2', 10);

function attachPoolMonitoring() {
  try {
    const mc = mongoose.connection.getClient?.();
    if (mc?.on) {
      mc.on('connectionPoolCreated', (event) => {
        logger.info(
          `Mongo pool created (maxPoolSize: ${event?.options?.maxPoolSize ?? maxPoolSize})`
        );
      });
      mc.on('connectionCheckOutFailed', (event) => {
        logger.warn(`Mongo connection checkout failed: ${event?.reason ?? 'unknown'}`);
      });
    }
  } catch (e) {
    logger.debug(`Mongo pool monitoring not attached: ${e.message}`);
  }
}

/**
 * Connect to MongoDB database
 */
export const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    const conn = await mongoose.connect(mongoURI, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '5000', 10),
      socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT_MS || '45000', 10),
      connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000', 10),
      heartbeatFrequencyMS: parseInt(process.env.MONGO_HEARTBEAT_FREQUENCY_MS || '10000', 10),
    });

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    attachPoolMonitoring();

    if (process.env.MONGOOSE_DEBUG === 'true' && process.env.NODE_ENV !== 'production') {
      mongoose.set('debug', (collectionName, method, ...parts) => {
        const q = parts[0];
        const snippet =
          typeof q === 'object' && q !== null
            ? JSON.stringify(q).slice(0, 400)
            : String(q ?? '').slice(0, 200);
        logger.debug(`Mongoose ${collectionName}.${method}`, { query: snippet });
      });
    }

    mongoose.connection.on('error', (err) => {
      logger.error(`MongoDB connection error: ${err}`);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    return conn;
  } catch (error) {
    logger.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error(`Error disconnecting from MongoDB: ${error.message}`);
  }
};

export default connectDB;
