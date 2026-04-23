import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.get('/referral-code/validate', limiters.authLimiter, validationRules.validateReferralCode, validate, authController.validateReferralCode);
router.post('/user/signup', limiters.authLimiter, validationRules.register, validate, authController.register);
router.post('/user/signin', limiters.authLimiter, validationRules.login, validate, authController.login);
router.post('/user/confirm-otp', limiters.otpVerifyLimiter, validationRules.verifyOTP, validate, authController.verifyOTPCode);
router.post('/user/request-login-otp', limiters.authLimiter, validationRules.requestLoginOtp, validate, authController.requestLoginOtp);
router.post('/user/login-with-otp', limiters.otpVerifyLimiter, validationRules.loginWithOtp, validate, authController.loginWithOtp);
router.post('/user/resend-otp', limiters.otpLimiter, validationRules.resendOTP, validate, authController.resendOTP);
router.post(
  '/user/complete-signup',
  limiters.authLimiter,
  validationRules.completeSignup,
  validate,
  authController.completeSignup
);
router.post('/google/callbacks', limiters.authLimiter, validationRules.googleAuth, validate, authController.googleAuthCallback);
router.post('/user/refresh', limiters.refreshTokenLimiter, authController.refreshToken);

// Protected routes
router.post('/user/signout', protect, authController.logout);
router.get('/user/me', protect, authController.getCurrentUser);
router.post('/push-token', protect, authController.savePushToken);

export default router;
