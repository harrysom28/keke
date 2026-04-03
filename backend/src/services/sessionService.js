/**
 * Session service - device-bound refresh token storage and rotation
 * Implements refresh token rotation: invalidate old token on use, issue new pair
 */
import crypto from 'crypto';
import UserSession from '../models/UserSession.js';
import UserDevice from '../models/UserDevice.js';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  decodeToken,
} from '../utils/jwt.js';
import { AuthenticationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get expiresAt from refresh token JWT payload
 */
function getExpiresAt(refreshToken) {
  const decoded = decodeToken(refreshToken);
  if (!decoded?.exp) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default
  return new Date(decoded.exp * 1000);
}

/**
 * Create or update user device record
 */
export async function upsertUserDevice(userId, deviceId, ipAddress = null) {
  const now = new Date();
  const device = await UserDevice.findOneAndUpdate(
    { userId, deviceId },
    {
      $set: { lastLoginAt: now, ipAddress: ipAddress || undefined },
      $setOnInsert: { firstLoginAt: now, isTrusted: false },
    },
    { upsert: true, new: true }
  );
  return device;
}

/**
 * Create session with hashed refresh token
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.deviceId - Device ID (required)
 * @param {string} params.refreshToken - Raw refresh token (will be hashed)
 * @param {string} [params.ipAddress] - Client IP
 */
export async function createSession({ userId, deviceId, refreshToken, ipAddress }) {
  if (!deviceId || !refreshToken) {
    throw new Error('deviceId and refreshToken are required for session creation');
  }

  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = getExpiresAt(refreshToken);

  await upsertUserDevice(userId, deviceId, ipAddress);

  const session = await UserSession.create({
    userId,
    deviceId,
    refreshTokenHash,
    expiresAt,
  });

  logger.debug(`Session created for user ${userId} device ${deviceId}`);
  return session;
}

/**
 * Validate refresh token, rotate it, return new token pair
 * - Verifies JWT
 * - Looks up session by hash + userId
 * - Checks device_id match, not revoked, not expired
 * - Revokes old session, creates new session with new tokens
 *
 * @param {string} refreshToken - Raw refresh token from client
 * @param {string} deviceId - Device ID (required)
 * @param {string} [ipAddress] - Client IP
 * @returns {{ user, accessToken, refreshToken }}
 */
export async function validateAndRotateSession(refreshToken, deviceId, ipAddress = null) {
  if (!refreshToken || !deviceId) {
    throw new AuthenticationError('Refresh token and device_id are required');
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  const userId = decoded.id;
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const sessionFilter = {
    userId,
    refreshTokenHash,
    revoked: false,
    expiresAt: { $gt: new Date() },
  };
  if (deviceId && deviceId !== 'legacy') {
    sessionFilter.deviceId = deviceId;
  }
  const session = await UserSession.findOne(sessionFilter);

  if (!session) {
    throw new AuthenticationError('Invalid or expired refresh token. Please login again.');
  }

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    await UserSession.updateOne({ _id: session._id }, { revoked: true });
    throw new AuthenticationError('User not found or inactive');
  }

  // Rotate: revoke old session
  await UserSession.updateOne({ _id: session._id }, { revoked: true });

  const effectiveDeviceId = deviceId && deviceId !== 'legacy' ? deviceId : session.deviceId;

  const newAccessToken = generateAccessToken({ id: user._id, role: user.role });
  const newRefreshToken = generateRefreshToken({ id: user._id, role: user.role });

  await createSession({
    userId: user._id,
    deviceId: effectiveDeviceId,
    refreshToken: newRefreshToken,
    ipAddress,
  });

  logger.debug(`Session rotated for user ${userId}`);

  return {
    user,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

/**
 * Revoke session(s) for user
 * @param {string} userId
 * @param {string} [deviceId] - If provided, revoke only this device; else revoke all
 */
export async function revokeSessions(userId, deviceId = null) {
  const filter = { userId };
  if (deviceId) filter.deviceId = deviceId;
  const result = await UserSession.updateMany(filter, { revoked: true });
  logger.debug(`Revoked sessions for user ${userId}${deviceId ? ` device ${deviceId}` : ''}`);
  return result;
}
