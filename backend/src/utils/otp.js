import crypto from 'crypto';
import { cache } from '../config/redis.js';
import logger from './logger.js';

const OTP_SECRET = process.env.OTP_SECRET || 'default-otp-secret';
const OTP_EXPIRE_MINUTES = parseInt(process.env.OTP_EXPIRE_MINUTES || '10', 10);

/**
 * Generate OTP code
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} OTP code
 */
export const generateOTP = (length = 6) => {
  const digits = '0123456789';
  let otp = '';

  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }

  return otp;
};

/**
 * Store OTP in cache/Redis
 */
export const storeOTP = async (identifier, otp, purpose = 'verification') => {
  const key = `otp:${purpose}:${identifier}`;
  const expiration = OTP_EXPIRE_MINUTES * 60; // Convert to seconds

  try {
    await cache.set(key, { otp, attempts: 0, createdAt: new Date() }, expiration);
    logger.info(`OTP stored for ${identifier}, purpose: ${purpose}`);
    return true;
  } catch (error) {
    logger.error(`Failed to store OTP: ${error.message}`);
    return false;
  }
};

/**
 * Verify OTP
 */
export const verifyOTP = async (identifier, otp, purpose = 'verification') => {
  const key = `otp:${purpose}:${identifier}`;

  try {
    const stored = await cache.get(key);

    if (!stored) {
      return { valid: false, message: 'OTP not found or expired' };
    }

    if (stored.attempts >= 5) {
      await cache.del(key);
      return { valid: false, message: 'Too many failed attempts. OTP expired' };
    }

    if (stored.otp !== otp) {
      stored.attempts += 1;
      await cache.set(key, stored, OTP_EXPIRE_MINUTES * 60);
      return { valid: false, message: 'Invalid OTP', attemptsRemaining: 5 - stored.attempts };
    }

    // OTP is valid, delete it
    await cache.del(key);
    return { valid: true, message: 'OTP verified successfully' };
  } catch (error) {
    logger.error(`Failed to verify OTP: ${error.message}`);
    return { valid: false, message: 'Error verifying OTP' };
  }
};

/**
 * Check if OTP exists (for resend logic)
 */
export const checkOTPExists = async (identifier, purpose = 'verification') => {
  const key = `otp:${purpose}:${identifier}`;
  const stored = await cache.get(key);
  return !!stored;
};

/**
 * Delete OTP
 */
export const deleteOTP = async (identifier, purpose = 'verification') => {
  const key = `otp:${purpose}:${identifier}`;
  await cache.del(key);
};

/**
 * Generate secure hash for OTP verification (alternative method)
 */
export const generateOTPHash = (otp) => {
  const hash = crypto.createHmac('sha256', OTP_SECRET).update(otp).digest('hex');
  return hash;
};

/**
 * Verify OTP hash
 */
export const verifyOTPHash = (otp, hash) => {
  const computedHash = generateOTPHash(otp);
  return computedHash === hash;
};
