/**
 * Credits Paystack DVA payments that never reached a rider wallet.
 * DRY RUN by default. Idempotent: creditWalletFromPaystack skips a reference already in the ledger.
 *
 *   cd backend && node scripts/recoverDvaFunding.js 30
 *   cd backend && node scripts/recoverDvaFunding.js 30 --apply
 *
 * Run --apply only after the walletFundingService fix is deployed.
 * A payment is skipped unless it matches exactly one live user.
 * One failed credit does not stop the rest. A second --apply credits nothing new.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';
import WalletFundingTransaction from '../src/models/WalletFundingTransaction.js';
import { creditWalletFromPaystack } from '../src/services/walletFundingService.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const days = Number(process.argv[2]) || 30;
const apply = process.argv.includes('--apply');
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

async function matchLiveUser(tx) {
  const code = tx.customer?.customer_code;
  const acct = tx.authorization?.receiver_bank_account_number;
  let users = code
    ? await User.find({ paystackCustomerCode: code }).select('_id name balance').limit(2).lean()
    : [];
  if (users.length === 0 && acct) {
    users = await User.find({
      $or: [{ dvaAccountNumber: acct }, { topupAccountNumber: acct }],
    }).select('_id name balance').limit(2).lean();
  }
  return users;
}

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Set MONGODB_URI or MONGO_URI');
  await mongoose.connect(mongoUri);
  const txs = await fetchPaystackDva();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} - ${txs.length} Paystack DVA successes in last ${days}d\n`);
  let credited = 0;
  let skipped = 0;
  let already = 0;
  let failed = 0;

  for (const tx of txs) {
    if (!tx?.reference) continue;
    if (await WalletFundingTransaction.exists({ reference: tx.reference })) {
      already += 1;
      continue;
    }
    const users = await matchLiveUser(tx);
    const naira = Number(tx.amount) / 100;
    const code = tx.customer?.customer_code || '-';
    if (users.length !== 1) {
      skipped += 1;
      console.log(`SKIP  ref=${tx.reference} channel=${tx.channel} ₦${naira} customer=${code} matches=${users.length}`);
      continue;
    }
    const user = users[0];
    console.log(`${apply ? 'CREDIT' : 'WOULD CREDIT'}  ref=${tx.reference} channel=${tx.channel} ₦${naira} -> ${user.name} (${user._id}) balance now ₦${user.balance}`);
    if (!apply) continue;
    try {
      const result = await creditWalletFromPaystack(tx.reference, naira, user._id.toString(), {
        channel: tx.channel === 'dedicated_nuban' ? 'dedicated_nuban' : 'bank_transfer',
        ip: 'recovery-script',
      });
      if (result.credited) credited += 1;
      else already += 1;
    } catch (err) {
      failed += 1;
      console.log(`FAIL  ref=${tx.reference} ${err.message}`);
    }
  }

  const wouldCredit = txs.filter((tx) => tx?.reference).length - already - skipped - failed;
  console.log(`\nalready credited: ${already} | ${apply ? 'credited now' : 'would credit'}: ${apply ? credited : wouldCredit} | skipped for review: ${skipped}${apply ? ` | failed: ${failed}` : ''}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.response?.data || err);
  process.exit(1);
});
