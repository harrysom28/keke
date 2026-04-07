import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import logger from './logger.js';
import { ValidationError } from './errors.js';

const OTP_SECRET = process.env.OTP_SECRET || 'default-otp-secret';
const OTP_EXPIRE_MINUTES = parseInt(process.env.OTP_EXPIRE_MINUTES || '10', 10);
const OTP_REDIS_RL_MAX = parseInt(process.env.OTP_REDIS_RL_MAX || '5', 10);
const OTP_REDIS_RL_WINDOW_SEC = parseInt(process.env.OTP_REDIS_RL_WINDOW_SEC || '600', 10);
const MAX_VERIFY_ATTEMPTS = 5;

function otpDataKey(identifier, purpose) {
  return `otp:data:${purpose}:${identifier}`;
}

function otpRlKey(identifier, purpose) {
  return `otp:reqrl:${purpose}:${identifier}`;
}

function hashStoredOtp(identifier, purpose, otp) {
  return crypto.createHmac('sha256', OTP_SECRET).update(`${purpose}:${identifier}:${otp}`).digest('hex');
}

async function ensureRedisForOtp() {
  const client = getRedisClient();
  if (!client) {
    throw new ValidationError(
      'Verification service is temporarily unavailable. Set REDIS_URL (recommended) or REDIS_HOST to a reachable Redis instance.'
    );
  }
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (err) {
      logger.error(`Redis connect failed for OTP: ${err.message}`);
      throw new ValidationError(
        'Verification service is temporarily unavailable. Please try again in a few minutes.'
      );
    }
  }
  return client;
}

/**
 * Generate OTP code
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
 * Store OTP in Redis (HMAC hash only + attempt counter). Belt-and-suspenders rate limit per identifier.
 */
export const storeOTP = async (identifier, otp, purpose = 'verification') => {
  const client = await ensureRedisForOtp();
  const id = typeof identifier === 'string' ? identifier.trim().toLowerCase() : String(identifier);
  const rlKey = otpRlKey(id, purpose);
  const attempts = await client.incr(rlKey);
  if (attempts === 1) {
    await client.expire(rlKey, OTP_REDIS_RL_WINDOW_SEC);
  }
  if (attempts > OTP_REDIS_RL_MAX) {
    throw new ValidationError('Too many OTP requests for this number or email. Please try again later.');
  }

  const key = otpDataKey(id, purpose);
  const ttlSec = OTP_EXPIRE_MINUTES * 60;
  const hash = hashStoredOtp(id, purpose, otp);
  const payload = JSON.stringify({ h: hash, a: 0 });

  await client.setEx(key, ttlSec, payload);
  logger.info(`OTP stored (hashed) for ${id}, purpose: ${purpose}`);
  return true;
};

/**
 * Verify OTP (timing-safe compare). Deletes code on success.
 */
export const verifyOTP = async (identifier, otp, purpose = 'verification') => {
  const id = typeof identifier === 'string' ? identifier.trim().toLowerCase() : String(identifier);
  const key = otpDataKey(id, purpose);

  try {
    const client = await ensureRedisForOtp();
    const raw = await client.get(key);

    if (!raw) {
      return { valid: false, message: 'OTP not found or expired' };
    }

    let stored;
    try {
      stored = JSON.parse(raw);
    } catch {
      return { valid: false, message: 'OTP not found or expired' };
    }

    if (stored.a >= MAX_VERIFY_ATTEMPTS) {
      await client.del(key);
      return { valid: false, message: 'Too many failed attempts. Request a new OTP' };
    }

    const expectedHex = stored.h;
    if (typeof expectedHex !== 'string' || expectedHex.length < 32) {
      await client.del(key);
      return { valid: false, message: 'OTP not found or expired' };
    }
    const actualHex = hashStoredOtp(id, purpose, otp);
    const a = Buffer.from(actualHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    let match = false;
    if (a.length === b.length && a.length > 0) {
      try {
        match = crypto.timingSafeEqual(a, b);
      } catch {
        match = false;
      }
    }

    if (!match) {
      stored.a = (stored.a || 0) + 1;
      const ttl = await client.ttl(key);
      const keepTtl = ttl > 0 ? ttl : OTP_EXPIRE_MINUTES * 60;
      await client.setEx(key, keepTtl, JSON.stringify(stored));
      return {
        valid: false,
        message: 'Invalid OTP',
        attemptsRemaining: MAX_VERIFY_ATTEMPTS - stored.a,
      };
    }

    await client.del(key);
    return { valid: true, message: 'OTP verified successfully' };
  } catch (err) {
    if (err instanceof ValidationError) {
      return { valid: false, message: err.message };
    }
    logger.error(`Failed to verify OTP: ${err.message}`);
    return { valid: false, message: 'Error verifying OTP' };
  }
};

/**
 * Check if OTP exists (for resend logic)
 */
export const checkOTPExists = async (identifier, purpose = 'verification') => {
  const id = typeof identifier === 'string' ? identifier.trim().toLowerCase() : String(identifier);
  const key = otpDataKey(id, purpose);
  try {
    const client = getRedisClient();
    if (!client?.isOpen) {
      return false;
    }
    const v = await client.get(key);
    return !!v;
  } catch {
    return false;
  }
};

/**
 * Delete OTP
 */
export const deleteOTP = async (identifier, purpose = 'verification') => {
  const id = typeof identifier === 'string' ? identifier.trim().toLowerCase() : String(identifier);
  const key = otpDataKey(id, purpose);
  try {
    const client = getRedisClient();
    if (client?.isOpen) {
      await client.del(key);
    }
  } catch (err) {
    logger.warn(`deleteOTP: ${err.message}`);
  }
};

export const generateOTPHash = (otp) => {
  const hash = crypto.createHmac('sha256', OTP_SECRET).update(otp).digest('hex');
  return hash;
};

export const verifyOTPHash = (otp, hash) => {
  const computedHash = generateOTPHash(otp);
  const a = Buffer.from(computedHash, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
