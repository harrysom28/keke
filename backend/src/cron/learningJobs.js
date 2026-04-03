/**
 * KEKE — Learning pipeline cron jobs
 * Daily promotion check, weekly cleanup, daily stats.
 */

import cron from 'node-cron';
import Place from '../models/Place.js';
import PlaceCandidate from '../models/PlaceCandidate.js';
import {
  promoteCandidate,
  cleanupStaleCandidates,
  getLearningStats,
  MIN_RIDES_VISIBLE,
} from '../services/placeIntelligence.js';
import { NIGERIAN_CITIES, getSeededCities } from '../seeds/nigerianCities.js';

cron.schedule('0 3 * * *', async () => {
  console.log('[Cron] 🔍 Running daily promotion check...');

  try {
    const readyForPromotion = await PlaceCandidate.find({
      promoted: false,
      rideCount: { $gte: MIN_RIDES_VISIBLE ?? 15 },
    }).limit(50);

    console.log(`[Cron] Found ${readyForPromotion.length} candidates ready for promotion`);

    let promoted = 0;
    for (const candidate of readyForPromotion) {
      const city = NIGERIAN_CITIES.find((c) => c.slug === candidate.city);
      if (!city) continue;
      try {
        await promoteCandidate(candidate, city);
        promoted++;
      } catch (err) {
        console.error(`[Cron] Failed to promote "${candidate.name}": ${err.message}`);
      }
    }
    console.log(`[Cron] ✅ Promoted ${promoted} new places`);
  } catch (err) {
    console.error('[Cron] Promotion check failed:', err);
  }
});

cron.schedule('0 2 * * 0', async () => {
  console.log('[Cron] 🧹 Running weekly place cleanup...');
  try {
    const deleted = await cleanupStaleCandidates();
    console.log(`[Cron] ✅ Removed ${deleted} stale candidates`);
  } catch (err) {
    console.error('[Cron] Cleanup failed:', err);
  }
});

cron.schedule('0 8 * * *', async () => {
  const seededCities = await getSeededCities(Place);
  for (const city of seededCities) {
    try {
      const stats = await getLearningStats(city.slug);
      console.log(
        `[Places] 📊 ${city.name}: ${stats.places.seeded} seeded, ${stats.places.learned} learned, ${stats.candidates.total} candidates (${stats.candidates.pendingPromotion} pending)`
      );
      if (stats.candidates.pendingPromotion > 0) {
        console.log(`[Places] ⚡ ${city.name} has ${stats.candidates.pendingPromotion} places ready to promote`);
      }
    } catch (err) {
      console.error(`[Cron] Stats failed for ${city.slug}:`, err.message);
    }
  }
});

console.log('[Cron] ✅ Learning pipeline cron jobs registered');
