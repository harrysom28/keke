/**
 * Wallet funding: Paystack checkout (card/bank) and verify.
 * POST /api/wallet/fund - initialize checkout, return authorization_url (do NOT credit here).
 * GET /api/wallet/verify?reference=xxx - verify with Paystack, credit if not already, return balance.
 *
 * Mobile: Use Linking.openURL(authorization_url) or WebBrowser.openBrowserAsync(authorization_url).
 * Do NOT use a custom in-app WebView modal for Paystack - open system browser or in-app browser.
 * After redirect, app receives deep link with reference; call GET /api/wallet/verify?reference=xxx.
 */
import { asyncHandler } from '../utils/errors.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import UserWallet from '../models/UserWallet.js';
import Driver from '../models/Driver.js';
import WalletFundingTransaction from '../models/WalletFundingTransaction.js';
import { initializeTransaction, verifyTransaction, createDVAForUser } from '../services/paystackService.js';
import { creditWalletFromPaystack } from '../services/walletFundingService.js';
import {
  reconcileCancelledScheduledRideEscrows,
  reconcileOrphanedWalletHoldsForRider,
  computeRiderWalletApiTotals,
} from '../services/escrowWalletService.js';

const MIN_AMOUNT_NGN = 100;

/**
 * GET /api/wallet
 * Returns balance and DVA (bank transfer) details. Creates DVA for user if not yet assigned.
 * Mobile Wallet screen: call this on open; display balance and bank account for transfers.
 */
export const getWalletWithDVA = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  await reconcileCancelledScheduledRideEscrows(userId);
  await reconcileOrphanedWalletHoldsForRider(userId);
  let user = await User.findById(userId)
    .select('balance paystackCustomerCode dvaAccountNumber dvaBankName dvaAccountName')
    .lean();
  if (!user) throw new NotFoundError('User');

  let dva = null;
  if (user.dvaAccountNumber && user.dvaBankName) {
    dva = {
      account_number: user.dvaAccountNumber,
      bank_name: user.dvaBankName,
      account_name: user.dvaAccountName || undefined,
    };
  } else {
    const fullUser = await User.findById(userId);
    // Drivers get DVA only when approved by admin (created in adminController.verifyDriver)
    const isDriver = fullUser?.role === 'driver';
    const driverApproved = isDriver
      ? (await Driver.findOne({ user: userId }).select('verificationStatus').lean())?.verificationStatus === 'approved'
      : true;
    if (!driverApproved) {
      // Driver not yet approved - do not create DVA; they get it when admin approves
    } else {
      const created = await createDVAForUser(fullUser);
      if (created) {
        await User.findByIdAndUpdate(userId, {
          paystackCustomerCode: created.paystackCustomerCode,
          dvaAccountNumber: created.account_number,
          dvaBankName: created.bank_name,
          dvaAccountName: created.account_name,
        });
        dva = {
          account_number: created.account_number,
          bank_name: created.bank_name,
          account_name: created.account_name,
        };
      }
    }
    user = await User.findById(userId)
      .select('balance paystackCustomerCode dvaAccountNumber dvaBankName dvaAccountName')
      .lean();
  }

  const escrowWallet = await UserWallet.findOne({ userId, userType: 'rider' }).lean();
  const totals = computeRiderWalletApiTotals(user?.balance, escrowWallet);

  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    status: 'success',
    data: {
      balance: totals.balance,
      availableBalance: totals.availableBalance,
      heldBalance: escrowWallet?.heldBalance ?? 0,
      dva,
    },
  });
});
const MAX_AMOUNT_NGN = 10_000_000;

/**
 * POST /api/wallet/fund
 * Body: { amount } (NGN)
 * Returns: { authorization_url, reference }
 */
export const fundWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const amount = Number(req.body.amount);

  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_NGN || amount > MAX_AMOUNT_NGN) {
    throw new ValidationError(`Amount must be between ₦${MIN_AMOUNT_NGN} and ₦${MAX_AMOUNT_NGN}`);
  }

  const user = await User.findById(userId).select('email name');
  if (!user) throw new NotFoundError('User');

  const apiBase = (process.env.API_BASE_URL || '').trim();
  const appScheme = process.env.APP_SCHEME || 'keke';
  const callbackUrl = apiBase.startsWith('https')
    ? `${apiBase.replace(/\/$/, '')}/api/payment/wallet-topup-redirect`
    : `${appScheme}://wallet-topup-success`;

  const result = await initializeTransaction({
    email: user.email || `user-${userId}@keke.app`,
    amount,
    metadata: {
      type: 'wallet_topup',
      userId: userId.toString(),
    },
    callback_url: callbackUrl,
  });

  if (!result || !result.authorization_url) {
    logger.warn('Wallet fund: Paystack initialize failed', { userId: userId.toString(), amount });
    throw new ValidationError('Payment provider is not configured or failed. Try bank transfer.');
  }

  const payment = await Payment.create({
    user: userId,
    amount,
    currency: 'NGN',
    method: 'card',
    status: 'initialized',
    paymentType: 'wallet_topup',
    reference: result.reference,
    access_code: result.access_code,
    metadata: new Map([
      ['type', 'wallet_topup'],
      ['userId', userId.toString()],
    ]),
  });

  logger.info('Wallet fund: initialized', {
    reference: result.reference,
    userId: userId.toString(),
    amount,
    paymentId: payment._id.toString(),
  });

  res.status(200).json({
    status: 'success',
    data: {
      authorization_url: result.authorization_url,
      reference: result.reference,
      access_code: result.access_code,
    },
  });
});

/**
 * GET /api/wallet/verify?reference=xxx
 * Verifies with Paystack; if success and not already credited, credits wallet (idempotent).
 * Returns: { balance, already_credited }
 */
export const verifyWalletPayment = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const reference = (req.query.reference || '').toString().trim();

  if (!reference) {
    throw new ValidationError('Reference is required');
  }

  const verified = await verifyTransaction(reference);
  const data = verified?.data ?? verified;
  const status = data?.status ?? verified?.status;
  const isSuccess = status === 'success' || status === true;

  if (!verified || !isSuccess) {
    throw new ValidationError('Payment could not be verified or did not succeed');
  }

  const amountKobo = Number(data?.amount ?? verified?.amount ?? 0);
  if (!Number.isFinite(amountKobo) || amountKobo < 100) {
    throw new ValidationError('Invalid payment amount');
  }
  const amountNaira = amountKobo / 100;
  const metadata = data?.metadata ?? verified?.metadata ?? {};
  if (metadata.type !== 'wallet_topup' || metadata.userId !== userId.toString()) {
    throw new ValidationError('This payment is not a wallet top-up for your account');
  }

  const existingLedger = await WalletFundingTransaction.findOne({ reference }).lean();
  if (existingLedger) {
    const user = await User.findById(userId).select('balance').lean();
    return res.json({
      status: 'success',
      data: {
        balance: user?.balance ?? 0,
        already_credited: true,
      },
    });
  }

  await creditWalletFromPaystack(reference, amountNaira, userId.toString(), {
    channel: 'card',
    ip: req.ip,
  });

  const user = await User.findById(userId).select('balance').lean();
  res.json({
    status: 'success',
    data: {
      balance: user?.balance ?? 0,
      already_credited: false,
    },
  });
});
