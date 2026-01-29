import Payment from '../models/Payment.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import logger from '../utils/logger.js';
import Stripe from 'stripe';

// Initialize Stripe (if API key is provided)
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

/**
 * Process refund for a cancelled ride
 */
export const processRideRefund = async (ride, cancellationFee = 0) => {
  try {
    if (!ride) {
      throw new Error('Ride not found');
    }

    // Find payment record for this ride
    const payment = await Payment.findOne({ ride: ride._id });
    if (!payment) {
      logger.info(`No payment record found for ride ${ride._id} - no refund needed`);
      return { success: true, message: 'No payment to refund' };
    }

    // If payment wasn't completed, no refund needed
    if (payment.status !== 'completed') {
      logger.info(`Payment not completed for ride ${ride._id} - no refund needed`);
      return { success: true, message: 'Payment not completed - no refund needed' };
    }

    // Calculate refund amount (total payment minus cancellation fee)
    const refundAmount = Math.max(0, payment.amount - cancellationFee);

    if (refundAmount <= 0) {
      logger.info(`Refund amount is 0 for ride ${ride._id} (cancellation fee: ${cancellationFee})`);
      return { success: true, message: 'No refund due to cancellation fee', refundAmount: 0 };
    }

    let refundResult = null;

    switch (payment.method) {
      case 'wallet':
        // Refund to wallet
        const user = await User.findById(ride.rider);
        if (user) {
          user.balance += refundAmount;
          await user.save();
          logger.info(`Refunded ${refundAmount} to wallet for user ${user._id}`);
        }

        // Update payment record
        await payment.processRefund(refundAmount, 'Ride cancellation refund', `WLT-REFUND-${Date.now()}`);
        refundResult = {
          success: true,
          refundAmount,
          method: 'wallet',
          transactionId: payment.refundId,
        };
        break;

      case 'card':
      case 'stripe':
        // Process Stripe refund
        if (!stripe) {
          throw new Error('Stripe is not configured');
        }

        if (!payment.stripeChargeId && !payment.stripePaymentIntentId) {
          throw new Error('Stripe charge ID not found');
        }

        try {
          // Use charge ID if available, otherwise use payment intent
          const chargeId = payment.stripeChargeId || payment.stripePaymentIntentId;

          // Create refund
          const refund = await stripe.refunds.create({
            charge: chargeId,
            amount: Math.round(refundAmount * 100), // Convert to cents
            reason: 'requested_by_customer',
            metadata: {
              rideId: ride._id.toString(),
              reason: 'Ride cancellation',
            },
          });

          // Update payment record
          await payment.processRefund(refundAmount, 'Ride cancellation refund', refund.id);

          refundResult = {
            success: true,
            refundAmount,
            method: 'stripe',
            refundId: refund.id,
            transactionId: refund.id,
            status: refund.status,
          };

          logger.info(`Stripe refund processed for ride ${ride._id}: ${refund.id} (${refundAmount})`);
        } catch (stripeError) {
          logger.error(`Stripe refund failed: ${stripeError.message}`);
          throw new Error(`Stripe refund failed: ${stripeError.message}`);
        }
        break;

      case 'cash':
        // Cash payments - no refund possible
        logger.info(`Cash payment for ride ${ride._id} - refund not applicable`);
        refundResult = {
          success: true,
          refundAmount: 0,
          method: 'cash',
          message: 'Cash payment - refund not applicable',
        };
        break;

      case 'bank_transfer':
        // Bank transfer - mark for manual processing
        await payment.processRefund(refundAmount, 'Ride cancellation - manual refund required', `BANK-REFUND-${Date.now()}`);
        refundResult = {
          success: true,
          refundAmount,
          method: 'bank_transfer',
          requiresManualProcessing: true,
          message: 'Refund requires manual processing',
        };
        logger.info(`Bank transfer refund marked for manual processing for ride ${ride._id}`);
        break;

      default:
        throw new Error(`Unsupported payment method for refund: ${payment.method}`);
    }

    // Update ride refund amount
    ride.refundAmount = refundAmount;
    await ride.save();

    return refundResult;
  } catch (error) {
    logger.error(`Failed to process refund for ride ${ride._id}: ${error.message}`);
    throw error;
  }
};

/**
 * Process partial refund (e.g., for ride changes)
 */
export const processPartialRefund = async (ride, refundAmount, reason = 'Ride modification') => {
  try {
    const payment = await Payment.findOne({ ride: ride._id });
    if (!payment || payment.status !== 'completed') {
      throw new Error('Payment not found or not completed');
    }

    if (refundAmount > payment.amount) {
      throw new Error('Refund amount cannot exceed payment amount');
    }

    // Similar logic to processRideRefund but with specified amount
    return await processRideRefund(ride, payment.amount - refundAmount);
  } catch (error) {
    logger.error(`Failed to process partial refund: ${error.message}`);
    throw error;
  }
};

export default {
  processRideRefund,
  processPartialRefund,
};
