import jwt from 'jsonwebtoken';
import { AuthenticationError } from './errors.js';

const JWT_SECRET = process.env.JWT_SECRET;
// Prefer JWT_EXPIRE=2h in Dokploy. Default was 15m; the shipped driver
// registration form routinely exceeds that before the final multipart POST.
const JWT_EXPIRE = process.env.JWT_EXPIRE || '2h';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';

/** Extra grace on POST /driver/create only if access TTL still elapses mid-form. */
export const DRIVER_CREATE_TOKEN_GRACE_MS = 2 * 60 * 60 * 1000;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be defined in environment variables');
}

/**
 * Generate JWT access token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRE,
  });
};

/**
 * Generate JWT refresh token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRE,
  });
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokenPair = (payload) => {
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return {
    accessToken,
    refreshToken,
    token: accessToken, // For compatibility with mobile app
    expiresIn: JWT_EXPIRE,
  };
};

/**
 * Verify JWT access token (strict 15m TTL — no grace).
 * Preserves TokenExpiredError.name so route-scoped grace handlers can catch it.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      const err = new AuthenticationError('Access token has expired');
      err.name = 'TokenExpiredError';
      err.expiredAt = error.expiredAt;
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid access token');
    }
    throw new AuthenticationError('Token verification failed');
  }
};

/**
 * Verify access token for POST /api/driver/create only.
 *
 * 1. Normal verify (same as every other route).
 * 2. On TokenExpiredError: re-verify with ignoreExpiration (signature still
 *    checked), then allow only if `exp` is within the last 2 hours.
 * 3. Returns { decoded, tokenAgeMs, usedGrace }.
 */
export const verifyAccessTokenForDriverCreate = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const tokenAgeMs =
      typeof decoded.exp === 'number' ? Date.now() - decoded.exp * 1000 : 0;
    return { decoded, tokenAgeMs, usedGrace: false };
  } catch (error) {
    if (error.name !== 'TokenExpiredError') {
      if (error.name === 'JsonWebTokenError') {
        throw new AuthenticationError('Invalid access token');
      }
      throw new AuthenticationError('Token verification failed');
    }

    // Signature must still be valid; only expiry is waived within the window.
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (verifyErr) {
      throw new AuthenticationError('Invalid access token');
    }

    if (typeof decoded.exp !== 'number') {
      throw new AuthenticationError('Access token has expired');
    }

    const tokenAgeMs = Date.now() - decoded.exp * 1000;
    // Unverified decode cross-check (exp must match verified payload).
    const peek = jwt.decode(token);
    if (peek && typeof peek.exp === 'number' && peek.exp !== decoded.exp) {
      throw new AuthenticationError('Invalid access token');
    }

    if (tokenAgeMs > DRIVER_CREATE_TOKEN_GRACE_MS) {
      throw new AuthenticationError('Access token has expired');
    }

    return { decoded, tokenAgeMs, usedGrace: true };
  }
};

/**
 * Verify JWT refresh token
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AuthenticationError('Refresh token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AuthenticationError('Invalid refresh token');
    }
    throw new AuthenticationError('Refresh token verification failed');
  }
};

/**
 * Decode token without verification (for inspection)
 */
export const decodeToken = (token) => {
  return jwt.decode(token);
};
