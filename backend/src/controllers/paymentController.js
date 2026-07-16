import Payment from '../models/Payment.js';
import User from '../models/User.js';
import UserWallet from '../models/UserWallet.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import DriverWallet from '../models/DriverWallet.js';
import { getOrCreateWallet, getWithdrawableBalance, releasePendingForDriver, debitForPayout } from '../services/walletService.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import {
  initializeTransaction,
  verifyTransaction,
  listBanksNigeria,
  normalizeNgBankCode,
  resolveAccountName,
} from '../services/paystackService.js';

// Initialize Stripe (if API key is provided)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

/**
 * Initialize payment - POST /api/payment/initialize
 */
export const initializePayment = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, amount, method } = req.body;

  if (!rideId || !amount || !method) {
    throw new ValidationError('Ride ID, amount, and payment method are required');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.rider.toString() !== userId.toString()) {
    throw new ValidationError('You are not authorized to pay for this ride');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Ride must be completed before payment');
  }

  if (ride.paymentStatus === 'completed') {
    throw new ConflictError('Ride has already been paid');
  }

  // For wallet payments, check balance
  if (method === 'wallet') {
    const user = await User.findById(userId);
    if (user.balance < amount) {
      throw new ValidationError('Insufficient wallet balance');
    }
  }

  // For Stripe/card payments, create payment intent
  if (method === 'card' || method === 'stripe') {
    if (!stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: 'ngn',
        metadata: {
          userId: userId.toString(),
          rideId: rideId.toString(),
        },
      });

      // Create payment record
      const payment = await Payment.create({
        user: userId,
        ride: rideId,
        amount,
        method: 'stripe',
        status: 'processing',
        stripePaymentIntentId: paymentIntent.id,
      });

      return res.json({
        status: 'success',
        message: 'Payment initialized successfully',
        data: {
          payment: {
            payment_id: payment._id.toString(),
            client_secret: paymentIntent.client_secret,
            amount,
            currency: 'NGN',
            status: payment.status,
          },
        },
      });
    } catch (error) {
      logger.error(`Stripe payment initialization error: ${error.message}`);
      throw new ValidationError('Failed to initialize payment');
    }
  }

  // For wallet payments, process immediately
  if (method === 'wallet') {
    const user = await User.findById(userId);
    user.balance -= amount;
    await user.save();

    const payment = await Payment.create({
      user: userId,
      ride: rideId,
      amount,
      method: 'wallet',
      status: 'completed',
      transactionId: `WALLET-${Date.now()}-${userId}`,
      paidAt: new Date(),
    });

    ride.paymentStatus = 'completed';
    await ride.save();

    if (ride.driver) {
      try {
        const { applyRideEarningToWallet } = await import('../services/paymentService.js');
        await applyRideEarningToWallet(ride);
        const driver = await Driver.findById(ride.driver);
        if (driver) {
          driver.totalRides += 1;
          await driver.save();
        }
      } catch (err) {
        logger.error(`applyRideEarningToWallet failed for ride ${rideId}: ${err.message}`);
      }
    }

    logger.info(`Wallet payment completed for ride ${rideId}`);

    return res.json({
      status: 'success',
      message: 'Payment completed successfully',
      data: {
        payment: formatPaymentResponse(payment),
      },
    });
  }

  // For cash payments, create pending payment
  const payment = await Payment.create({
    user: userId,
    ride: rideId,
    amount,
    method: 'cash',
    status: 'pending',
  });

  res.json({
    status: 'success',
    message: 'Payment initialized successfully',
    data: {
      payment: formatPaymentResponse(payment),
    },
  });
});

/**
 * Pay for ride with wallet - POST /api/user/payment/for-ride
 */
