/**
 * Wallet funding service: idempotent credit from Paystack (checkout or DVA).
 * Uses MongoDB transaction when available; falls back to atomic findOneAndUpdate + checks.
 */
import mongoose from 'mongoose';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import UserWallet from '../models/UserWallet.js';
import UserWalletTransaction from '../models/UserWalletTransaction.js';
import WalletFundingTransaction from '../models/WalletFundingTransaction.js';
import logger from '../utils/logger.js';

/**
 * Credit user wallet from Paystack (charge.success).
 * Idempotent: if a WalletFundingTransaction with this reference exists, abort.
 * Updates User.balance, creates WalletFundingTransaction, marks Payment completed.
 * @param {string} reference - Paystack transaction reference
 * @param {number} amountNaira - Amount in NGN (not kobo)
 * @param {string} userId - User ID (string or ObjectId)
 * @param {Object} [options] - { paymentId, channel, ip }
 * @returns {Promise<{ credited: boolean, balanceAfter?: number }>}
 */
export async function creditWalletFromPaystack(reference, amountNaira, userId, options = {}) {
  const { paymentId, channel = 'card', ip } = options;
  const uid = mongoose.Types.ObjectId.isValid(userId) ? userId : new mongoose.Types.ObjectId(userId);

  // Idempotency: if ledger entry exists, do not credit again
  const existingLedger = await WalletFundingTransaction.findOne({ reference }).lean();
  if (existingLedger) {
    logger.info('WalletFunding: reference already processed (idempotent skip)', {
      reference,
      userId: uid.toString(),
      amount: amountNaira,
    });
    const user = await User.findById(uid).select('balance').lean();
    return { credited: false, balanceAfter: user?.balance };
  }

  const session = await mongoose.startSession().catch(() => null);
  const useSession = session != null;

  try {
    if (useSession) session.startTransaction();

    const opts = useSession ? { session } : {};

    // Lock: find user and get current balance
    const user = await User.findById(uid).session(session || undefined).select('balance role');
    if (!user) {
      throw new Error('User not found');
    }

    const balanceBefore = Number(user.balance) || 0;

    // Rider escrow wallet is ledger truth: increment escrow first, then mirror User.balance to match.
    const riderWallet = await UserWallet.findOne({ userId: uid, userType: 'rider' }).session(session || undefined);
    let ledgerBalanceAfter = balanceBefore + Number(amountNaira);
    if (riderWallet) {
      const availBefore = Number(riderWallet.availableBalance) || 0;
      const updatedWallet = await UserWallet.findOneAndUpdate(
        { userId: uid, userType: 'rider' },
        { $inc: { availableBalance: Number(amountNaira) } },
        { new: true, ...opts }
      );
      if (!updatedWallet) {
        throw new Error('Escrow wallet top-up update failed');
      }
      const availAfter = Number(updatedWallet.availableBalance) || 0;
      ledgerBalanceAfter = availAfter;
      await User.findByIdAndUpdate(uid, { $set: { balance: availAfter } }, opts);

      await UserWalletTransaction.create(
        [
          {
            userId: uid,
            type: 'topup',
            amount: Number(amountNaira),
            balanceBefore: availBefore,
            balanceAfter: availAfter,
            description: 'Wallet top-up',
            providerRef: reference,
            providerStatus: 'success',
            status: 'completed',
          },
        ],
        opts
      );
    } else {
      user.balance = ledgerBalanceAfter;
      await user.save(opts);
    }

    await WalletFundingTransaction.create(
      [
        {
          reference,
          user: uid,
          type: 'wallet_topup',
          amount: amountNaira,
          currency: 'NGN',
          balanceBefore,
          balanceAfter: ledgerBalanceAfter,
          metadata: { channel, paymentId: paymentId?.toString(), ip },
        },
      ],
      opts
    );

    // Mark Payment completed if we have a Payment record (initialized checkout)
    if (paymentId) {
      const payment = await Payment.findById(paymentId).session(session || undefined);
      if (payment && payment.status !== 'completed') {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.transactionId = reference;
        payment.method = channel === 'bank_transfer' ? 'bank_transfer' : 'card';
        await payment.save(opts);
      }
    } else {
      const payByRef = await Payment.findOne({ reference }).session(session || undefined);
      if (payByRef && payByRef.status !== 'completed') {
        payByRef.status = 'completed';
        payByRef.paidAt = new Date();
        payByRef.transactionId = reference;
        payByRef.method = channel === 'bank_transfer' ? 'bank_transfer' : 'card';
        await payByRef.save(opts);
      }
    }

    if (useSession) await session.commitTransaction();

    logger.info('WalletFunding: credited wallet', {
      reference,
      userId: uid.toString(),
      amountNaira,
      balanceBefore,
      balanceAfter: ledgerBalanceAfter,
      channel,
    });

    try {
      const { sendToUser } = await import('./notificationService.js');
      await sendToUser(uid, user?.role === 'driver' ? 'driver' : 'rider', {
        title: 'Wallet credited',
        message: `Top-up: ₦${Number(amountNaira).toLocaleString()} added. New available balance: ₦${Number(ledgerBalanceAfter).toLocaleString()}.`,
        type: 'alert',
        priority: 'high',
        screen: 'wallet',
        event_key: 'wallet_funded',
        data: {
          subType: 'wallet_funded',
          amount: String(amountNaira),
          balance: String(ledgerBalanceAfter),
        },
      });
    } catch (notificationError) {
      logger.error('WalletFunding: wallet credit notification failed', {
        reference,
        userId: uid.toString(),
        error: notificationError.message,
      });
    }

    return { credited: true, balanceAfter: ledgerBalanceAfter };
  } catch (err) {
    if (useSession) await session.abortTransaction().catch(() => {});

    if (err.code === 11000) {
      logger.info('WalletFunding: duplicate reference (idempotent)', { reference });
      const user = await User.findById(uid).select('balance').lean();
      return { credited: false, balanceAfter: user?.balance };
    }

    logger.error('WalletFunding: credit failed', {
      reference,
      userId: uid.toString(),
      error: err.message,
    });
    throw err;
  } finally {
    if (session) session.endSession().catch(() => {});
  }
}
