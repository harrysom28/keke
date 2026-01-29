import express from 'express';
import * as messageController from '../controllers/messageController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Chat/Messaging routes
router.get('/message/passenger/driver/:rideId', validationRules.rideIdParam, validate, messageController.getChatMessages);
router.post('/message/passenger/driver/create', validationRules.sendMessage, validate, messageController.sendMessage);

export default router;
