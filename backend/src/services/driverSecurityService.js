/**
 * Driver security - transaction PIN, lock, withdrawal freeze
 */
import crypto from 'crypto';
import DriverSecurity from '../models/DriverSecurity.js';
import UserDevice from '../models/UserDevice.js';
import Driver from '../models/Driver.js';
import { ValidationError } from '../utils/errors.js';

const PIN_LOCK_MINUTES = 30;
const MAX_FAILED_ATTEMPTS = 3;
const NEW_DEVICE_FREEZE_HOURS = 12;

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

export async function getOrCreateDriverSecurity(userId) {
  let sec = await DriverSecurity.findOne({ userId });
  if (!sec) {
    sec = await DriverSecurity.create({ userId });
  }
  return sec;
}

export async function setupTransactionPin(userId, pin) {
  const pinStr = String(pin).trim();
  if (pinStr.length !== 4 || !/^\d{4}$/.test(pinStr)) {
    throw new ValidationError('PIN must be 4 digits');
  }

  const sec = await getOrCreateDriverSecurity(userId);
  if (sec.transactionPinHash) {
    throw new ValidationError('Transaction PIN already set');
  }

  sec.transactionPinHash = hashPin(pinStr);
  sec.failedAttempts = 0;
  sec.lockUntil = null;
  sec.lastPinChangeAt = new Date();
  await sec.save();
  return sec;
}

export async function verifyTransactionPin(userId, pin) {
  const sec = await DriverSecurity.findOne({ userId });
  if (!sec || !sec.transactionPinHash) {
    throw new ValidationError('Transaction PIN not set. Please set it up first.');
  }

  if (sec.lockUntil && sec.lockUntil > new Date()) {
    const mins = Math.ceil((sec.lockUntil - Date.now()) / 60000);
    throw new ValidationError(`PIN locked. Try again in ${mins} minutes.`);
  }

  const hashed = hashPin(String(pin).trim());
  if (hashed !== sec.transactionPinHash) {
    sec.failedAttempts += 1;
    if (sec.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      sec.lockUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000);
    }
    await sec.save();
    throw new ValidationError(
      sec.failedAttempts >= MAX_FAILED_ATTEMPTS
        ? `Too many failed attempts. Locked for ${PIN_LOCK_MINUTES} minutes.`
        : 'Invalid PIN'
    );
  }

  sec.failedAttempts = 0;
  sec.lockUntil = null;
  await sec.save();
  return true;
}

export async function isDeviceTrusted(userId, deviceId) {
  const device = await UserDevice.findOne({ userId, deviceId });
  if (!device) return false;
  return device.isTrusted === true;
}

export async function markDeviceTrusted(userId, deviceId) {
  await UserDevice.updateOne({ userId, deviceId }, { isTrusted: true });
}

export async function setWithdrawalFreeze(userId, hours = NEW_DEVICE_FREEZE_HOURS) {
  const sec = await getOrCreateDriverSecurity(userId);
  sec.withdrawalFreezeUntil = new Date(Date.now() + hours * 60 * 60 * 1000);
  await sec.save();
  return sec.withdrawalFreezeUntil;
}

export async function checkWithdrawalFreeze(userId) {
  const sec = await DriverSecurity.findOne({ userId });
  if (!sec?.withdrawalFreezeUntil) return null;
  if (sec.withdrawalFreezeUntil <= new Date()) return null;
  return sec.withdrawalFreezeUntil;
}

export async function getPinStatus(userId) {
  const sec = await DriverSecurity.findOne({ userId });
  return {
    hasPin: !!sec?.transactionPinHash,
    lockedUntil: sec?.lockUntil || null,
    withdrawalFreezeUntil: sec?.withdrawalFreezeUntil || null,
  };
}
