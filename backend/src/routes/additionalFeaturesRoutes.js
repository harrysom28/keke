import express from 'express';
import * as additionalFeaturesController from '../controllers/additionalFeaturesController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Emergency contacts
router.post('/emergency/contact/create', validationRules.createEmergencyContact, validate, additionalFeaturesController.createEmergencyContact);
router.get('/emergency/contact', additionalFeaturesController.getEmergencyContact);
router.patch('/emergency/contact/update/:id', validationRules.updateEmergencyContact, validate, additionalFeaturesController.updateEmergencyContact);
router.delete('/emergency/contact/delete/:id', validationRules.mongoId, validate, additionalFeaturesController.deleteEmergencyContact);
router.post('/emergency/contact/send-message', validationRules.sendEmergencyMessage, validate, additionalFeaturesController.sendEmergencyMessage);

// Recent places
router.get('/recent-places', additionalFeaturesController.getRecentPlaces);
router.post('/recent-places', validationRules.saveRecentPlace, validate, additionalFeaturesController.saveRecentPlace);
router.delete('/recent-places', additionalFeaturesController.clearRecentPlaces);

// Promocodes and offers
router.get('/special/offers', additionalFeaturesController.getSpecialOffers);
router.get('/special/offers/milestone', additionalFeaturesController.getMilestoneOffer);
router.post('/special/offers/milestone/claim', additionalFeaturesController.claimMilestoneOffer);
router.get('/special/offers/referral', additionalFeaturesController.getReferralProgram);
router.post('/special/offers/referral/claim', additionalFeaturesController.claimReferralReward);
router.post('/special/offers/validate', validationRules.validatePromocode, validate, additionalFeaturesController.validatePromocode);

// Re-bookings
router.get('/booking/all/re-bookings', additionalFeaturesController.getReBookings);
router.post('/booking/rebook-ride', validationRules.rebookRide, validate, additionalFeaturesController.rebookRide);

// Reviews
router.post('/user/review/create', validationRules.createReview, validate, additionalFeaturesController.createReview);

export default router;
