/**
 * Read-only. Labels why each successful Paystack DVA payment has no rider-wallet ledger row.
 * Does not credit anything.
 *
 *   cd backend && node scripts/auditDvaFunding.js 30
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';
import WalletFundingTransaction from '../src/models/WalletFundingTransaction.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const days = Number(process.argv[2]) || 30;
const from = new Date(Date.now() - days * 86400000).toISOString();

async function fetchPaystackDva() {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not set');
  const out = [];
  for (let page = 1; page < 50; page += 1) {
    const { data } = await axios.get('https://api.paystack.co/transaction', {
      headers: { Authorization: `Bearer ${secret}` },
      params: { status: 'success', perPage: 100, page, from },
      timeout: 20000,
    });
    const rows = data?.data || [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out.filter((tx) => ['dedicated_nuban', 'bank_transfer'].includes((tx.channel || '').toLowerCase()));
}

async function classify(tx) {
  const code = tx.customer?.customer_code;
  const acct = tx.authorization?.receiver_bank_account_number;
  const liveFilter = code
    ? { paystackCustomerCode: code }
    : null;
  const accountFilter = acct
    ? { $or: [{ dvaAccountNumber: acct }, { topupAccountNumber: acct }] }
    : null;

  const liveByCode = liveFilter
    ? await User.find(liveFilter).select('_id name').limit(3).lean()
    : [];
  const liveByAccount = liveByCode.length === 0 && accountFilter
    ? await User.find(accountFilter).select('_id name').limit(3).lean()
    : [];
  const live = liveByCode.length ? liveByCode : liveByAccount;

  if (live.length === 1) {
    return { label: 'STUCK recoverable', detail: `${live[0].name} (${live[0]._id})` };
  }
  if (live.length > 1) {
    return { label: 'AMBIGUOUS', detail: `${live.length} live users` };
  }

  if (!liveFilter && !accountFilter) return { label: 'NO IDENTIFIER', detail: 'no customer code or account number' };
  const deletedByCode = liveFilter
    ? await User.find({ ...liveFilter, deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .select('_id name')
      .limit(3)
      .lean()
    : [];
  const deleted = deletedByCode.length || !accountFilter
    ? deletedByCode
    : await User.find({ ...accountFilter, deletedAt: { $ne: null } })
      .setOptions({ includeDeleted: true })
      .select('_id name')
      .limit(3)
      .lean();
  if (deleted.length === 1) return { label: 'DELETED USER ONLY', detail: String(deleted[0]._id) };
  if (deleted.length > 1) return { label: 'AMBIGUOUS DELETED', detail: `${deleted.length} deleted users` };
  return { label: 'NO USER', detail: 'no live or deleted account' };
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Set MONGODB_URI or MONGO_URI');
  await mongoose.connect(mongoUri);
  const txs = await fetchPaystackDva();
  const counts = {};
  console.log(`Audit only - ${txs.length} Paystack DVA successes in last ${days}d\n`);

  for (const tx of txs) {
    if (!tx?.reference) continue;
    const naira = Number(tx.amount) / 100;
    if (await WalletFundingTransaction.exists({ reference: tx.reference })) {
      counts['ALREADY CREDITED'] = (counts['ALREADY CREDITED'] || 0) + 1;
      continue;
    }
    const { label, detail } = await classify(tx);
    counts[label] = (counts[label] || 0) + 1;
    console.log(`${label}  ref=${tx.reference} channel=${tx.channel} ₦${naira}  ${detail}`);
  }

  console.log('\n' + Object.entries(counts).map(([label, count]) => `${label}: ${count}`).join('\n'));
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.response?.data || err);
  process.exit(1);
});
