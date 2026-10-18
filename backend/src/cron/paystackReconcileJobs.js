/**
 * KEKE — Paystack funding reconciliation cron.
 * Every 10 minutes: re-check the last 2 days. Daily 03:30: re-check the last 14 days.
 * Credits are idempotent by Paystack reference, so overlapping runs and the webhook cannot double-credit.
 * Disable with PAYSTACK_RECONCILE_ENABLED=false.
 */
import cron from 'node-cron';
import logger from '../utils/logger.js';
import { reconcilePaystackFunding } from '../services/paystackReconcileService.js';

if (process.env.PAYSTACK_RECONCILE_ENABLED === 'false' || !process.env.PAYSTACK_SECRET_KEY) {
  logger.info('Paystack reconcile cron not started (disabled or no PAYSTACK_SECRET_KEY)');
} else {
  let running = false;
  const run = (days) => async () => {
    if (running) return;
    running = true;
    try {
      const s = await reconcilePaystackFunding({ days, apply: true });
      if (s.credited > 0 || s.unmatched > 0 || s.failed > 0) {
        logger.warn(`[Cron] Paystack reconcile (${days}d): credited ${s.credited}, unmatched ${s.unmatched}, failed ${s.failed}`);
      }
    } catch (err) {
      logger.error(`[Cron] Paystack reconcile failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  cron.schedule('*/10 * * * *', run(2));
  cron.schedule('30 3 * * *', run(14));
  setTimeout(run(2), 60_000);
  logger.info('✅ Paystack reconcile cron registered (every 10 min, daily deep check)');
}
