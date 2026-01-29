import express from 'express';
import * as mapsController from '../controllers/mapsController.js';
import { protect } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limit Maps proxy endpoints to reduce abuse/cost.
// Fine-tune via env if needed.
const mapsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.MAPS_RATE_LIMIT_MAX || '120', 10), // 120 req / 15 min by default
  message: {
    status: 'error',
    message: 'Too many maps requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Maps routes - can be public or protected based on requirements
// For now, we'll make them protected to track usage
router.use(protect);
router.use(mapsRateLimiter);

// Google Maps proxy endpoints
router.get('/places/autocomplete', mapsController.placesAutocomplete);
router.get('/places/details', mapsController.placeDetails);
router.get('/directions', mapsController.getDirections);
router.get('/geocode', mapsController.geocodeAddress);
router.get('/distance-matrix', mapsController.distanceMatrix);

export default router;
