import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public routes
router.post('/user/signup', authLimiter, validationRules.register, validate, authController.register);
router.post('/user/signin', authLimiter, validationRules.login, validate, authController.login);
router.post('/user/confirm-otp', otpLimiter, validationRules.verifyOTP, validate, authController.verifyOTPCode);
router.post('/user/resend-otp', otpLimiter, validationRules.resendOTP, validate, authController.resendOTP);
router.post('/user/complete-signup', validationRules.completeSignup, validate, authController.completeSignup);
router.post('/google/callbacks', authLimiter, validationRules.googleAuth, validate, authController.googleAuthCallback);
router.post('/user/refresh', authController.refreshToken);

// Protected routes
router.post('/user/signout', protect, authController.logout);
router.get('/user/me', protect, authController.getCurrentUser);

export default router;
