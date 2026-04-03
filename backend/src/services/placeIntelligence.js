/**
 * KEKE — Self-Learning Place Intelligence
 * Every completed ride teaches the system; candidates promote to Place at 15 rides.
 */

import Place from '../models/Place.js';
import PlaceCandidate from '../models/PlaceCandidate.js';
import { getRedisClient } from '../config/redis.js';
import { detectCity } from '../seeds/nigerianCities.js';

const Candidate = PlaceCandidate;

export const MIN_RIDES_VISIBLE = 15;
const SNAP_PRECISION = 4;
const RIDES_BOOST = 50;
const RIDES_SEEDED = 100;

const GENERIC_LABELS = new Set([
  'my location', 'current location', 'here', 'home', 'somewhere',
  'location', 'destination', 'pickup', 'drop off', 'drop-off',
  'nigeria', 'unknown', 'address',
]);

function redisAdapter() {
  const client = getRedisClient();
  if (!client || (client.isOpen === false && client.isReady === false)) return null;
  return {
    get: (k) => client.get(k),
    setex: (k, ttl, v) => client.setEx(k, ttl, v),
  };
}

function snapCoord(value) {
  return parseFloat(Number(value).toFixed(SNAP_PRECISION));
}

function makeSnapKey(lat, lng) {
  return `${snapCoord(lat)}:${snapCoord(lng)}`;
}

function scoreLabelQuality(label) {
  if (!label || typeof label !== 'string') return 0;
  const l = label.trim().toLowerCase();
  if (GENERIC_LABELS.has(l)) return 0;
  if (l.length < 4) return 0;
  if (/^\d/.test(l) && l.split(' ').length < 3) return 1;
  if (/nigeria$/.test(l) && l.split(',').length < 3) return 2;
  if (/,/.test(l) && l.includes('nigeria')) return 4;
  if (l.split(' ').length >= 2 && l.length > 6) return 6;
  if (l.split(' ').length >= 3) return 8;
  return 3;
}

function chooseBestName(nameHistory, fallback) {
  if (!nameHistory || nameHistory.length === 0) return fallback;
  return nameHistory.reduce((best, current) => {
    const bestScore = scoreLabelQuality(best);
    const currentScore = scoreLabelQuality(current);
    if (currentScore > bestScore) return current;
    if (currentScore === bestScore && current.length < best.length) return current;
    return best;
  }, fallback || nameHistory[0]);
}

/**
 * Call after every successful ride completion. Fire-and-forget; do not await.
 */
export async function learnFromRide(ride) {
  const { origin, destination, _id: rideId } = ride;
  const redis = redisAdapter();
  if (redis) {
    const alreadyProcessed = await redis.get(`learn:processed:${rideId}`);
    if (alreadyProcessed) return;
    await redis.setex(`learn:processed:${rideId}`, 86400 * 7, '1');
  }

  await Promise.allSettled([
    processEndpoint(origin?.lat, origin?.lng, origin?.label),
    processEndpoint(destination?.lat, destination?.lng, destination?.label),
  ]);
}

async function processEndpoint(lat, lng, label) {
  if (lat == null || lng == null) return;
  const city = detectCity(lat, lng);
  if (!city) return;

  const snapKey = makeSnapKey(lat, lng);

  const nearbySeeded = await Place.findOne({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [snapCoord(lng), snapCoord(lat)] },
        $maxDistance: 30,
      },
    },
    city: city.slug,
    source: 'seeded',
    active: true,
  });

  if (nearbySeeded) {
    await Place.updateOne({ _id: nearbySeeded._id }, { $inc: { rideCount: 1 } });
    return;
  }

  const candidate = await Candidate.findOneAndUpdate(
    { snapKey },
    {
      $inc: { rideCount: 1 },
      $set: {
        lastSeen: new Date(),
        city: city.slug,
        state: city.state,
        location: { type: 'Point', coordinates: [snapCoord(lng), snapCoord(lat)] },
      },
      $setOnInsert: {
        name: label ?? 'Unknown Place',
        nameHistory: [],
        firstSeen: new Date(),
        promoted: false,
      },
    },
    { upsert: true, new: true }
  );

  const labelScore = scoreLabelQuality(label);
  if (label && labelScore > scoreLabelQuality(candidate.name)) {
    await Candidate.updateOne(
      { snapKey },
      { $set: { name: label }, $addToSet: { nameHistory: label } }
    );
  } else if (label && label !== candidate.name) {
    await Candidate.updateOne({ snapKey }, { $addToSet: { nameHistory: label } });
  }

  const currentCount = candidate.rideCount + 1;
  if (!candidate.promoted && currentCount >= MIN_RIDES_VISIBLE) {
    await promoteCandidate(candidate, city);
  } else if (candidate.promoted && currentCount === RIDES_BOOST) {
    await boostPlace(snapKey, city.slug);
  } else if (candidate.promoted && currentCount === RIDES_SEEDED) {
    await elevateToSeeded(snapKey, city.slug);
  }
}

