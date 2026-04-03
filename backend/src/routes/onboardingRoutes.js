import express from 'express';
import * as onboardingController from '../controllers/onboardingController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

router.use(protect);

router.get('/status', onboardingController.getOnboardingStatus);

router.post(
  '/rider/complete',
  validationRules.riderOnboardingComplete,
  validate,
  onboardingController.completeRiderOnboarding
);

router.post(
  '/driver/stage1',
  validationRules.driverStage1,
  validate,
  onboardingController.driverStage1
);
router.post(
  '/driver/stage2',
  validationRules.driverStage2,
  validate,
  onboardingController.driverStage2
);
router.post(
  '/driver/stage3',
  validationRules.driverStage3,
  validate,
  onboardingController.driverStage3
);
router.post('/driver/stage4', onboardingController.driverStage4);

export default router;