export const payForRideWithWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.rider.toString() !== userId.toString()) {
    throw new ValidationError('You are not authorized to pay for this ride');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Ride must be completed before payment');
  }

  if (ride.paymentStatus === 'completed') {
    throw new ConflictError('Ride has already been paid');
  }

  const amount = ride.fare.totalFare;
  const user = await User.findById(userId);

  if (user.balance < amount) {
    throw new ValidationError('Insufficient wallet balance');
  }

  // Deduct from wallet
  user.balance -= amount;
  await user.save();

  // Create payment record
  const payment = await Payment.create({
    user: userId,
    ride: rideId,
    amount,
    method: 'wallet',
    status: 'completed',
    transactionId: `WALLET-${Date.now()}-${userId}`,
    paidAt: new Date(),
  });

  ride.paymentStatus = 'completed';
  await ride.save();

  if (ride.driver) {
    try {
      const { applyRideEarningToWallet } = await import('../services/paymentService.js');
      await applyRideEarningToWallet(ride);
      const driver = await Driver.findById(ride.driver);
      if (driver) {
        driver.totalRides += 1;
        await driver.save();
      }
    } catch (err) {
      logger.error(`applyRideEarningToWallet failed for ride ${rideId}: ${err.message}`);
    }
  }

  logger.info(`Wallet payment for ride ${rideId} completed`);

  res.json({
    status: 'success',
    message: 'Payment completed successfully',
    data: {
      payment: formatPaymentResponse(payment),
      remaining_balance: user.balance,
    },
  });
});

/**
 * Paystack redirect page - GET /api/payment/wallet-topup-redirect?reference=xxx
 * Public (no auth). Paystack redirects here after success; we return HTML that
 * immediately redirects to the app deep link so the app opens and can close the browser.
 */
export const getWalletTopupRedirect = (req, res) => {
  const reference = (req.query.reference || '').toString().trim();
  const appScheme = process.env.APP_SCHEME || 'myapp';
  const deepLink = reference
    ? `${appScheme}://wallet-topup-success?reference=${encodeURIComponent(reference)}`
    : `${appScheme}://wallet-topup-success`;
  const safeForMeta = deepLink.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${safeForMeta}"></head><body><p>Redirecting to app…</p><script>window.location.href=${JSON.stringify(deepLink)};</script></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

/**
 * Initialize wallet top-up (card) - POST /api/payment/initialize-wallet-topup
 * Returns Paystack authorization_url for user to complete payment; webhook credits wallet.
 */
export const initializeWalletTopup = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { amount } = req.body;

  const user = await User.findById(userId).select('email name');
  if (!user) {
    throw new NotFoundError('User');
  }

  const appScheme = process.env.APP_SCHEME || 'myapp';
  const apiBase = (process.env.API_BASE_URL || '').trim();
  const callbackUrl = apiBase.startsWith('https')
    ? `${apiBase.replace(/\/$/, '')}/api/payment/wallet-topup-redirect`
    : `${appScheme}://wallet-topup-success`;

  const result = await initializeTransaction({
    email: user.email || `user-${userId}@keke.app`,
    amount: Number(amount),
    metadata: {
      type: 'wallet_topup',
      userId: userId.toString(),
    },
    callback_url: callbackUrl,
  });

  if (!result || !result.authorization_url) {
    throw new ValidationError('Payment provider is not configured or failed to create checkout. Please try Bank Transfer.');
  }

  logger.info(`Wallet top-up initialized for user ${userId}, amount: ${amount}`);

  return res.json({
    status: 'success',
    message: 'Payment URL created. Complete payment in the browser.',
    data: {
      payment_url: result.authorization_url,
      reference: result.reference,
    },
  });
});

/**
 * Verify wallet top-up after user returns from Paystack - POST /api/payment/verify-wallet-topup
 * Session-free so it works on standalone MongoDB (no replica set required).
 * Idempotency: findOne before write; duplicate-key (11000) on Payment.create treated as already credited.
 */
