import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import logger from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
/** Mobile apps poll several endpoints; default 100/15min per IP was too easy to hit from one driver session. */
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '400', 10);

/**
 * Set in server startup after ensureRedisConnected():
 * - "true"  → Redis-backed store (cluster-safe)
 * - "false" → default in-memory store per process
 */
function shouldUseRedisStore() {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return process.env.USE_REDIS_RATE_LIMIT_STORE === 'true';
}

function makeRedisStore(prefix) {
  if (!shouldUseRedisStore()) {
    return undefined;
  }

  return new RedisStore({
    sendCommand: async (...args) => {
      const client = getRedisClient();
      if (!client) {
        throw new Error('Redis client not available for rate limit');
      }
      if (!client.isOpen) {
        await client.connect();
      }
      return client.sendCommand(args);
    },
    prefix,
  });
}

function otpRateLimitKey(req) {
  const body = req.body || {};
  const raw =
    body.phone ||
    body.email_phone_number ||
    body.email ||
    body.emailPhoneNumber ||
    '';
  const normalized = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (normalized) {
    return `otp:${normalized}`;
  }
  return req.ip || 'unknown';
}

/** Populated by initRateLimiters() — must run before importing route modules. */
export const limiters = {};

/**
 * Build rate limiters after Redis connectivity is known (see server.js).
 */
export function initRateLimiters() {
  if (limiters.apiLimiter) {
    return;
  }

  limiters.apiLimiter = rateLimit({
    windowMs,
    max: process.env.NODE_ENV === 'production' ? maxRequests : 10000,
    store: makeRedisStore('rl:api:'),

    skip: (req) => {
      if (process.env.NODE_ENV === 'test') {
        return true;
      }

      if (process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true') {
        const clientIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
        const isLocal =
          clientIp === '::1' ||
          clientIp === '127.0.0.1' ||
          clientIp === '::ffff:127.0.0.1' ||
          clientIp?.includes('10.0.2.2') ||
          clientIp?.includes('localhost') ||
          clientIp?.startsWith('192.168.') ||
          clientIp?.startsWith('172.') ||
          clientIp?.startsWith('10.');

        if (isLocal) {
          return true;
        }
      }
      return false;
    },

    message: {
      status: 'error',
      message: 'Too many requests from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,

    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        status: 'error',
        message: 'Too many requests from this IP, please try again later.',
      });
    },
  });

  limiters.authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 5 : 1000,
    store: makeRedisStore('rl:auth:'),
    message: {
      status: 'error',
      message: 'Too many authentication attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,

    skip: (req) => {
      return process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true';
    },
  });

  limiters.otpLimiter = rateLimit({
    windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(
      process.env.OTP_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? '10' : '5'),
      10
    ),
    store: makeRedisStore('rl:otp:'),
    keyGenerator: otpRateLimitKey,
    message: {
      status: 'error',
      message: 'Too many OTP requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      return process.env.NODE_ENV === 'test';
    },
    handler: (req, res) => {
      const resetTime = new Date(Date.now() + parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10));
      res.status(429).json({
        status: 'error',
        message: 'Too many OTP requests, please try again later.',
        retryAfter: Math.ceil(parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000),
        retryAfterDate: resetTime.toISOString(),
      });
    },
  });

  /** Verify attempts (confirm / login-with-otp): separate bucket so SMS resends do not exhaust verify budget. */
  limiters.otpVerifyLimiter = rateLimit({
    windowMs: parseInt(process.env.OTP_VERIFY_RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.OTP_VERIFY_RATE_LIMIT_MAX || '40', 10),
    store: makeRedisStore('rl:otpverify:'),
    keyGenerator: otpRateLimitKey,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      return process.env.NODE_ENV === 'test';
    },
    message: {
      status: 'error',
      message: 'Too many verification attempts, please try again later.',
    },
    handler: (req, res) => {
      const windowMs = parseInt(process.env.OTP_VERIFY_RATE_LIMIT_WINDOW_MS || '900000', 10);
      res.status(429).json({
        status: 'error',
        message: 'Too many verification attempts, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });

  limiters.passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    store: makeRedisStore('rl:pwdreset:'),
    message: {
      status: 'error',
      message: 'Too many password reset attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  limiters.refreshTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 30 : 200,
    store: makeRedisStore('rl:refresh:'),
    message: {
      status: 'error',
      message: 'Too many token refresh attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'test',
  });

  limiters.adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 5 : 50,
    store: makeRedisStore('rl:adminlogin:'),
    message: {
      status: 'error',
      message: 'Too many admin login attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: (req) => process.env.NODE_ENV === 'test',
  });

  limiters.rideCreationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 3 : 20,
    store: makeRedisStore('rl:ridecreate:'),
    message: { status: 'error', message: 'Too many booking attempts. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip || 'anon',
    skip: (req) => process.env.NODE_ENV === 'test',
  });

  limiters.walletOpsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 10 : 60,
    store: makeRedisStore('rl:wallet:'),
    message: { status: 'error', message: 'Too many wallet requests. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip || 'anon',
    skip: (req) => process.env.NODE_ENV === 'test',
  });

  limiters.supportTicketsLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 5 : 20,
    store: makeRedisStore('rl:support:'),
    message: { status: 'error', message: 'Too many support requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id?.toString() || req.ip || 'anon',
    skip: (req) => process.env.NODE_ENV === 'test',
  });
}
