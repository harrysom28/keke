/**
 * Paystack -> wallet reconciliation. The safety net behind the webhook.
 *
 * Lists successful Paystack payments, finds any that never reached the WalletFundingTransaction ledger, and credits
 * them through creditWalletFromPaystack (idempotent by reference, so racing the webhook or another run is safe).
 * A payment that cannot be tied to exactly one live rider is recorded in PaystackUnmatchedPayment for an admin.
 *
 * Covered: DVA bank transfers (dedicated_nuban / bank_transfer) and card wallet top-ups (metadata.type = wallet_topup).
 * Ride card payments and everything else are left alone.
 */
import axios from 'axios';
import User from '../models/User.js';
import WalletFundingTransaction from '../models/WalletFundingTransaction.js';
import PaystackUnmatchedPayment from '../models/PaystackUnmatchedPayment.js';
import logger from '../utils/logger.js';
import { creditWalletFromPaystack } from './walletFundingService.js';

const PAYSTACK_BASE = 'https://api.paystack.co';
const DVA_CHANNELS = ['dedicated_nuban', 'bank_transfer'];

async function fetchSuccessfulTransactions({ from, perPage = 100, maxPages = 60 }) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await axios.get(`${PAYSTACK_BASE}/transaction`, {
      headers: { Authorization: `Bearer ${secret}` },
      params: { status: 'success', perPage, page, from },
      timeout: 25000,
    });
    const rows = data?.data || [];
    out.push(...rows);
    if (rows.length < perPage) break;
  }
  return out;
}

function classify(t) {
  const channel = String(t.channel || t.authorization?.channel || '').toLowerCase();
  const metadata = t.metadata && typeof t.metadata === 'object' ? t.metadata : {};
  if (DVA_CHANNELS.includes(channel)) return { kind: 'dva', channel, metadata };
  if (metadata.type === 'wallet_topup' && metadata.userId) return { kind: 'card_topup', channel: 'card', metadata };
  return null;
}

async function resolveRider(t, kind, metadata) {
  const customerCode = t.customer?.customer_code || null;
  const accountNumber = t.authorization?.receiver_bank_account_number || null;

  if (kind === 'card_topup') {
    const u = await User.findById(metadata.userId).select('_id').lean();
    return u ? { users: [u], customerCode, accountNumber } : { users: [], customerCode, accountNumber };
  }
  let users = customerCode ? await User.find({ paystackCustomerCode: customerCode }).select('_id').lean() : [];
  if (users.length === 0 && accountNumber) {
    users = await User.find({ $or: [{ dvaAccountNumber: accountNumber }, { topupAccountNumber: accountNumber }] })
      .select('_id')
      .lean();
  }
  return { users, customerCode, accountNumber };
}

async function recordUnmatched(t, ctx, reason, candidateIds, lastError = null) {
  // An admin marked this one 'ignored': leave it alone instead of reopening it on every run.
  if (await PaystackUnmatchedPayment.exists({ reference: t.reference, status: 'ignored' })) return;
  await PaystackUnmatchedPayment.findOneAndUpdate(
    { reference: t.reference },
    {
      $set: {
        amountNaira: t.amount / 100,
        channel: ctx.channel,
        customerCode: ctx.customerCode,
        customerName: [t.customer?.first_name, t.customer?.last_name].filter(Boolean).join(' ') || null,
        accountNumber: ctx.accountNumber,
        paidAt: t.paid_at ? new Date(t.paid_at) : null,
        reason,
        candidateUserIds: candidateIds,
        lastError,
        lastSeenAt: new Date(),
        status: 'open',
      },
      $setOnInsert: { firstSeenAt: new Date() },
      $inc: { attempts: 1 },
    },
    { upsert: true }
  );
}

/**
 * @param {{ days?: number, apply?: boolean, graceMinutes?: number }} [o]
 *   apply=false is a dry run: nothing is credited or written.
 *   graceMinutes: payments newer than this are left for the webhook to handle first.
 */
export async function reconcilePaystackFunding({ days = 2, apply = true, graceMinutes = 3 } = {}) {
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const graceCutoff = Date.now() - graceMinutes * 60000;
  const txs = await fetchSuccessfulTransactions({ from });

  const summary = { scanned: txs.length, relevant: 0, alreadyCredited: 0, credited: 0, wouldCredit: [], unmatched: 0, failed: 0, tooRecent: 0, invalidAmount: 0 };

  const relevant = [];
  for (const t of txs) {
    const c = classify(t);
    if (!c || !t.reference) continue;
    if (!(t.amount >= 100)) {
      // Paystack reports kobo; anything under 1 naira cannot be a real top-up.
      summary.invalidAmount++;
      if (apply && Number.isFinite(Number(t.amount))) {
        await recordUnmatched(t, { channel: c.channel, customerCode: t.customer?.customer_code || null, accountNumber: t.authorization?.receiver_bank_account_number || null }, 'invalid_amount', []);
      }
      continue;
    }
    relevant.push({ t, ...c });
  }
  summary.relevant = relevant.length;

  const credited = new Set(
    (await WalletFundingTransaction.find({ reference: { $in: relevant.map((r) => r.t.reference) } }).select('reference').lean()).map(
      (r) => r.reference
    )
  );

  for (const { t, kind, channel, metadata } of relevant) {
    if (credited.has(t.reference)) {
      summary.alreadyCredited++;
      if (apply) {
        await PaystackUnmatchedPayment.updateOne({ reference: t.reference, status: 'open' }, { $set: { status: 'resolved', resolvedAt: new Date() } });
      }
      continue;
    }
    if (t.paid_at && new Date(t.paid_at).getTime() > graceCutoff) {
      summary.tooRecent++;
      continue;
    }

    const { users, customerCode, accountNumber } = await resolveRider(t, kind, metadata);
    const ctx = { channel, customerCode, accountNumber };

    if (users.length !== 1) {
      summary.unmatched++;
      logger.warn('Paystack reconcile: payment not credited, needs review', {
        reference: t.reference,
        amountNaira: t.amount / 100,
        customerCode,
        matches: users.length,
      });
      if (apply) await recordUnmatched(t, ctx, users.length === 0 ? 'no_user' : 'ambiguous_user', users.map((u) => u._id));
      continue;
    }

    const userId = users[0]._id.toString();
    if (!apply) {
      summary.wouldCredit.push({ reference: t.reference, amountNaira: t.amount / 100, userId });
      continue;
    }
    try {
      const r = await creditWalletFromPaystack(t.reference, t.amount / 100, userId, {
        channel: kind === 'card_topup' ? 'card' : channel,
        ip: 'paystack-reconcile',
      });
      if (r.credited) {
        summary.credited++;
        logger.info('Paystack reconcile: credited missing payment', { reference: t.reference, amountNaira: t.amount / 100, userId });
      }
      await PaystackUnmatchedPayment.updateOne(
        { reference: t.reference, status: 'open' },
        { $set: { status: 'resolved', resolvedAt: new Date(), resolvedUserId: userId } }
      );
    } catch (err) {
      summary.failed++;
      logger.error('Paystack reconcile: credit failed', { reference: t.reference, userId, error: err.message });
      await recordUnmatched(t, ctx, 'credit_failed', [users[0]._id], err.message);
    }
  }
  return summary;
}
