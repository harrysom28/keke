import { verifyAccessToken } from '../utils/jwt.js';
import User from '../models/User.js';
import { isBlacklisted } from '../services/tokenBlacklist.js';
import { AuthenticationError, AuthorizationError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';

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

/**
 * Protect routes - require authentication
 * @param {{ clockToleranceSec?: number }} [opts]
 *   Optional JWT clockTolerance (seconds). Used by driver registration so a
 *   multi-step photo form that outlives the 15m access token still succeeds
 *   without forcing the mobile client to retry a consumed multipart body
 *   (RN FormData retries surface as a raw "Network Error").
 */
export const protect = asyncHandler(async (req, res, next) => {
  const token = extractTokenFromRequest(req);

  if (!token) {
    throw new AuthenticationError('Not authenticated. Please provide a valid token.');
  }

  try {
    // Check if token was revoked (logout)
    if (await isBlacklisted(token)) {
      throw new AuthenticationError('Token has been revoked. Please login again.');
    }

    const clockToleranceSec = Number(req?.protectClockToleranceSec);
    const decoded =
      Number.isFinite(clockToleranceSec) && clockToleranceSec > 0
        ? verifyAccessToken(token, { clockTolerance: clockToleranceSec })
        : verifyAccessToken(token);

    // Get user from database
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      throw new NotFoundError('User');
    }

    if (!user.isActive) {
      throw new AuthenticationError('Your account has been deactivated. Please contact support.');
    }

    // Attach user to request
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
 * Driver registration only: accept access tokens expired by up to 2 hours.
 * Signature + blacklist + active-user checks are unchanged.
 */
export const protectDriverRegistration = (req, res, next) => {
  req.protectClockToleranceSec = 2 * 60 * 60;
  return protect(req, res, next);
};

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