export const verifyWalletTopup = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { reference } = req.body;

  if (!reference || typeof reference !== 'string' || !reference.trim()) {
    throw new ValidationError('Transaction reference is required');
  }

  const ref = reference.trim();
  const verified = await verifyTransaction(ref);

  const paystackData = verified?.data ?? verified;
  const outerStatus = verified?.status;
  const innerStatus = paystackData?.status;
  const isSuccess =
    innerStatus === 'success' ||
    outerStatus === 'success' ||
    innerStatus === true ||
    outerStatus === true;

  if (!verified || !isSuccess) {
    throw new ValidationError('Payment could not be verified or did not succeed');
  }

  const amountKobo = Number(paystackData?.amount ?? verified?.amount ?? 0);
  if (!Number.isFinite(amountKobo) || amountKobo < 100) {
    throw new ValidationError('Invalid payment amount from provider');
  }
  const amountNaira = amountKobo / 100;
  const metadata = paystackData?.metadata ?? verified?.metadata ?? {};
  if (metadata.type !== 'wallet_topup' || metadata.userId !== userId.toString()) {
    throw new ValidationError('This payment is not a wallet top-up for your account');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  const existingPayment = await Payment.findOne({
    user: userId,
    $or: [
      { transactionId: ref },
      { 'metadata.paystackReference': ref },
    ],
  });
  if (existingPayment) {
    logger.info(`Verify wallet top-up: already processed ${ref}`);
    const currentUser = await User.findById(userId).select('balance');
    return res.json({
      status: 'success',
      message: 'Payment already credited',
      data: { balance: currentUser?.balance ?? user.balance, already_credited: true },
    });
  }

  try {
    await Payment.create({
      user: userId,
      amount: amountNaira,
      method: 'card',
      status: 'completed',
      transactionId: ref,
      paidAt: new Date(),
      metadata: new Map(Object.entries({
        paystackReference: ref,
        type: 'wallet_topup',
        userId: userId.toString(),
      })),
    });
  } catch (err) {
    if (err.code === 11000) {
      logger.info(`Verify wallet top-up: concurrent duplicate for ${ref}`);
      const currentUser = await User.findById(userId).select('balance');
      return res.json({
        status: 'success',
        message: 'Payment already credited',
        data: { balance: currentUser?.balance ?? user.balance, already_credited: true },
      });
    }
    logger.error(`Verify wallet top-up: Payment.create failed: ${err.message}`);
    throw err;
  }

  await User.findByIdAndUpdate(userId, { $inc: { balance: amountNaira } });
  logger.info(`Verify wallet top-up: credited ₦${amountNaira} to user ${userId} (ref: ${ref})`);

  const updatedUser = await User.findById(userId).select('balance');
  try {
    const { sendToUser } = await import('../services/notificationService.js');
    await sendToUser(userId, user.role === 'driver' ? 'driver' : 'rider', {
      title: 'Wallet credited ✅',
      message: `Top-up: ₦${amountNaira.toLocaleString()} added. New balance: ₦${Number(updatedUser?.balance ?? 0).toLocaleString()}.`,
      type: 'alert',
      priority: 'high',
      screen: 'wallet',
      event_key: 'wallet_funded',
      data: { subType: 'wallet_funded', amount: String(amountNaira) },
    });
  } catch (notificationError) {
    logger.error(`Verify wallet top-up notification failed: ${notificationError.message}`);
  }
  return res.json({
    status: 'success',
    message: 'Wallet topped up successfully',
    data: { balance: updatedUser?.balance ?? 0, already_credited: false },
  });
});

/**
 * Top-up wallet - POST /api/user/profile/topup
 */
export const topUpWallet = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { amount, method, paymentIntentId } = req.body;

  if (!amount || amount <= 0) {
    throw new ValidationError('Valid amount is required');
  }

  if (!method) {
    throw new ValidationError('Payment method is required');
  }

  const user = await User.findById(userId);

  // For Stripe payments, confirm payment intent
  if (method === 'card' || method === 'stripe') {
    if (!paymentIntentId) {
      throw new ValidationError('Payment intent ID is required for card payments');
    }

    if (!stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        throw new ValidationError('Payment not completed');
      }

      // Verify amount matches
      if (paymentIntent.amount / 100 !== amount) {
        throw new ValidationError('Amount mismatch');
      }

      // Add to wallet
      user.balance += amount;
      await user.save();

      // Dual-write to rider UserWallet so GET /wallet and fare check see correct balance
      const riderWallet = await UserWallet.findOne({ userId, userType: 'rider' });
      if (riderWallet) {
        riderWallet.availableBalance = (Number(riderWallet.availableBalance) || 0) + amount;
        await riderWallet.save();
      }

      // Create payment record
      const payment = await Payment.create({
        user: userId,
        amount,
        method: 'stripe',
        status: 'completed',
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId: paymentIntent.latest_charge || null,
        transactionId: paymentIntent.id,
        paidAt: new Date(),
      });

      logger.info(`Wallet top-up completed for user ${userId}: $${amount}`);

      try {
        const { sendToUser } = await import('../services/notificationService.js');
        await sendToUser(userId, user.role === 'driver' ? 'driver' : 'rider', {
          title: 'Wallet credited ✅',
          message: `Top-up: ₦${Number(amount).toLocaleString()} added. New balance: ₦${Number(user.balance).toLocaleString()}.`,
          type: 'alert',
          priority: 'high',
          screen: 'wallet',
          event_key: 'wallet_funded',
          data: { subType: 'wallet_funded', amount: String(amount) },
        });
      } catch (notificationError) {
        logger.error(`Wallet top-up notification failed: ${notificationError.message}`);
      }

      return res.json({
        status: 'success',
        message: 'Wallet topped up successfully',
        data: {
          payment: formatPaymentResponse(payment),
          balance: user.balance,
        },
      });
    } catch (error) {
      logger.error(`Stripe top-up error: ${error.message}`);
      throw new ValidationError('Payment verification failed');
    }
  }

  // For bank transfer, create pending payment
  if (method === 'bank_transfer') {
    const payment = await Payment.create({
      user: userId,
      amount,
      method: 'bank_transfer',
      status: 'pending',
    });

    return res.json({
      status: 'success',
      message: 'Top-up request created. Balance will be updated after verification.',
      data: {
        payment: formatPaymentResponse(payment),
        balance: user.balance,
      },
    });
  }

  throw new ValidationError('Invalid payment method');
});

