import express from 'express';
import * as profileController from '../controllers/profileController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Profile management
router.patch('/user/profile/update-details', validationRules.updateProfile, validate, profileController.updateProfile);
router.patch('/user/profile/password-change', validationRules.changePassword, validate, profileController.changePassword);
router.get('/user/profile/details', profileController.getProfileDetails);
router.get('/user/profile/passenger', profileController.getPassengerProfile);
router.get('/user/profile/driver', profileController.getDriverProfileDetails);

// Referral management
router.get('/user/profile/referral-code', profileController.getReferralCode);
router.get('/user/profile/referral-list', profileController.getReferralList);

// Role management
router.post('/auth/user/switch-role', validationRules.switchRole, validate, profileController.switchRole);
router.delete('/auth/user/delete/account', validationRules.deleteAccount, validate, profileController.deleteAccount);

export default router;
