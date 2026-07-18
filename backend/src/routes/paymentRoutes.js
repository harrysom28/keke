import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import * as walletFundingController from '../controllers/walletFundingController.js';
import { protect } from '../middleware/auth.js';
import { requireDriverApproved, requireBankDetails } from '../middleware/onboarding.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public: Paystack redirects here after payment; we redirect to app deep link (no auth)
router.get('/payment/wallet-topup-redirect', paymentController.getWalletTopupRedirect);
router.get('/payment/ride-card-redirect', paymentController.getRideCardRedirect);

// All routes below require authentication
router.use(protect);

// Wallet: balance + DVA (create DVA if missing). Wallet funding (Paystack): initialize checkout, verify after redirect
router.get('/wallet', limiters.walletOpsLimiter, walletFundingController.getWalletWithDVA);
router.post('/wallet/fund', limiters.walletOpsLimiter, validationRules.walletFund, validate, walletFundingController.fundWallet);
router.get('/wallet/verify', limiters.walletOpsLimiter, validationRules.walletVerify, validate, walletFundingController.verifyWalletPayment);

// Payment initialization and processing
router.post('/payment/initialize', validationRules.initializePayment, validate, paymentController.initializePayment);
router.post('/payment/initialize-wallet-topup', limiters.walletOpsLimiter, validationRules.initializeWalletTopup, validate, paymentController.initializeWalletTopup);
router.post('/payment/verify-wallet-topup', limiters.walletOpsLimiter, validationRules.verifyWalletTopup, validate, paymentController.verifyWalletTopup);
router.post(
  '/payment/initialize-ride-card',
  limiters.walletOpsLimiter,
  validationRules.initializeRideCardPayment,
  validate,
  paymentController.initializeRideCardPayment
);
router.post(
  '/payment/verify-ride-card',
  limiters.walletOpsLimiter,
  validationRules.verifyRideCardPayment,
  validate,
  paymentController.verifyRideCardPayment
);
router.post('/payment/confirm', validationRules.confirmStripePayment, validate, paymentController.confirmStripePayment);

// Wallet operations (matching mobile app endpoints)
router.post('/user/payment/for-ride', limiters.walletOpsLimiter, validationRules.payForRide, validate, paymentController.payForRideWithWallet);
router.post('/user/profile/topup', limiters.walletOpsLimiter, validationRules.topUpWallet, validate, paymentController.topUpWallet);
router.post('/user/balance/withdraw', limiters.walletOpsLimiter, requireDriverApproved, requireBankDetails, validationRules.withdrawBalance, validate, paymentController.withdrawBalance);

// Change retrieval (matching mobile app endpoint)
router.get('/user/ride/retrieve-change', paymentController.retrieveChange);

// Bank directory + NIBSS resolve (Paystack; authenticated)
router.get('/bank/nigeria/list', limiters.walletOpsLimiter, paymentController.listNigeriaBanks);
router.post(
  '/bank/resolve',
  limiters.bankResolveLimiter,
  validationRules.resolveBankAccount,
  validate,
  paymentController.resolveBankAccount
);
router.get(
  '/bank/resolve',
  limiters.bankResolveLimiter,
  validationRules.resolveBankAccountQuery,
  validate,
  paymentController.resolveBankAccount
);

// Bank account management (matching mobile app endpoints)
router.post('/bank/account/create', validationRules.createBankAccount, validate, paymentController.createBankAccount);
router.get('/bank/account/lists', paymentController.getBankAccounts);

// Payment history
router.get('/user/payments', paymentController.getPaymentHistory);

export default router;