/**
 * Withdraw balance - POST /api/user/balance/withdraw
 */
export const withdrawBalance = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { amount, bankAccountId } = req.body;

  if (!amount || amount <= 0) {
    throw new ValidationError('Valid amount is required');
  }

  const user = await User.findById(userId);

  // Check if user is a driver
  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new ValidationError('Only drivers can withdraw earnings');
  }

  // Authoritative guard: cannot withdraw funds reserved for outstanding
  // commission debt. Withdrawable = available − commissionOwed (from DriverWallet,
  // the canonical balance shown in-app).
  await getOrCreateWallet(driver._id);
  // Clear any overdue pending credits first so drivers can withdraw earnings
  // whose 24h hold has elapsed, even if the release cron hasn't run yet.
  await releasePendingForDriver(driver._id);
  const driverWallet = await DriverWallet.findOne({ driverId: driver._id }).lean();
  const withdrawable = getWithdrawableBalance(driverWallet);
  if (withdrawable < amount) {
    const owed = Math.round(Number(driverWallet?.commissionOwed) || 0);
    const available = Math.round(withdrawable);
    throw new ValidationError(
      owed > 0
        ? `You can withdraw up to ₦${available.toLocaleString()}. ₦${owed.toLocaleString()} of your balance is reserved for platform commission from cash rides.`
        : `You can withdraw up to ₦${available.toLocaleString()}.`
    );
  }

  // Require bank account (verified optional until verification flow exists)
  if (!driver.bankAccount || !driver.bankAccount.accountNumber || !driver.bankAccount.bankName) {
    throw new ValidationError('Add your bank account in profile to withdraw earnings');
  }

  // DriverWallet is the canonical balance (shown in-app). Create the pending
  // withdrawal, then reserve funds from available balance. Do not gate on the
  // legacy driver.earnings.total field — it is not kept in sync with credits.
  // Always set a real transactionId: Payment.transactionId is unique+sparse, and
  // storing null caused every second withdrawal to 409 as a duplicate key.
  let payment;
  try {
    payment = await Payment.create({
      user: userId,
      amount: -amount,
      method: 'bank_transfer',
      status: 'pending',
      transactionId: `WDR-${new mongoose.Types.ObjectId().toString()}`,
      metadata: {
        type: 'withdrawal',
        driverId: driver._id.toString(),
        bankName: driver.bankAccount.bankName || '',
        accountNumber: driver.bankAccount.accountNumber || '',
        accountName: driver.bankAccount.accountName || '',
      },
    });
  } catch (err) {
    logger.error(`Withdrawal Payment.create failed for driver ${driver._id}: ${err.message}`, {
      code: err.code,
      keyValue: err.keyValue,
    });
    if (err?.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'transactionId';
      throw new ConflictError(
        field === 'reference'
          ? 'This payment was already submitted. Please wait a moment and try again.'
          : 'A withdrawal with this reference already exists. Please try again.'
      );
    }
    throw err;
  }

  try {
    await debitForPayout(driver._id, amount, payment._id.toString());
  } catch (err) {
    payment.status = 'cancelled';
    payment.failureReason = err.message || 'Could not reserve wallet funds';
    await payment.save().catch(() => {});
    logger.error(`Withdrawal debit failed for driver ${driver._id}: ${err.message}`, {
      code: err.code,
      paymentId: payment._id.toString(),
    });
    if (err?.code === 11000) {
      throw new ConflictError(
        'This withdrawal was already reserved. Please refresh your wallet and try again.'
      );
    }
    const msg = String(err?.message || '');
    if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('balance')) {
      const available = Math.round(
        getWithdrawableBalance(await DriverWallet.findOne({ driverId: driver._id }).lean())
      );
      throw new ValidationError(`You can withdraw up to ₦${available.toLocaleString()}.`);
    }
    // Surface the real operational message when we have one; avoid opaque generics.
    if (msg && msg.length < 180 && !msg.includes('E11000')) {
      throw new ValidationError(msg);
    }
    throw new ValidationError(
      'Could not reserve funds for this withdrawal. Please try again in a moment.'
    );
  }

  // Best-effort sync of legacy earnings ledger for older admin views.
  try {
    const remaining = Math.max(0, (Number(driver.earnings?.total) || 0) - amount);
    driver.earnings = driver.earnings || {};
    driver.earnings.total = remaining;
    driver.earnings.lastUpdated = new Date();
    await driver.save();
  } catch (err) {
    logger.warn(`Legacy earnings.total sync failed after withdraw for driver ${driver._id}: ${err.message}`);
  }

  logger.info(`Withdrawal request created for driver ${driver._id}: ₦${amount}`);

  try {
    const { sendToUser } = await import('../services/notificationService.js');
    await sendToUser(userId, 'driver', {
      title: 'Withdrawal requested',
      message: `Your withdrawal of ₦${Number(amount).toLocaleString()} is pending admin approval.`,
      type: 'alert',
      priority: 'high',
      screen: 'wallet',
      event_key: 'withdrawal_requested',
      relatedPayment: payment._id,
      data: {
        subType: 'withdrawal_requested',
        withdrawal_id: payment._id.toString(),
        amount: String(amount),
      },
    });
  } catch (notificationError) {
    logger.error(`Withdrawal request notification failed: ${notificationError.message}`);
  }

  // Best-effort email to admins so Finance can act without polling.
  try {
    const { sendEmail } = await import('../services/notificationService.js');
    const admins = await User.find({ role: 'admin' }).select('email name').lean();
    const subject = `Withdrawal request: ₦${Number(amount).toLocaleString()}`;
    const body =
      `Driver ${user?.name || userId} requested a withdrawal of ₦${Number(amount).toLocaleString()}.\n` +
      `Bank: ${driver.bankAccount?.bankName || '—'} · ${driver.bankAccount?.accountName || '—'} · ${driver.bankAccount?.accountNumber || '—'}\n` +
      `Withdrawal ID: ${payment._id.toString()}\n` +
      `Review in Admin → Finance → Withdrawals.`;
    await Promise.allSettled(
      admins
        .filter((a) => a.email)
        .map((a) => sendEmail(a.email, subject, body))
    );
  } catch (emailError) {
    logger.warn(`Withdrawal admin email failed: ${emailError.message}`);
  }

  const walletAfter = await DriverWallet.findOne({ driverId: driver._id }).lean();
  res.json({
    status: 'success',
    message: 'Withdrawal request submitted. It will be processed after admin approval.',
    data: {
      withdrawal_id: payment._id.toString(),
      amount,
      status: payment.status,
      remaining_earnings: Math.round(getWithdrawableBalance(walletAfter)),
    },
  });
});

