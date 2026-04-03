/**
 * Paystack webhook: signature verification, idempotent wallet credit, DVA assignment.
 * POST /api/payment/paystack/webhook or POST /api/paystack/webhook
 * Must use raw body for x-paystack-signature verification (mounted before express.json).
 */
import crypto from 'crypto';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import WalletFundingTransaction from '../models/WalletFundingTransaction.js';
import logger from '../utils/logger.js';
import { creditWalletFromPaystack } from '../services/walletFundingService.js';

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_WEBHOOK_SECRET || '';

function verifyPaystackSignature(payload, signature) {
  if (!PAYSTACK_SECRET || !signature) return false;
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(payload).digest('hex');
  return hash === signature;
}

function paystackLog(level, message, meta = {}) {
  const logMeta = {
    ...meta,
    service: 'paystack_webhook',
  };
  logger[level](message, logMeta);
}

/**
 * Handle charge.success: wallet_topup (checkout or DVA). Idempotent; verifies amount.
 */
async function handleChargeSuccess(event, ip) {
  const data = event.data;
  if (!data?.reference || !data?.amount) {
    paystackLog('warn', 'charge.success missing reference or amount', { event: event.event });
    return;
  }

  const reference = data.reference;
  const amountKobo = Number(data.amount);
  const amountNaira = amountKobo / 100;
  const metadata = data.metadata || {};
  const channel = (data.authorization?.channel || '').toLowerCase();
  const customerCode = data.customer?.customer_code;

  paystackLog('info', 'Paystack charge.success', {
    reference,
    amountNaira,
    amountKobo,
    channel,
    userId: metadata.userId,
    customerCode,
    ip,
  });

  // Idempotency: already processed
  const existingLedger = await WalletFundingTransaction.findOne({ reference }).lean();
  if (existingLedger) {
    paystackLog('info', 'Paystack reference already processed (idempotent)', { reference });
    return;
  }

  let userId = metadata.userId;

  // Checkout (card): metadata.type === wallet_topup
  if (metadata.type === 'wallet_topup' && userId) {
    const payment = await Payment.findOne({ reference }).lean();
    if (payment && payment.status === 'completed') {
      paystackLog('info', 'Paystack payment already completed', { reference });
      return;
    }
    const expectedKobo = payment?.amount != null ? Math.round(Number(payment.amount) * 100) : null;
    if (expectedKobo != null && amountKobo !== expectedKobo) {
      paystackLog('warn', 'Paystack amount mismatch - possible fraud', {
        reference,
        expectedKobo,
        receivedKobo: amountKobo,
        userId,
        ip,
      });
      return;
    }
    const user = await User.findById(userId).select('balance');
    if (!user) {
      paystackLog('warn', 'Paystack wallet_topup user not found', { userId, reference });
      return;
    }
    await creditWalletFromPaystack(reference, amountNaira, userId, {
      paymentId: payment?._id?.toString(),
      channel: 'card',
      ip,
    });
    return;
  }

  // DVA (bank_transfer): match by customer_code or metadata.userId
  if (channel === 'bank_transfer') {
    let user = null;
    if (userId) {
      user = await User.findById(userId).select('balance');
    }
    if (!user && customerCode) {
      user = await User.findOne({ paystackCustomerCode: customerCode }).select('balance');
    }
    if (!user) {
      paystackLog('warn', 'Paystack DVA: no user for charge', { reference, customerCode, userId });
      return;
    }
    userId = user._id.toString();
    await creditWalletFromPaystack(reference, amountNaira, userId, {
      channel: 'bank_transfer',
      ip,
    });
  }
}

/**
 * Handle dedicatedaccount.assign: persist DVA details on user.
 */
async function handleDedicatedAccountAssign(event) {
  const data = event.data;
  if (!data?.customer?.id || !data?.dedicated_account) return;

  const customerId = data.customer.id;
  const customerCode = data.customer.customer_code;
  const accountNumber = data.dedicated_account.account_number;
  const bankName = data.dedicated_account.bank?.name || '';
  const accountName = data.dedicated_account.account_name || '';

  const metadata = data.metadata || {};
  const userId = metadata.userId;

  let user = null;
  if (userId) user = await User.findById(userId);
  if (!user && customerCode) user = await User.findOne({ paystackCustomerCode: customerCode });
  if (!user) {
    paystackLog('warn', 'DVA assign: user not found', { customerCode, customerId });
    return;
  }

  user.dvaAccountNumber = accountNumber;
  user.dvaBankName = bankName;
  user.dvaAccountName = accountName;
  if (!user.paystackCustomerCode) user.paystackCustomerCode = customerCode;
  await user.save();

  paystackLog('info', 'DVA assigned to user', {
    userId: user._id.toString(),
    accountNumber,
    bankName,
  });
}

/**
 * Handle transfer.success (e.g. payouts) - acknowledge only unless needed for ledger.
 */
async function handleTransferSuccess(event) {
  paystackLog('info', 'Paystack transfer.success received', {
    reference: event.data?.reference,
    amount: event.data?.amount,
  });
}

export async function handlePaystackWebhook(req, res) {
  const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || ''));
  const signature = req.headers['x-paystack-signature'] || '';
  const ip = req.ip || req.connection?.remoteAddress || '';

  if (!verifyPaystackSignature(rawBody, signature)) {
    paystackLog('warn', 'Paystack webhook invalid signature', { ip });
    return res.status(401).json({ status: false, message: 'Invalid signature' });
  }

  let event;
  try {
    event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    return res.status(400).json({ status: false, message: 'Invalid JSON' });
  }

  // Acknowledge immediately — Paystack retries if response takes too long.
  // Process asynchronously after responding so we don't hit timeouts.
  res.status(200).json({ received: true });

  const eventType = event.event || '';
  setImmediate(() => {
    (async () => {
      try {
        if (eventType === 'charge.success') {
          await handleChargeSuccess(event, ip);
        } else if (eventType === 'dedicatedaccount.assign') {
          await handleDedicatedAccountAssign(event);
        } else if (eventType === 'transfer.success') {
          await handleTransferSuccess(event);
        }
      } catch (err) {
        paystackLog('error', 'Paystack webhook async processing failed', {
          event: eventType,
          reference: event.data?.reference,
          error: err.message,
          stack: err.stack,
        });
      }
    })();
  });
}
