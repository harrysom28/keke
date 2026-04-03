/**
 * Onboarding enforcement middleware
 * - requireRiderComplete: rider must have onboarding_stage = rider_complete
 * - requireDriverKycVerified: driver must have kyc_status = verified (blocks ride acceptance)
 */
import User from '../models/User.js';
import { AuthorizationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';

/**
 * Require rider to have completed onboarding
 * Use on: book ride, request ride
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
 * Require driver to have KYC verified before accepting rides
 * Use on: accept ride, go online (if we gate that)
 */
export const requireDriverKycVerified = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select('role kycStatus onboardingStage');
  if (!user) return next(new AuthorizationError('User not found'));

  if (user.role !== 'driver') {
    return next(new AuthorizationError('Not a driver'));
  }

  if (user.onboardingStage !== 'driver_complete') {
    return next(new AuthorizationError('Please complete driver onboarding'));
  }

  if (user.kycStatus !== 'verified') {
    return next(new AuthorizationError('KYC verification pending. You cannot accept rides until approved.'));
  }

  next();
});
