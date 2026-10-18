/**
 * Credit successful Paystack payments that never reached a wallet (same logic as the 10-minute cron).
 *
 *   cd backend && node scripts/reconcilePaystackFunding.js 30            # dry run, last 30 days
 *   cd backend && node scripts/reconcilePaystackFunding.js 30 --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { reconcilePaystackFunding } from '../src/services/paystackReconcileService.js';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const days = Number(process.argv[2]) || 30;
  const apply = process.argv.includes('--apply');
  const s = await reconcilePaystackFunding({ days, apply, graceMinutes: 0 });
  console.log(apply ? 'APPLIED' : 'DRY RUN', JSON.stringify(s, null, 2));
  await mongoose.disconnect();
};
run().catch((e) => { console.error(e.response?.data || e); process.exit(1); });