/**
 * Retrieve change - GET /api/user/ride/retrieve-change
 */
export const retrieveChange = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.query;

  if (!rideId) {
    throw new ValidationError('Ride ID is required');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.rider.toString() !== userId.toString()) {
    throw new ValidationError('You are not authorized to retrieve change for this ride');
  }

  const changeAmount = ride.changeAmount || 0;

  if (changeAmount <= 0) {
    return res.json({
      status: 'success',
      message: 'No change available',
      data: {
        change_amount: 0,
      },
    });
  }

  // Add change to wallet
  const user = await User.findById(userId);
  user.balance += changeAmount;
  await user.save();

  // Update ride
  ride.changeAmount = 0;
  await ride.save();

  logger.info(`Change retrieved for ride ${rideId}: $${changeAmount}`);

  res.json({
    status: 'success',
    message: 'Change retrieved successfully',
    data: {
      change_amount: changeAmount,
      new_balance: user.balance,
    },
  });
});

/**
 * Nigerian banks for payout UI — GET /bank/nigeria/list (Paystack-backed).
 */
export const listNigeriaBanks = asyncHandler(async (req, res) => {
  const banks = await listBanksNigeria();
  if (!banks || banks.length === 0) {
    res.json({
      status: 'success',
      data: {
        banks: [],
        unavailable: true,
      },
      message: !banks
        ? 'Bank directory is temporarily unavailable. Try again shortly.'
        : 'No banks are available from the payment provider.',
    });
    return;
  }

  res.json({
    status: 'success',
    data: { banks, unavailable: false },
  });
});

