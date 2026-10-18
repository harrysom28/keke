/**
 * Rider balance gap report + reviewed corrections. NEVER moves money on its own.
 *
 * The wallet (UserWallet.availableBalance) is the balance a booking spends. User.balance used to be written by
 * several older credit paths that never touched the wallet, and some payments were counted twice, so for existing
 * riders the two numbers can differ. A blanket "copy the gap into the wallet" would also copy the double-counted money.
 * This script lists each gap with the evidence found, so a person decides rider by rider.
 *
 *   1) cd backend && node scripts/reconcileRiderBalances.js                 -> writes rider-balance-gaps-<time>.csv
 *   2) Open the CSV. For each rider you have verified, fill the approved_delta column
 *      (positive = add to wallet, negative = remove) and keep only those rows.
 *   3) cd backend && node scripts/reconcileRiderBalances.js --apply-file approved.csv
 *      CSV needs columns: userId,approved_delta,reason
 *
 * Columns in the report
 *   gap                      User.balance - wallet available (positive: the mirror is higher than what can be spent)
 *   double_count_suspect     card top-ups recorded BOTH by the old verify (Payment row) and by the ledger (WalletFundingTransaction):
 *                            the same money counted twice. Do not move these into the wallet.
 *   legacy_verify_only       card top-ups credited only by the old verify (no ledger row): User.balance got them, the wallet may not have.
 *   only_used_legacy_verify  true when the rider has legacy-verify top-ups and has NEVER had a ledger (webhook) top-up
 *   refunds_to_wallet        wallet-method payments marked refunded (old refund paths wrote User.balance only)
 *   reward_claims            milestone/referral rewards claimed (old paths wrote User.balance only); amounts are today's settings
 *   suggested_delta          min(gap, legacy_verify_only + refunds_to_wallet + reward_claims). An upper bound that excludes duplicates.
 *                            A starting point to verify against Paystack and the ride history, not an instruction.
 *   stuck_pending_rows       ledger rows left 'pending' for over 10 minutes (a credit/debit that died half way)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';
import UserWallet from '../src/models/UserWallet.js';
import UserWalletTransaction from '../src/models/UserWalletTransaction.js';
import Payment from '../src/models/Payment.js';
import WalletFundingTransaction from '../src/models/WalletFundingTransaction.js';
import AdminSettings from '../src/models/AdminSettings.js';
import { adjustRiderBalance } from '../src/services/riderBalanceService.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const parseCsvLine = (line) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
};

async function applyFile(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  for (const need of ['userId', 'approved_delta', 'reason']) if (!(need in idx)) throw new Error(`CSV is missing column ${need}`);
  const batch = new Date().toISOString().slice(0, 10);
  let applied = 0, skipped = 0;
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const userId = cols[idx.userId]?.trim();
    const delta = Number(cols[idx.approved_delta]);
    const reason = cols[idx.reason]?.trim();
    if (!userId || !Number.isFinite(delta) || delta === 0) { skipped++; continue; }
    if (!reason) { console.error(`${userId}: SKIPPED, a reason is required for every approved row`); skipped++; continue; }
    try {
      const r = await adjustRiderBalance(userId, delta, {
        type: 'reconciliation',
        reason,
        idempotencyKey: `reconcile:${batch}:${userId}`,
      });
      const duplicate = r.credited === false || r.debited === false;
      console.log(`${userId}: ${delta > 0 ? '+' : ''}${delta} -> wallet ₦${r.balanceAfter}${duplicate ? (r.pending ? ' (an earlier attempt is still PENDING: check by hand, nothing moved)' : ' (already applied today, nothing moved)') : ''}`);
      if (duplicate) skipped++; else applied++;
    } catch (err) {
      console.error(`${userId}: FAILED ${err.message}`);
      skipped++;
    }
  }
  console.log(`done: applied ${applied}, skipped ${skipped}`);
}

async function report() {
  const settings = await AdminSettings.findOne({ key: 'default' }).lean();
  const milestoneAmount = Number(process.env.MILESTONE_REWARD_AMOUNT) || 1000;
  const refCfg = settings?.referral || {};
  const refAmount = (refCfg.rewardType || 'free_ride') === 'cash' ? refCfg.cashAmount ?? 500 : refCfg.freeRideAmount ?? 1000;

  const stuck = await UserWalletTransaction.find({ status: 'pending', createdAt: { $lt: new Date(Date.now() - 10 * 60000) } })
    .select('userId type amount idempotencyKey createdAt').lean();
  const stuckBy = {};
  for (const s of stuck) stuckBy[s.userId.toString()] = (stuckBy[s.userId.toString()] || 0) + 1;

  const rows = [];
  const cursor = UserWallet.find({ userType: 'rider' }).lean().cursor();
  for await (const w of cursor) {
    const u = await User.findById(w.userId).select('name phone balance tenRideFreeClaimed referralRewardsClaimedCount').lean();
    if (!u) continue;
    const available = Number(w.availableBalance) || 0;
    const mirror = Number(u.balance) || 0;
    const gap = Math.round((mirror - available) * 100) / 100;
    if (gap === 0 && !stuckBy[w.userId.toString()]) continue;

    const cardTopups = await Payment.find({ user: w.userId, status: 'completed', ride: null, method: 'card', transactionId: { $ne: null } })
      .select('amount transactionId').lean();
    const refs = cardTopups.map((p) => p.transactionId);
    const ledgered = new Set((await WalletFundingTransaction.find({ reference: { $in: refs } }).select('reference').lean()).map((r) => r.reference));
    let dup = 0, legacyOnly = 0;
    for (const p of cardTopups) (ledgered.has(p.transactionId) ? (dup += p.amount) : (legacyOnly += p.amount));

    // Refunds and rewards that went through the new helper are already in the wallet (they have a completed ledger
    // row); only what the old paths wrote to User.balance alone can explain a gap, so subtract the ledgered amounts.
    const ledgerSum = async (type) => {
      const r = await UserWalletTransaction.aggregate([
        { $match: { userId: w.userId, type, status: 'completed', amount: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      return r[0]?.total || 0;
    };
    const refunded = await Payment.find({ user: w.userId, method: 'wallet', status: 'refunded' }).select('refundAmount').lean();
    const refunds = Math.max(0, refunded.reduce((a, p) => a + (Number(p.refundAmount) || 0), 0) - (await ledgerSum('refund')));
    const claimedRewards = (u.tenRideFreeClaimed ? milestoneAmount : 0) + (Number(u.referralRewardsClaimedCount) || 0) * refAmount;
    const rewards = Math.max(0, claimedRewards - (await ledgerSum('reward')));
    const everLedgered = ledgered.size > 0 || (await WalletFundingTransaction.exists({ user: w.userId }));
    const onlyLegacyVerify = legacyOnly > 0 && !everLedgered;

    const explained = legacyOnly + refunds + rewards;
    rows.push({
      userId: w.userId.toString(), name: u.name || '', phone: u.phone || '',
      wallet_available: available, wallet_held: Number(w.heldBalance) || 0, user_balance_mirror: mirror, gap,
      double_count_suspect: dup, legacy_verify_only: legacyOnly, only_used_legacy_verify: onlyLegacyVerify, refunds_to_wallet: refunds, reward_claims: rewards,
      suggested_delta: gap > 0 ? Math.min(gap, explained) : 0,
      stuck_pending_rows: stuckBy[w.userId.toString()] || 0,
      approved_delta: '', reason: '',
    });
  }
  rows.sort((a, b) => b.gap - a.gap);
  const cols = Object.keys(rows[0] || { userId: '' });
  const file = `rider-balance-gaps-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  fs.writeFileSync(file, [cols.join(','), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(','))].join('\n'));
  const positive = rows.filter((r) => r.gap > 0);
  console.log(`riders with a gap or a stuck row: ${rows.length}`);
  console.log(`gap > 0 (mirror higher): ${positive.length}, total ₦${positive.reduce((a, r) => a + r.gap, 0).toLocaleString()}`);
  console.log(`  of which suspected double-counted: ₦${positive.reduce((a, r) => a + r.double_count_suspect, 0).toLocaleString()}`);
  console.log(`gap < 0 (wallet higher): ${rows.filter((r) => r.gap < 0).length}`);
  console.log(`stuck pending ledger rows (>10 min): ${stuck.length}`);
  console.log(`report written: ${file}`);
}

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const i = process.argv.indexOf('--apply-file');
  if (i > -1) await applyFile(process.argv[i + 1]); else await report();
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
