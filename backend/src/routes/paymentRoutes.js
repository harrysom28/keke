import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Payment initialization and processing
router.post('/payment/initialize', validationRules.initializePayment, validate, paymentController.initializePayment);
router.post('/payment/confirm', validationRules.confirmPayment, validate, paymentController.confirmStripePayment);

// Wallet operations (matching mobile app endpoints)
router.post('/user/payment/for-ride', validationRules.payForRide, validate, paymentController.payForRideWithWallet);
router.post('/user/profile/topup', validationRules.topUpWallet, validate, paymentController.topUpWallet);
router.post('/user/balance/withdraw', validationRules.withdrawBalance, validate, paymentController.withdrawBalance);

// Change retrieval (matching mobile app endpoint)
router.get('/user/ride/retrieve-change', paymentController.retrieveChange);

// Bank account management (matching mobile app endpoints)
router.post('/bank/account/create', validationRules.createBankAccount, validate, paymentController.createBankAccount);
router.get('/bank/account/lists', paymentController.getBankAccounts);

// Payment history
router.get('/user/payments', paymentController.getPaymentHistory);

export default router;
