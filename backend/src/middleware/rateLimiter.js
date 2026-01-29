import rateLimit from 'express-rate-limit';

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes default
const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);

/**
 * General API rate limiter
 * Development-friendly: Higher limits and skips local IPs
 */
export const apiLimiter = rateLimit({
  windowMs,
  max: process.env.NODE_ENV === 'production' ? maxRequests : 10000, // 10000 in dev, configurable in prod
  
  // Skip rate limiting for local IPs in development
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
        return true; // Skip rate limiting for local IPs
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
  
  // Handler for when limit is exceeded
  handler: (req, res) => {
    console.log(`⚠️  Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP, please try again later.',
    });
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 5 : 1000, // 1000 in dev, 5 in prod
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  
  skip: (req) => {
    return process.env.NODE_ENV !== 'production' && process.env.SKIP_RATE_LIMIT === 'true';
  },
});

/**
 * OTP rate limiter
 * Configurable via environment variables:
 * - OTP_RATE_LIMIT_WINDOW_MS: Time window in milliseconds (default: 15 minutes)
 * - OTP_RATE_LIMIT_MAX: Maximum requests per window (default: 5, or 10 in development)
 */
export const otpLimiter = rateLimit({
  windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes default
  max: parseInt(process.env.OTP_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'development' ? '10' : '5'), 10), // 10 in dev, 5 in prod
  message: {
    status: 'error',
    message: 'Too many OTP requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  },
  // Add retry-after header
  handler: (req, res) => {
    const resetTime = new Date(Date.now() + parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10));
    res.status(429).json({
      status: 'error',
      message: 'Too many OTP requests, please try again later.',
      retryAfter: Math.ceil(parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000), // seconds
      retryAfterDate: resetTime.toISOString(),
    });
  },
});

/**
 * Password reset rate limiter
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: {
    status: 'error',
    message: 'Too many password reset attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
