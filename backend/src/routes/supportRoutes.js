import express from 'express';
import * as supportController from '../controllers/supportController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

router.use(protect);
router.use(limiters.supportTicketsLimiter);

router.post('/tickets', validationRules.createSupportTicket, validate, supportController.createTicket);

export default router;
