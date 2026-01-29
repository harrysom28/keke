import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import Stripe from 'stripe';

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
        currency: 'usd',
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
            currency: 'USD',
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

    // Update driver earnings
    if (ride.driver) {
      const driver = await Driver.findById(ride.driver);
      if (driver) {
        await driver.addEarnings(amount);
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

  // Update ride payment status
  ride.paymentStatus = 'completed';
  await ride.save();

  // Update driver earnings
  if (ride.driver) {
    const driver = await Driver.findById(ride.driver);
    if (driver) {
      await driver.addEarnings(amount);
      driver.totalRides += 1;
      await driver.save();
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

  // Check balance
  if (driver.earnings.total < amount) {
    throw new ValidationError('Insufficient earnings balance');
  }

  // Check if bank account is verified
  if (!driver.bankAccount || !driver.bankAccount.verified) {
    throw new ValidationError('Bank account must be verified before withdrawal');
  }

  // Create withdrawal request (in real app, this would be processed by admin)
  const payment = await Payment.create({
    user: userId,
    amount: -amount, // Negative for withdrawal
    method: 'bank_transfer',
    status: 'pending',
    metadata: {
      type: 'withdrawal',
      bankAccountId: bankAccountId || driver.bankAccount._id?.toString(),
    },
  });

  // Deduct from driver earnings (in real app, this would be done after admin approval)
  // For now, we'll mark it as pending
  logger.info(`Withdrawal request created for driver ${driver._id}: $${amount}`);

  res.json({
    status: 'success',
    message: 'Withdrawal request submitted. It will be processed after admin approval.',
    data: {
      payment: formatPaymentResponse(payment),
      remaining_earnings: driver.earnings.total,
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
 * Create bank account - POST /api/bank/account/create
 */
export const createBankAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { accountName, accountNumber, bankName, bankCode } = req.body;

  if (!accountName || !accountNumber || !bankName) {
    throw new ValidationError('Account name, account number, and bank name are required');
  }

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  driver.bankAccount = {
    accountName,
    accountNumber,
    bankName,
    bankCode: bankCode || null,
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

    // If payment is for a ride, update ride status
    if (payment.ride) {
      const ride = await Ride.findById(payment.ride);
      if (ride) {
        ride.paymentStatus = 'completed';
        await ride.save();

        // Update driver earnings
        if (ride.driver) {
          const driver = await Driver.findById(ride.driver);
          if (driver) {
            await driver.addEarnings(payment.amount);
            driver.totalRides += 1;
            await driver.save();
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

/**
 * Get payment history - GET /api/user/payments
 */
export const getPaymentHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, type } = req.query;

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

  const payments = await Payment.find(filter)
    .populate('ride', 'status fare pickupLocation dropoffLocation')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Payment.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      payments: payments.map((payment) => formatPaymentResponse(payment)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Format payment response
 */
const formatPaymentResponse = (payment) => {
  return {
    payment_id: payment._id.toString(),
    user_id: payment.user._id?.toString() || payment.user.toString(),
    ride_id: payment.ride?._id?.toString() || null,
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
