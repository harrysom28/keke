import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Driver from '../models/Driver.js';
import logger from '../utils/logger.js';
import Stripe from 'stripe';
import { computeCommission } from './commissionService.js';
import { creditRideEarning, accrueCommissionDebt } from './walletService.js';
import { settleRide as escrowSettleRide } from './escrowWalletService.js';

// Initialize Stripe (if API key is provided)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

/**
 * Apply commission and credit driver wallet for a completed ride payment. Idempotent.
 * @param {Object} ride - Ride doc (with driver id and vehicleType id)
 */
export async function applyRideEarningToWallet(ride) {
  const driverId = ride.driver?._id || ride.driver;
  if (!driverId) return;
  if (ride.fare?.commissionAmount != null) return;

  const grossFare = Number(ride.fare?.totalFare) || 0;
  if (grossFare <= 0) return;

  const vehicleTypeId = ride.vehicleType?._id || ride.vehicleType || null;
  const { commissionAmount, driverNetAmount, platformRevenue, commissionRate } = await computeCommission(grossFare, {
    vehicleTypeId: vehicleTypeId?.toString?.() || null,
  });

  ride.fare = ride.fare || {};
  ride.fare.commissionRate = commissionRate;
  ride.fare.commissionAmount = commissionAmount;
  ride.fare.driverNetAmount = driverNetAmount;
  ride.fare.platformRevenue = platformRevenue;
  await ride.save();

  const currency = (ride.fare.currency || 'NGN').toUpperCase();
  await creditRideEarning(driverId, driverNetAmount, commissionAmount, ride._id, currency);
  logger.info(`Ride earning applied: driver ${driverId}, net ${driverNetAmount}, commission ${commissionAmount}`);
}

/**
 * Cash ride: driver collected the full fare (incl. commission) in cash. Compute
 * commission at the SAME rate as in-app rides, record it on the ride for
 * reporting, and add it to the driver's outstanding commission debt instead of
 * crediting the wallet. Idempotent via ride.fare.commissionAmount.
 */
export async function accrueCashCommissionDebt(ride) {
  const driverId = ride.driver?._id || ride.driver;
  if (!driverId) return;
  if (ride.fare?.commissionAmount != null) return;

  const grossFare = Number(ride.fare?.totalFare) || 0;
  if (grossFare <= 0) return;

  const vehicleTypeId = ride.vehicleType?._id || ride.vehicleType || null;
  const { commissionAmount, driverNetAmount, platformRevenue, commissionRate } = await computeCommission(grossFare, {
    vehicleTypeId: vehicleTypeId?.toString?.() || null,
  });

  ride.fare = ride.fare || {};
  ride.fare.commissionRate = commissionRate;
  ride.fare.commissionAmount = commissionAmount;
  ride.fare.driverNetAmount = driverNetAmount;
  ride.fare.platformRevenue = platformRevenue;
  await ride.save();

  const currency = (ride.fare.currency || 'NGN').toUpperCase();
  await accrueCommissionDebt(driverId, commissionAmount, ride._id, currency);
  logger.info(
    `Cash commission accrued as debt: driver ${driverId}, commission ${commissionAmount} (ride ${ride._id})`
  );
}

/**
 * Process payment for a completed ride
 */
