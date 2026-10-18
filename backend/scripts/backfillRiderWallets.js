/**
 * Give every rider a wallet. Each new wallet is seeded from the rider's current User.balance, which is exactly what
 * the first booking used to do, so this creates no gap and moves no money. Riders who already have a wallet are skipped.
 *
 *   cd backend && node scripts/backfillRiderWallets.js            # dry run
 *   cd backend && node scripts/backfillRiderWallets.js --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import User from '../src/models/User.js';
import UserWallet from '../src/models/UserWallet.js';
import { ensureRiderWallet } from '../src/services/riderBalanceService.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });
const apply = process.argv.includes('--apply');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const haveWallet = new Set((await UserWallet.find({}).select('userId').lean()).map((w) => w.userId.toString()));
  let missing = 0, created = 0, seededTotal = 0, failed = 0;

  const cursor = User.find({ role: 'passenger' }).select('_id balance name').cursor();
  for await (const u of cursor) {
    if (haveWallet.has(u._id.toString())) continue;
    missing++;
    seededTotal += Math.max(0, Number(u.balance) || 0);
    if (!apply) continue;
    try {
      await ensureRiderWallet(u._id);
      created++;
    } catch (err) {
      failed++;
      console.error(`FAILED ${u._id} ${u.name || ''}: ${err.message}`);
    }
  }
  console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: riders without a wallet: ${missing}, wallets created: ${created}, failed: ${failed}`);
  console.log(`Total seeded from User.balance: ₦${seededTotal.toLocaleString()}`);
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e); process.exit(1); });
