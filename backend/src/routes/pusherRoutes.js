import express from 'express';
import * as pusherController from '../controllers/pusherController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Pusher authentication route
router.post('/broadcasting/pusher/user-auth', validationRules.pusherAuth, validate, pusherController.pusherUserAuth);

export default router;
