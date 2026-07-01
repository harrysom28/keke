import express from 'express';
import * as osrmMapsController from '../controllers/osrmMapsController.js';
import * as placeController from '../controllers/placeController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import rateLimit from 'express-rate-limit';
import { userOrIpKey } from '../middleware/rateLimiter.js';

const router = express.Router();

const mapsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.MAPS_RATE_LIMIT_MAX || '200', 10),
  keyGenerator: userOrIpKey,
  message: {
    status: 'error',
    message: 'Too many maps requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

router.use(protect);
router.use(mapsRateLimiter);

// OSRM + Nominatim (OpenStreetMap) - replaces Google Maps
router.get('/places/search', validationRules.placeSearchQuery, validate, placeController.placeSearch);
router.get('/places/autocomplete', validationRules.placesAutocompleteQuery, validate, osrmMapsController.placeSearch);
router.get('/places/details', validationRules.placeDetailsQuery, validate, osrmMapsController.placeDetails);
router.get('/places/nearby', validationRules.placesNearbyQuery, validate, osrmMapsController.placesNearby);
router.get('/pickup-label', validationRules.pickupLabelQuery, validate, osrmMapsController.resolvePickupLabel);
router.get('/directions', osrmMapsController.getDirections);
router.get('/geocode', osrmMapsController.geocodeAddress);
router.get('/distance-matrix', osrmMapsController.distanceMatrix);

export default router;
