import { setupTransactionPin, getPinStatus } from '../services/driverSecurityService.js';
import { NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import Driver from '../models/Driver.js';

/**
 * Setup transaction PIN - POST /driver/security/setup-pin
 */
export const setupPin = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) throw new NotFoundError('Driver profile');

  const { transaction_pin } = req.body;
  await setupTransactionPin(userId, transaction_pin);

  res.json({
    status: 'success',
    message: 'Transaction PIN set successfully',
  });
});

/**
 * Get PIN status - GET /driver/security/pin-status
 */
export const getPinStatusRoute = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const status = await getPinStatus(userId);

  res.json({
    status: 'success',
    data: status,
  });
});