/**
 * Promotes a candidate to a named Place. Exported for cron (daily promotion check).
 */
export async function promoteCandidate(candidate, city) {
  const bestName = chooseBestName(candidate.nameHistory, candidate.name);
  const score = scoreLabelQuality(bestName);

  if (score < 3) {
    console.log(`[Learn] Skipping promotion for "${bestName}" — label quality score ${score}`);
    return;
  }

  const aliases = (candidate.nameHistory || [])
    .filter((n) => n !== bestName && scoreLabelQuality(n) >= 2)
    .slice(0, 5);

  await Place.findOneAndUpdate(
    {
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: candidate.location.coordinates },
          $maxDistance: 25,
        },
      },
      city: city.slug,
      source: 'learned',
    },
    {
      $set: {
        name: bestName,
        aliases,
        city: city.slug,
        state: city.state,
        location: candidate.location,
        source: 'learned',
        popularity: 3,
        rideCount: candidate.rideCount,
        verified: false,
        active: true,
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true }
  );

  await Candidate.updateOne(
    { snapKey: candidate.snapKey },
    { $set: { promoted: true, promotedAt: new Date() } }
  );

  console.log(`[Learn] ✅ Promoted "${bestName}" to place (${city.name}, ${candidate.rideCount} rides)`);
}

async function boostPlace(snapKey, citySlug) {
  const candidate = await Candidate.findOne({ snapKey });
  if (!candidate) return;
  await Place.updateOne(
    {
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: candidate.location.coordinates },
          $maxDistance: 25,
        },
      },
      city: citySlug,
    },
    { $set: { popularity: 6 } }
  );
  console.log(`[Learn] ⬆️  Boosted "${candidate.name}" popularity (${RIDES_BOOST} rides)`);
}

async function elevateToSeeded(snapKey, citySlug) {
  const candidate = await Candidate.findOne({ snapKey });
  if (!candidate) return;
  await Place.updateOne(
    {
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: candidate.location.coordinates },
          $maxDistance: 25,
        },
      },
      city: citySlug,
    },
    { $set: { popularity: 9, source: 'seeded', verified: true } }
  );
  console.log(`[Learn] 🌟 Elevated "${candidate.name}" to seeded place (${RIDES_SEEDED} rides)`);
}

export async function cleanupStaleCandidates() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await Candidate.deleteMany({
    promoted: false,
    rideCount: { $lt: 5 },
    lastSeen: { $lt: thirtyDaysAgo },
  });
  console.log(`[Learn] 🧹 Cleaned up ${result.deletedCount} stale candidates`);
  return result.deletedCount;
}

export async function getLearningStats(citySlug) {
  const [seededCount, learnedCount, candidateCount, pendingPromotion] = await Promise.all([
    Place.countDocuments({ city: citySlug, source: 'seeded', active: true }),
    Place.countDocuments({ city: citySlug, source: 'learned', active: true }),
    Candidate.countDocuments({ city: citySlug, promoted: false }),
    Candidate.countDocuments({ city: citySlug, promoted: false, rideCount: { $gte: MIN_RIDES_VISIBLE } }),
  ]);

  const topLearned = await Place.find(
    { city: citySlug, source: 'learned', active: true },
    'name rideCount popularity'
  )
    .sort({ rideCount: -1 })
    .limit(10);

  return {
    citySlug,
    places: { seeded: seededCount, learned: learnedCount },
    candidates: { total: candidateCount, pendingPromotion },
    topLearned,
  };
}
