/**
 * Wallet security middleware - PIN, device trust, risk
 * Chain: protect → requireTransactionPin → checkDeviceTrust → riskEngine → execute
 */
import Driver from '../models/Driver.js';
import UserDevice from '../models/UserDevice.js';
import {
  verifyTransactionPin,
  checkWithdrawalFreeze,
} from '../services/driverSecurityService.js';
import { AuthorizationError, ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';

const RECENT_LOGIN_MINUTES = 10;
const LARGE_WITHDRAWAL_NGN = 100000;

/**
 * Require transaction PIN in body, verify it
 */
export const requireTransactionPin = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new AuthorizationError('Driver profile required');

  const pin = req.body.transaction_pin ?? req.body.transactionPin;
  if (!pin) {
    throw new ValidationError('Transaction PIN is required');
  }

  await verifyTransactionPin(userId, pin);
  next();
});

/**
 * Check device trust - new device → 12h withdrawal freeze
 * Device is "new" if first login was < 12h ago
 */
export const checkDeviceTrust = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'legacy';

  const freezeUntil = await checkWithdrawalFreeze(userId);
  if (freezeUntil) {
    const mins = Math.ceil((freezeUntil - Date.now()) / 60000);
    throw new AuthorizationError(
      `Withdrawal frozen on this device. Try again in ${mins} minutes.`
    );
  }

  if (deviceId !== 'legacy') {
    const device = await UserDevice.findOne({ userId, deviceId });
    const hoursSinceFirstLogin = device?.firstLoginAt
      ? (Date.now() - new Date(device.firstLoginAt)) / (60 * 60 * 1000)
      : 999;
    if (hoursSinceFirstLogin < 12) {
      const { setWithdrawalFreeze } = await import('../services/driverSecurityService.js');
      await setWithdrawalFreeze(userId, 12);
      throw new AuthorizationError(
        'New device detected. Withdrawals frozen for 12 hours for security.'
      );
    }
  }

  next();
});

/**
 * Risk engine - large withdrawal or recent login → require OTP step-up (flag for client)
 */
export function riskEngine(req, res, next) {
  const amount = Number(req.body.amount) || 0;
  const loginAt = req.user.loginAt || req.user.createdAt;

  if (amount >= LARGE_WITHDRAWAL_NGN) {
    req.riskStepUp = 'otp';
    req.riskReason = 'large_withdrawal';
  }

  if (loginAt) {
    const loginAge = (Date.now() - new Date(loginAt)) / 60000;
    if (loginAge < RECENT_LOGIN_MINUTES) {
      req.riskStepUp = req.riskStepUp || 'otp';
      req.riskReason = req.riskReason || 'recent_login';
    }
  }

  next();
}
