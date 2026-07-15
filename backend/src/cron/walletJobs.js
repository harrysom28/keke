/**
 * KEKE — Wallet cron jobs
 * Releases driver pending credits (24h clearance) to available balance.
 * Each release also sweeps outstanding commission debt (built into
 * releasePendingForDriver), so debts settle as earnings clear.
 */

import cron from 'node-cron';
import logger from '../utils/logger.js';
import { releaseAllPendingBalances } from '../services/walletService.js';

let releaseRunning = false;

async function runRelease() {
  if (releaseRunning) return; // don't overlap slow runs
  releaseRunning = true;
  try {
    const released = await releaseAllPendingBalances();
    if (released > 0) {
      logger.info(`[Cron] Wallet release: ₦${released} moved from pending to available`);
    }
  } catch (err) {
    logger.error(`[Cron] Wallet release failed: ${err.message}`);
  } finally {
    releaseRunning = false;
  }
}

// Every 15 minutes; releasePendingForDriver is a no-op for wallets with no due credits.
cron.schedule('*/15 * * * *', runRelease);

// Catch up overdue credits shortly after boot (e.g. after downtime or deploys).
setTimeout(runRelease, 15_000);

logger.info('✅ Wallet release cron registered (every 15 min)');
