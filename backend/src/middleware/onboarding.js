/**
 * Authorization middleware.
 *
 * Driver approval source of truth: Driver.verificationStatus === 'approved'
 * No dependency on User.onboardingStage or User.kycStatus for authorization.
 */
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { AuthorizationError, asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Require rider to have completed onboarding.
 * Use on: book ride, request ride.
 */
export const requireRiderComplete = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('role onboardingStage');
  if (!user) return next(new AuthorizationError('User not found'));

  if (user.role !== 'passenger') {
    return next(new AuthorizationError('Not a rider'));
  }

  if (user.onboardingStage !== 'rider_complete') {
    return next(new AuthorizationError('Please complete onboarding to book rides'));
  }

  next();
});

/**
 * Require driver to be admin-approved before accepting rides.
 * Single source of truth: Driver.verificationStatus === 'approved'.
 * No dependency on User.onboardingStage or User.kycStatus.
 */
export const requireDriverApproved = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id })
      .select('verificationStatus')
      .lean();

    if (!driver || driver.verificationStatus !== 'approved') {
      logger.warn('requireDriverApproved: blocked', {
        userId: req.user._id,
        verificationStatus: driver?.verificationStatus ?? 'no_profile',
      });
      return res.status(403).json({
        status: 'fail',
        message: 'Your account is pending admin approval. You will be notified once approved.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require driver to have bank account details on file before withdrawing.
 * Use on: withdrawal routes only — does not block ride acceptance.
 */
export const requireBankDetails = async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id })
      .select('bankAccount')
      .lean();

    const bank = driver?.bankAccount;
    if (!bank?.accountNumber || !bank?.bankName || !bank?.accountName) {
      return res.status(403).json({
        status: 'fail',
        message: 'Please add your bank account details before withdrawing.',
        code: 'BANK_DETAILS_REQUIRED',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