/**
 * Resolve account holder name — POST /bank/resolve (Paystack NIBSS).
 */
export const resolveBankAccount = asyncHandler(async (req, res) => {
  const accountNumber = req.body?.accountNumber ?? req.query?.accountNumber;
  const bankCode = req.body?.bankCode ?? req.query?.bankCode;
  const result = await resolveAccountName({
    account_number: accountNumber,
    bank_code: bankCode,
  });

  if (result.account_name) {
    res.json({
      status: 'success',
      data: {
        account_name: result.account_name,
        account_number: result.account_number,
      },
    });
    return;
  }

  if (result.error === 'paystack_unconfigured') {
    res.status(503).json({
      status: 'error',
      message: 'Account verification is not configured. Enter the name exactly as on your bank account.',
    });
    return;
  }

  throw new ValidationError(
    typeof result.error === 'string' ? result.error : 'Could not verify account details.'
  );
});

/**
 * Create bank account - POST /api/bank/account/create
 */
export const createBankAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { accountName, accountNumber, bankName, bankCode } = req.body;

  if (!accountNumber || !bankName) {
    throw new ValidationError('Account number and bank name are required');
  }

  const digits = String(accountNumber).replace(/\D/g, '');
  if (digits.length !== 10) {
    throw new ValidationError('Account number must be 10 digits');
  }

  const trimmedCode = bankCode != null ? String(bankCode).trim() : '';
  const code = trimmedCode ? normalizeNgBankCode(trimmedCode) : '';
  let finalAccountName = accountName != null ? String(accountName).trim() : '';

  const resolved = code ? await resolveAccountName({ account_number: digits, bank_code: code }) : null;

  if (code) {
    if (resolved?.account_name) {
      finalAccountName = resolved.account_name;
    } else if (!finalAccountName) {
      if (resolved?.error === 'paystack_unconfigured') {
        throw new ValidationError('Account name is required');
      }
      throw new ValidationError(
        typeof resolved?.error === 'string'
          ? resolved.error
          : 'Could not verify this bank account. Enter your account name exactly as it appears with your bank, then try again.'
      );
    }
    // Verification failed but client supplied a name — keep it; payout accounts stay admin-verified.
  } else if (!finalAccountName) {
    throw new ValidationError('Account name is required');
  }

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  driver.bankAccount = {
    accountName: finalAccountName,
    accountNumber: digits,
    bankName: String(bankName).trim(),
    bankCode: code || null,
    verified: false, // Requires admin verification
  };

  await driver.save();

  logger.info(`Bank account created for driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Bank account added successfully. It will be verified by admin.',
    data: {
      bank_account: driver.bankAccount,
    },
  });
});

/**
 * Get bank accounts - GET /api/bank/account/lists
 */
export const getBankAccounts = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const bankAccounts = driver.bankAccount ? [driver.bankAccount] : [];

  res.json({
    status: 'success',
    data: {
      bank_accounts: bankAccounts.map((account) => ({
        account_id: account._id?.toString() || 'main',
        account_name: account.accountName,
        account_number: account.accountNumber,
        bank_name: account.bankName,
        bank_code: account.bankCode,
        verified: account.verified,
      })),
    },
  });
});

/**
 * Confirm Stripe payment - POST /api/payment/confirm
 */
export const confirmStripePayment = asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;

  if (!paymentIntentId) {
    throw new ValidationError('Payment intent ID is required');
  }

  if (!stripe) {
    throw new ValidationError('Stripe is not configured');
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new ValidationError('Payment not completed');
    }

    // Find payment record
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
    if (!payment) {
      throw new NotFoundError('Payment record');
    }

    if (payment.status === 'completed') {
      throw new ConflictError('Payment already confirmed');
    }

    // Update payment status
    payment.status = 'completed';
    payment.stripeChargeId = paymentIntent.latest_charge || null;
    payment.transactionId = paymentIntent.id;
    payment.paidAt = new Date();
    await payment.save();

    if (payment.ride) {
      const ride = await Ride.findById(payment.ride);
      if (ride) {
        ride.paymentStatus = 'completed';
        await ride.save();
        if (ride.driver) {
          try {
            const { applyRideEarningToWallet } = await import('../services/paymentService.js');
            await applyRideEarningToWallet(ride);
            const driver = await Driver.findById(ride.driver);
            if (driver) {
              driver.totalRides += 1;
              await driver.save();
            }
          } catch (err) {
            logger.error(`applyRideEarningToWallet failed: ${err.message}`);
          }
        }
      }
    }

    // If payment is for wallet top-up, update user balance
    if (!payment.ride && payment.amount > 0) {
      const user = await User.findById(payment.user);
      if (user) {
        user.balance += payment.amount;
        await user.save();
        try {
          const { sendToUser } = await import('../services/notificationService.js');
          await sendToUser(user._id, user.role === 'driver' ? 'driver' : 'rider', {
            title: 'Wallet credited ✅',
            message: `Top-up: ₦${Number(payment.amount).toLocaleString()} added. New balance: ₦${Number(user.balance).toLocaleString()}.`,
            type: 'alert',
            priority: 'high',
            screen: 'wallet',
            event_key: 'wallet_funded',
            data: { subType: 'wallet_funded', amount: String(payment.amount) },
          });
        } catch (notificationError) {
          logger.error(`Stripe wallet top-up notification failed: ${notificationError.message}`);
        }
      }
    }

    logger.info(`Stripe payment confirmed: ${paymentIntentId}`);

    res.json({
      status: 'success',
      message: 'Payment confirmed successfully',
      data: {
        payment: formatPaymentResponse(payment),
      },
    });
  } catch (error) {
    logger.error(`Stripe payment confirmation error: ${error.message}`);
    throw new ValidationError('Payment confirmation failed');
  }
});

function paymentRideIdString(payment) {
  const r = payment?.ride;
  if (!r) return null;
  if (typeof r === 'object' && r._id) return r._id.toString();
  return String(r);
}

/**
 * Get payment history - GET /api/user/payments
 * Merges Payment rows with UserWalletTransaction ledger lines (holds, releases,
 * penalties, fare debits, top-ups, etc.) so wallet activity is fully visible.
 */
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const { type } = req.query;
  const skip = (page - 1) * limit;

  const filter = { user: userId };

  if (type === 'topup') {
    filter.ride = null;
    filter.amount = { $gt: 0 };
  } else if (type === 'withdrawal') {
    filter.amount = { $lt: 0 };
  } else if (type === 'ride') {
    filter.ride = { $ne: null };
  }

  if (type === 'topup' || type === 'withdrawal') {
    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('ride', 'status fare pickupLocation dropoffLocation')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter),
    ]);

    return res.json({
      status: 'success',
      data: {
        payments: payments.map((payment) => enrichRiderPaymentRow(payment)),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 0,
        },
      },
    });
  }

  const FETCH_CAP = 500;
  const paymentFilter =
    type === 'ride' ? { user: userId, ride: { $ne: null } } : { user: userId };

  const [paymentDocs, ledgerDocs] = await Promise.all([
    Payment.find(paymentFilter)
      .populate('ride', 'status fare pickupLocation dropoffLocation')
      .sort({ createdAt: -1 })
      .limit(FETCH_CAP)
      .lean(),
    UserWalletTransaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(400)
      .lean(),
  ]);

  const rideIdsWithFarePayment = new Set();
  const topupRefs = new Set();
  for (const p of paymentDocs) {
    const rid = paymentRideIdString(p);
    if (rid) rideIdsWithFarePayment.add(rid);
    if (p.reference) topupRefs.add(String(p.reference));
    if (p.transactionId) topupRefs.add(String(p.transactionId));
  }

  const paymentRows = paymentDocs.map((p) => enrichRiderPaymentRow(p));

  const RIDER_LEDGER_FALLBACK = {
    topup: 'Wallet top-up',
    hold: 'Funds held for ride',
    hold_release: 'Hold released to wallet',
    service_charge: 'Service charge',
    fare_debit: 'Ride payment',
    fare_credit: 'Earnings credit',
    platform_fee: 'Platform fee',
    cancel_penalty: 'Cancellation fee',
    cancel_payout: 'Cancellation compensation',
    withdrawal: 'Withdrawal',
    refund: 'Refund',
  };

  const ledgerRows = [];
  for (const tx of ledgerDocs) {
    const row = buildRiderWalletLedgerRow(tx, userId, {
      rideIdsWithFarePayment,
      topupRefs,
      fallbackLabels: RIDER_LEDGER_FALLBACK,
    });
    if (row) ledgerRows.push(row);
  }

  const merged = [...paymentRows, ...ledgerRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const paginated = merged.slice(skip, skip + limit);

  res.json({
    status: 'success',
    data: {
      payments: paginated,
      pagination: {
        page,
        limit,
        total: merged.length,
        pages: Math.ceil(merged.length / limit) || 0,
      },
    },
  });
});

/**
 * Format payment response
 */
const formatPaymentResponse = (payment) => {
  const ride_id = paymentRideIdString(payment);
  const uid = payment.user?._id?.toString?.() || payment.user?.toString?.() || String(payment.user);
  return {
    payment_id: payment._id.toString(),
    user_id: uid,
    ride_id,
    amount: Math.abs(payment.amount),
    currency: payment.currency,
    method: payment.method,
    status: payment.status,
    transaction_id: payment.transactionId,
    stripe_payment_intent_id: payment.stripePaymentIntentId,
    refund_amount: payment.refundAmount,
    created_at: payment.createdAt,
    paid_at: payment.paidAt,
  };
};

function getPaymentMeta(payment, key) {
  const m = payment.metadata;
  if (!m) return null;
  if (typeof m.get === 'function') return m.get(key);
  return m[key];
}

function riderPaymentEntryType(payment) {
  const rideId = paymentRideIdString(payment);
  const amt = Number(payment.amount) || 0;
  if (rideId && amt >= 0) return 'debit';
  if (!rideId && amt > 0) return 'credit';
  if (!rideId && amt < 0) return 'debit';
  return 'neutral';
}

function riderPaymentDescription(payment) {
  const rideId = paymentRideIdString(payment);
  const amt = Number(payment.amount) || 0;
  const metaType = getPaymentMeta(payment, 'type');
  if (metaType === 'withdrawal' || amt < 0) return 'Withdrawal request';
  if (payment.paymentType === 'wallet_topup' || (!rideId && amt > 0)) return 'Wallet top-up';
  if (rideId) return 'Ride payment';
  return 'Payment';
}

function enrichRiderPaymentRow(payment) {
  const base = formatPaymentResponse(payment);
  const rideId = paymentRideIdString(payment);
  return {
    ...base,
    description: riderPaymentDescription(payment),
    entry_type: riderPaymentEntryType(payment),
    ledger_type: rideId ? 'ride_payment' : payment.paymentType || 'payment',
    ledger_source: 'payment',
  };
}

function buildRiderWalletLedgerRow(tx, userId, { rideIdsWithFarePayment, topupRefs, fallbackLabels }) {
  const rawAmount = Number(tx.amount) || 0;
  if (tx.type === 'service_charge' && rawAmount === 0) {
    return null;
  }
  if (tx.type === 'topup' && tx.providerRef && topupRefs.has(String(tx.providerRef))) {
    return null;
  }
  if (tx.type === 'fare_debit' && tx.rideId && rideIdsWithFarePayment.has(tx.rideId.toString())) {
    return null;
  }

  const entry_type = rawAmount >= 0 ? 'credit' : 'debit';
  const abs = Math.abs(rawAmount);
  const description =
    (tx.description && String(tx.description).trim()) || fallbackLabels[tx.type] || 'Wallet transaction';

  return {
    payment_id: `ledger_${tx._id.toString()}`,
    user_id: userId.toString(),
    ride_id: tx.rideId ? tx.rideId.toString() : null,
    amount: abs,
    currency: 'NGN',
    method: 'wallet',
    status: tx.status || 'completed',
    transaction_id: tx.providerRef || tx.idempotencyKey || null,
    stripe_payment_intent_id: null,
    refund_amount: 0,
    created_at: tx.createdAt,
    paid_at: tx.createdAt,
    description,
    entry_type,
    ledger_type: tx.type,
    ledger_source: 'user_wallet',
  };
}