export const processRidePayment = async (ride) => {
  try {
    if (!ride || ride.status !== 'completed') {
      throw new Error('Ride must be completed before processing payment');
    }

    if (ride.paymentStatus === 'completed' || ride.paymentStatus === 'cash_collected') {
      logger.info(`Payment already processed for ride ${ride._id}`);
      return { success: true, message: 'Payment already processed' };
    }

    const paymentMethod = ride.paymentMethod;
    const amount = ride.fare.totalFare;
    const rider = await User.findById(ride.rider);
    const driver = await Driver.findById(ride.driver);

    if (!rider) {
      throw new Error('Rider not found');
    }

    let payment = null;
    let transactionId = null;

    switch (paymentMethod) {
      case 'wallet': {
        const isEscrow = ride.paymentStatus === 'held' || ride.paymentStatus === 'charged';
        if (isEscrow) {
          const driverDoc = await Driver.findById(ride.driver).select('user').lean();
          const driverUserId = driverDoc?.user ?? null;
          await escrowSettleRide(ride._id, ride.rider, driverUserId, amount);
          ride.paymentStatus = 'completed';
          const driverNetAmount = ride.fare?.driverNetAmount ?? Math.round(amount * 0.92);
          const platformFee = ride.fare?.platformRevenue ?? amount - driverNetAmount;
          ride.fare = ride.fare || {};
          ride.fare.commissionAmount = platformFee;
          ride.fare.driverNetAmount = driverNetAmount;
          ride.fare.platformRevenue = platformFee;
          await ride.save();

          const driverId = ride.driver?._id || ride.driver;
          if (driverId) {
            await creditRideEarning(driverId, driverNetAmount, platformFee, ride._id, ride.fare.currency || 'NGN');
          }

          payment = await Payment.create({
            user: ride.rider,
            ride: ride._id,
            amount,
            currency: ride.fare.currency || 'NGN',
            method: 'wallet',
            status: 'completed',
            transactionId: `WLT-${Date.now()}-${ride._id}`,
            paidAt: new Date(),
          });
          transactionId = payment.transactionId;
          logger.info(`Escrow wallet payment settled for ride ${ride._id}: ${amount}`);
        } else {
          // Atomic: create payment record and debit rider balance in a transaction
          const session = await mongoose.startSession().catch(() => null);
          const useSession = session != null;
          if (useSession) session.startTransaction();
          const opts = useSession ? { session } : {};
          try {
            const txnId = `WLT-${Date.now()}-${ride._id}`;
            const created = await Payment.create(
              [
                {
                  user: ride.rider,
                  ride: ride._id,
                  amount,
                  currency: ride.fare.currency || 'NGN',
                  method: 'wallet',
                  status: 'completed',
                  transactionId: txnId,
                  paidAt: new Date(),
                },
              ],
              opts
            );
            payment = Array.isArray(created) ? created[0] : created;
            transactionId = payment.transactionId;

            const updated = await User.findOneAndUpdate(
              { _id: ride.rider, balance: { $gte: amount } },
              { $inc: { balance: -amount } },
              { new: true, ...opts }
            );
            if (!updated) {
              throw new Error('Insufficient wallet balance or concurrent update');
            }
            if (useSession) await session.commitTransaction();
            logger.info(`Wallet payment processed for ride ${ride._id}: ${amount}`);
          } catch (err) {
            if (useSession) await session.abortTransaction().catch(() => {});
            throw err;
          } finally {
            if (session) session.endSession().catch(() => {});
          }
        }
        break;
      }

      case 'card':
      case 'stripe':
        // For Stripe payments, check if payment intent exists
        if (!stripe) {
          throw new Error('Stripe is not configured');
        }

        // Check if payment intent was already created
        const existingPayment = await Payment.findOne({
          ride: ride._id,
          method: 'stripe',
        });

        if (existingPayment && existingPayment.status === 'completed') {
          payment = existingPayment;
          transactionId = existingPayment.transactionId;
          logger.info(`Stripe payment already processed for ride ${ride._id}`);
        } else {
          // Create payment intent if not exists
          const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100), // Convert to cents
            currency: (ride.fare.currency || 'ngn').toLowerCase(),
            metadata: {
              userId: ride.rider.toString(),
              rideId: ride._id.toString(),
            },
            description: `Ride payment for ride ${ride._id}`,
          });

          // Create payment record (status: processing)
          payment = await Payment.create({
            user: ride.rider,
            ride: ride._id,
            amount,
            currency: ride.fare.currency || 'NGN',
            method: 'stripe',
            status: 'processing',
            stripePaymentIntentId: paymentIntent.id,
          });

          // Note: Payment will be confirmed when client completes payment
          logger.info(`Stripe payment intent created for ride ${ride._id}: ${paymentIntent.id}`);
          return {
            success: true,
            requiresConfirmation: true,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            payment,
          };
        }
        break;

      case 'cash':
        payment = await Payment.create({
          user: ride.rider,
          ride: ride._id,
          amount,
          currency: ride.fare.currency || 'NGN',
          method: 'cash',
          status: 'completed',
          transactionId: `CASH-${Date.now()}-${ride._id}`,
          paidAt: new Date(),
        });

        transactionId = payment.transactionId;
        ride.paymentStatus = 'cash_collected';
        await ride.save();
        if (driver) {
          // Cash is collected directly by the driver, so it is NOT credited to
          // the in-app wallet. Instead the platform commission becomes driver
          // debt (settled immediately from available balance, or swept from
          // future wallet credits). Best-effort: the cash payment is already
          // recorded, so a debt-accrual failure must not fail the request —
          // the accrual is idempotent per ride and retried on reconciliation.
          try {
            await accrueCashCommissionDebt(ride);
          } catch (err) {
            logger.error(
              `Cash commission accrual failed for ride ${ride._id}: ${err.message}`
            );
          }
          driver.totalRides += 1;
          await driver.save();
        }
        logger.info(`Cash payment recorded for ride ${ride._id}: ${amount}`);
        return {
          success: true,
          payment,
          transactionId,
        };

      case 'bank_transfer':
        // For bank transfer, create pending payment
        payment = await Payment.create({
          user: ride.rider,
          ride: ride._id,
          amount,
          currency: ride.fare.currency || 'NGN',
          method: 'bank_transfer',
          status: 'pending',
          transactionId: `BANK-${Date.now()}-${ride._id}`,
        });

        logger.info(`Bank transfer payment created (pending) for ride ${ride._id}: ${amount}`);
        return {
          success: true,
          requiresConfirmation: true,
          payment,
        };

      default:
        throw new Error(`Unsupported payment method: ${paymentMethod}`);
    }

    if (payment && payment.status === 'completed') {
      ride.paymentStatus = 'completed';
      await ride.save();
      if (driver) {
        await applyRideEarningToWallet(ride);
        driver.totalRides += 1;
        await driver.save();
      }
    }

    return {
      success: true,
      payment,
      transactionId,
    };
  } catch (error) {
    logger.error(`Failed to process payment for ride ${ride._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Confirm Stripe payment
 */
export const confirmStripePayment = async (paymentIntentId) => {
  try {
    if (!stripe) {
      throw new Error('Stripe is not configured');
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new Error(`Payment not completed. Status: ${paymentIntent.status}`);
    }

    // Find payment record
    const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId });
    if (!payment) {
      throw new Error('Payment record not found');
    }

    if (payment.status === 'completed') {
      return { success: true, message: 'Payment already confirmed', payment };
    }

    // Update payment status
    payment.status = 'completed';
    payment.stripeChargeId = paymentIntent.latest_charge || null;
    payment.transactionId = paymentIntent.id;
    payment.paidAt = new Date();
    await payment.save();

    if (payment.ride) {
      const ride = await Ride.findById(payment.ride).populate('driver');
      if (ride) {
        ride.paymentStatus = 'completed';
        await ride.save();
        if (ride.driver) {
          await applyRideEarningToWallet(ride);
          const driver = await Driver.findById(ride.driver);
          if (driver) {
            driver.totalRides += 1;
            await driver.save();
          }
        }
      }
    }

    logger.info(`Stripe payment confirmed: ${paymentIntentId}`);
    return { success: true, payment };
  } catch (error) {
    logger.error(`Failed to confirm Stripe payment ${paymentIntentId}: ${error.message}`);
    throw error;
  }
};

/**
 * Generate and send payment receipt
 */
export const sendPaymentReceipt = async (ride, payment) => {
  // Emit payment receipt via Pusher
  try {
    const { getPusherService } = await import('./pusherService.js');
    const pusherService = getPusherService();
    pusherService.emitPaymentReceipt(ride, payment);
  } catch (error) {
    logger.warn(`Failed to emit payment receipt via Pusher: ${error.message}`);
  }
  try {
    const rider = await User.findById(ride.rider).populate('profile');
    const driver = await Driver.findById(ride.driver).populate('user');

    if (!rider) {
      throw new Error('Rider not found');
    }

    // Generate receipt content
    const receiptData = {
      rideId: ride._id.toString(),
      transactionId: payment?.transactionId || 'N/A',
      date: ride.completedAt || new Date(),
      rider: {
        name: rider.name || 'Rider',
        email: rider.email,
        phone: rider.phone,
      },
      driver: driver ? {
        name: driver.user?.name || 'Driver',
        phone: driver.user?.phone,
        vehicle: `${driver.vehicleDetails?.make} ${driver.vehicleDetails?.model}`,
        plateNumber: driver.vehicleDetails?.plateNumber,
      } : null,
      pickup: ride.pickupLocation.address,
      dropoff: ride.dropoffLocation.address,
      fare: {
        baseFare: ride.fare.baseFare || 0,
        distanceFare: ride.fare.distanceFare || 0,
        timeFare: ride.fare.timeFare || 0,
        surgeMultiplier: ride.fare.surgeMultiplier || 1,
        discountAmount: ride.discountAmount || 0,
        totalFare: ride.fare.totalFare,
        currency: ride.fare.currency || 'NGN',
      },
      paymentMethod: ride.paymentMethod,
      distance: ride.distance?.value || 0,
      duration: ride.duration?.actual || ride.duration?.estimated || 0,
    };

    // Send email receipt if email is available
    if (rider.email) {
      const { sendEmail } = await import('./notificationService.js');
      const emailSubject = `Receipt for Ride ${receiptData.rideId.slice(-6)}`;
      const emailHtml = generateReceiptEmail(receiptData);

      await sendEmail(rider.email, emailSubject, emailHtml);
      logger.info(`Receipt email sent to ${rider.email} for ride ${ride._id}`);
    }

    // Store receipt in payment metadata
    if (payment) {
      payment.metadata = payment.metadata || new Map();
      payment.metadata.set('receipt', JSON.stringify(receiptData));
      await payment.save();
    }

    return receiptData;
  } catch (error) {
    logger.error(`Failed to send receipt for ride ${ride._id}: ${error.message}`);
    // Don't throw - receipt sending failure shouldn't block payment processing
    return null;
  }
};

/**
 * Generate receipt email HTML
 */
const generateReceiptEmail = (receiptData) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background-color: #f9f9f9; }
        .receipt-details { background-color: white; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .total { font-size: 18px; font-weight: bold; color: #4CAF50; margin-top: 10px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Ride Receipt</h1>
        </div>
        <div class="content">
          <div class="receipt-details">
            <h3>Ride Details</h3>
            <div class="row">
              <span>Ride ID:</span>
              <span>${receiptData.rideId.slice(-6)}</span>
            </div>
            <div class="row">
              <span>Date:</span>
              <span>${new Date(receiptData.date).toLocaleString()}</span>
            </div>
            <div class="row">
              <span>Pickup:</span>
              <span>${receiptData.pickup}</span>
            </div>
            <div class="row">
              <span>Dropoff:</span>
              <span>${receiptData.dropoff}</span>
            </div>
            <div class="row">
              <span>Distance:</span>
              <span>${receiptData.distance.toFixed(2)} km</span>
            </div>
            <div class="row">
              <span>Duration:</span>
              <span>${receiptData.duration} minutes</span>
            </div>
          </div>
          
          <div class="receipt-details">
            <h3>Fare Breakdown</h3>
            <div class="row">
              <span>Base Fare:</span>
              <span>${receiptData.fare.currency} ${receiptData.fare.baseFare.toFixed(2)}</span>
            </div>
            <div class="row">
              <span>Distance Fare:</span>
              <span>${receiptData.fare.currency} ${receiptData.fare.distanceFare.toFixed(2)}</span>
            </div>
            <div class="row">
              <span>Time Fare:</span>
              <span>${receiptData.fare.currency} ${receiptData.fare.timeFare.toFixed(2)}</span>
            </div>
            ${receiptData.fare.surgeMultiplier > 1 ? `
            <div class="row">
              <span>Surge Multiplier:</span>
              <span>${receiptData.fare.surgeMultiplier}x</span>
            </div>
            ` : ''}
            ${receiptData.fare.discountAmount > 0 ? `
            <div class="row">
              <span>Discount:</span>
              <span>-${receiptData.fare.currency} ${receiptData.fare.discountAmount.toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="row total">
              <span>Total:</span>
              <span>${receiptData.fare.currency} ${receiptData.fare.totalFare.toFixed(2)}</span>
            </div>
          </div>
          
          <div class="receipt-details">
            <h3>Payment Information</h3>
            <div class="row">
              <span>Payment Method:</span>
              <span>${receiptData.paymentMethod.toUpperCase()}</span>
            </div>
            <div class="row">
              <span>Transaction ID:</span>
              <span>${receiptData.transactionId}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          <p>Thank you for using our service!</p>
          <p>This is an automated receipt. Please keep it for your records.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export default {
  processRidePayment,
  confirmStripePayment,
  sendPaymentReceipt,
};
