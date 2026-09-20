import express from 'express';
import multer from 'multer';
import * as agentController from '../controllers/agentController.js';
import { protect } from '../middleware/auth.js';
import { requireAgent } from '../middleware/agent.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 6,
    fields: 30,
    fieldSize: 1024 * 1024,
  },
}).any();

router.post(
  '/auth/request-otp',
  limiters.authLimiter,
  validationRules.requestLoginOtp,
  validate,
  agentController.requestAgentOtp
);
router.post(
  '/auth/verify',
  limiters.otpVerifyLimiter,
  validationRules.loginWithOtp,
  validate,
  agentController.verifyAgentOtp
);
router.post(
  '/apply',
  limiters.authLimiter,
  validationRules.applyAgent,
  validate,
  agentController.applyAsAgent
);

router.use(protect);
router.use(requireAgent);

router.get('/me', agentController.getAgentMe);
router.patch('/me', agentController.updateAgentMe);
router.get('/me/drivers', agentController.listMyDrivers);
router.get('/overview', agentController.getAgentOverview);
router.get('/drivers', agentController.listAgentDrivers);
router.get('/drivers/:id', validationRules.mongoId, validate, agentController.getAgentDriver);
router.patch(
  '/drivers/:id/documents',
  upload,
  validationRules.mongoId,
  validate,
  agentController.updateAgentDriverDocuments
);
router.post('/drivers', upload, agentController.registerAgentDriver);

export default router;
