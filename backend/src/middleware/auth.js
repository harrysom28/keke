import {
  verifyAccessToken,
  verifyAccessTokenForDriverCreate,
  DRIVER_CREATE_TOKEN_GRACE_MS,
} from '../utils/jwt.js';
import User from '../models/User.js';
import { isBlacklisted } from '../services/tokenBlacklist.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Extract token from request (for use in logout, etc.)
 */
export const extractTokenFromRequest = (req) => {
  if (req.headers.authorization?.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.headers.authorization) return req.headers.authorization;
  if (req.headers['x-auth-token']) return req.headers['x-auth-token'];
  return null;
};

async function loadActiveUserFromDecoded(decoded) {
  const user = await User.findById(decoded.id).select('-password');

  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated. Please contact support.');
  }

  return user;
}

/**
 * Protect routes - require authentication (strict access-token TTL, no grace).
 */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractTokenFromRequest(req);

  if (!token) {
    throw new AuthenticationError('Not authenticated. Please provide a valid token.');
  }

  try {
    if (await isBlacklisted(token)) {
      throw new AuthenticationError('Token has been revoked. Please login again.');
    }

    const decoded = verifyAccessToken(token);
    const user = await loadActiveUserFromDecoded(decoded);

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    throw new AuthenticationError('Invalid or expired token. Please login again.');
  }
});

/**
 * POST /api/driver/create ONLY.
 *
 * Same blacklist + signature + active-user checks as `protect`, but if the
 * access token is expired, allow it when `exp` is within the last 2 hours.
 * Every other route keeps the standard 15-minute TTL via `protect`.
 *
 * Other multipart upload routes (profile image, vehicle images, documents)
 * use single-file uploads that finish well within 15m, so they stay on
 * strict `protect` and do not get this grace.
 */
export const protectDriverRegistration = asyncHandler(async (req, res, next) => {
  const token = extractTokenFromRequest(req);

  if (!token) {
    throw new AuthenticationError('Not authenticated. Please provide a valid token.');
  }

  try {
    if (await isBlacklisted(token)) {
      throw new AuthenticationError('Token has been revoked. Please login again.');
    }

    const { decoded, tokenAgeMs, usedGrace } = verifyAccessTokenForDriverCreate(token);

    // Date.now() - exp*1000: negative while still valid, positive after expiry.
    logger.info('driver/create auth token age', {
      userId: decoded?.id,
      tokenAgeMs,
      usedGrace,
      graceMs: DRIVER_CREATE_TOKEN_GRACE_MS,
      path: req.originalUrl || req.url,
    });

    const user = await loadActiveUserFromDecoded(decoded);
    req.user = user;
    req.userId = user._id;
    req.driverCreateAuth = { tokenAgeMs, usedGrace };
    next();
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    throw new AuthenticationError('Invalid or expired token. Please login again.');
  }
});

/**
 * Restrict routes to specific roles
 */
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Please authenticate first');
    }

    if (!roles.includes(req.user.role)) {
      throw new AuthorizationError('You do not have permission to perform this action');
    }

    next();
  };
};

/**
 * Optional authentication - doesn't throw error if no token
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.headers.authorization) {
    token = req.headers.authorization;
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }

  if (token) {
    try {
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id).select('-password');

      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
      }
    } catch (error) {
      // Silently fail for optional auth
    }
  }

  next();
});

/**
 * Require admin role
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user) {
    throw new AuthenticationError('Please authenticate first');
  }

  if (req.user.role !== 'admin') {
    throw new AuthorizationError('Admin access required');
  }

  next();
};

/**
 * Check if user owns resource or is admin
 */
export const checkOwnership = (resourceUserId) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new AuthenticationError('Please authenticate first');
    }

    // Admin can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user owns the resource
    const resourceId = typeof resourceUserId === 'function' 
      ? resourceUserId(req) 
      : req.params.id || req.params.userId;

    if (req.userId.toString() !== resourceId.toString()) {
      throw new AuthorizationError('You do not have permission to access this resource');
    }

    next();
  };
};
