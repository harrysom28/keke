import mongoose from 'mongoose';
import logger from './logger.js';
import * as Sentry from '@sentry/node';

/**
 * Custom Error Classes
 */
export class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = {}) {
    super(message, 400);
    this.errors = errors;
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  /**
   * Use a short resource label (e.g. "Ride") → "Ride not found".
   * Pass a full sentence (contains "." or ends with "not found") → message is sent as-is.
   */
  constructor(message = 'Resource') {
    const raw = String(message ?? 'Resource').trim();
    const isFullSentence =
      /\bnot\s+found\.?$/i.test(raw) || (raw.includes('.') && raw.length > 3);
    const text = isFullSentence ? raw : `${raw} not found`;
    super(text, 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      status: 'error',
      message: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      status: 'error',
      message: `${field} already exists`,
    });
  }

  // Mongoose validation error (distinct from our AppError ValidationError)
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e) => {
      if (e.kind === 'enum') {
        // Generic but accurate: enum mismatch can be triggered by many models, not just user accounts.
        return `${e.path} is invalid`;
      }
      if (e.kind === 'required') {
        return `${e.path} is required`;
      }
      return e.message;
    });
    return res.status(400).json({
      status: 'error',
      message: messages[0], // send first message, not a joined blob
    });
  }

  if (err.name === 'EscrowWalletError') {
    err.statusCode = 402;
    err.status = 'fail';
    err.isOperational = true;
  }
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
      sendErrorProd(err, res);
    } else {
      // Programming or other unknown error: don't leak error details
      logger.error('ERROR 💥', err);
      sendErrorProd(
        new AppError('Something went wrong!', 500),
        res
      );
    }
  }
};

/**
 * Send error response in development
 */
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Send error response in production
 */
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    const response = {
      status: err.status,
      message: err.message,
    };

    if (err.errors && Object.keys(err.errors).length > 0) {
      response.errors = err.errors;
    }
    if (err.statusCode === 402 && err.code) {
      response.code = err.code;
      if (err.data && Object.keys(err.data).length > 0) response.data = err.data;
    }

    res.status(err.statusCode).json(response);
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('ERROR 💥', err);
    res.status(500).json({
      status: 'error',
      message: 'Something went wrong!',
    });
  }
};

/**
 * Handle async errors in route handlers
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Catch unhandled promise rejections
 */
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection — server kept alive', { reason, promise });
    // Sync errors still exit via uncaughtException; async rejections may be transient — do not kill the process.
    if (process.env.SENTRY_DSN && process.env.NODE_ENV !== 'test') {
      try {
        Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
      } catch (_) {
        // Sentry optional
      }
    }
  });
};

/**
 * Catch uncaught exceptions
 */
export const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    logger.error(err.message || String(err));
    process.exit(1);
  });
};
