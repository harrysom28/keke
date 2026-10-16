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
import PaystackWebhookEvent from '../models/PaystackWebhookEvent.js';

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
 * Handle charge.success: wallet_topup (checkout) or DVA (bank_transfer / dedicated_nuban). Idempotent.
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
  const channel = (data.channel || data.authorization?.channel || '').toLowerCase();
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

  // DVA inbound: Paystack sends authorization.channel "dedicated_nuban" (Titan/Wema DVA);
  // older flows may use "bank_transfer". See Paystack DVA docs (charge.success sample).
  const isDvaInbound = channel === 'bank_transfer' || channel === 'dedicated_nuban';
  if (isDvaInbound) {
    let user = null;
    if (userId) {
      user = await User.findById(userId).select('balance');
    }
    if (!user && customerCode) {
      user = await User.findOne({ paystackCustomerCode: customerCode }).select('balance');
    }
    if (!user) {
      paystackLog('warn', 'Paystack DVA: no user for charge', { reference, customerCode, userId, channel });
      return 'unmatched';
    }
    userId = user._id.toString();
    await creditWalletFromPaystack(reference, amountNaira, userId, {
      channel: channel === 'dedicated_nuban' ? 'dedicated_nuban' : 'bank_transfer',
      ip,
    });
    return;
  }

  // Some banks / Paystack versions omit or vary `channel`; DVA inbound still ties to Paystack customer.
  if (
    customerCode &&
    metadata.type !== 'wallet_topup' &&
    Number(amountNaira) > 0
  ) {
    const existing = await WalletFundingTransaction.findOne({ reference }).lean();
    if (existing) return;
    const userByCustomer = await User.findOne({ paystackCustomerCode: customerCode }).select(
      'balance'
    );
    if (userByCustomer) {
      paystackLog('info', 'Paystack inbound credit via customer_code fallback', {
        reference,
        channel,
        customerCode,
      });
      await creditWalletFromPaystack(reference, amountNaira, userByCustomer._id.toString(), {
        channel: 'bank_transfer',
        ip,
      });
      return;
    }
    paystackLog('warn', 'Paystack inbound credit unmatched', { reference, channel, customerCode });
    return 'unmatched';
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

  const eventType = event.event || 'unknown';
  const reference = String(event.data?.reference || event.data?.id || `${eventType}-${Date.now()}`);
  let saved;
  try {
    saved = await PaystackWebhookEvent.create({
      reference,
      eventType,
      rawPayload: event,
      status: 'received',
      receivedAt: new Date(),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await PaystackWebhookEvent.findOne({ reference, eventType });
      if (existing && !['processed', 'unmatched'].includes(existing.status)) {
        existing.status = 'received';
        existing.error = null;
        await existing.save();
        res.status(200).json({ received: true });
        setImmediate(() => { processSavedPaystackEvent(existing._id, ip).catch(() => {}); });
        return;
      }
      return res.status(200).json({ received: true, duplicate: true });
    }
    paystackLog('error', 'Paystack webhook could not be stored', { reference, error: err.message });
    return res.status(500).json({ status: false, message: 'Could not persist event' });
  }

  // Acknowledge only after the event is stored. Processing stays async.
  res.status(200).json({ received: true });
  setImmediate(() => { processSavedPaystackEvent(saved._id, ip).catch(() => {}); });
}

export async function processSavedPaystackEvent(eventId, ip = '') {
  const saved = await PaystackWebhookEvent.findById(eventId);
  if (!saved || saved.status === 'processed') return saved;
  const event = saved.rawPayload || {};
  const eventType = saved.eventType || event.event || '';
  try {
    let outcome = 'processed';
    if (eventType === 'charge.success') {
      outcome = (await handleChargeSuccess(event, ip)) || 'processed';
    } else if (eventType === 'dedicatedaccount.assign') {
      await handleDedicatedAccountAssign(event);
    } else if (eventType === 'transfer.success') {
      await handleTransferSuccess(event);
    }
    saved.status = outcome === 'unmatched' ? 'unmatched' : 'processed';
    saved.error = null;
    saved.processedAt = new Date();
    await saved.save();
    return saved;
  } catch (err) {
    saved.status = 'failed';
    saved.error = err.message;
    await saved.save();
    paystackLog('error', 'Paystack webhook async processing failed', {
      event: eventType,
      reference: saved.reference,
      error: err.message,
    });
    return saved;
  }
}

export async function reprocessStuckPaystackEvents() {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000);
  const stuck = await PaystackWebhookEvent.find({
    status: { $in: ['received', 'failed'] },
    receivedAt: { $lte: cutoff },
  }).select('_id').limit(50).lean();
  for (const row of stuck) {
    await processSavedPaystackEvent(row._id, 'cron');
  }
  return stuck.length;
}

export async function listPaystackWebhookEvents(req, res) {
  const status = req.query.status || 'unmatched';
  const events = await PaystackWebhookEvent.find({ status })
    .sort({ receivedAt: -1 })
    .limit(100)
    .select('reference eventType status error receivedAt processedAt')
    .lean();
  res.json({
    status: 'success',
    data: {
      events: events.map((row) => ({
        event_id: row._id.toString(),
        reference: row.reference,
        event_type: row.eventType,
        status: row.status,
        error: row.error,
        received_at: row.receivedAt,
        processed_at: row.processedAt,
      })),
    },
  });
}

export async function reconcilePaystackSuccesses(req, res) {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  if (!secret) {
    return res.status(500).json({ status: 'error', message: 'Paystack is not configured' });
  }
  const axios = (await import('axios')).default;
  const from = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await axios.get('https://api.paystack.co/transaction', {
    params: { status: 'success', from, perPage: 50 },
    headers: { Authorization: `Bearer ${secret}` },
    timeout: 20000,
  });
  const rows = Array.isArray(data?.data) ? data.data : [];
  let recovered = 0;
  let unmatched = 0;
  for (const tx of rows) {
    if (!tx?.reference) continue;
    const existing = await WalletFundingTransaction.findOne({ reference: tx.reference }).lean();
    if (existing) continue;
    const outcome = await handleChargeSuccess({ event: 'charge.success', data: tx }, 'reconcile');
    const status = outcome === 'unmatched' ? 'unmatched' : 'processed';
    if (status === 'processed') recovered += 1;
    else unmatched += 1;
    await PaystackWebhookEvent.findOneAndUpdate(
      { reference: tx.reference, eventType: 'charge.success' },
      {
        $set: {
          rawPayload: { event: 'charge.success', data: tx },
          status,
          error: status === 'processed' ? 'recovered via reconciliation' : 'no matching user',
          processedAt: new Date(),
        },
        $setOnInsert: { reference: tx.reference, eventType: 'charge.success', receivedAt: new Date() },
      },
      { upsert: true }
    );
  }
  res.json({ status: 'success', data: { checked: rows.length, recovered, unmatched } });
}
