#!/usr/bin/env node
/**
 * Verifies the in-progress stale-detection logic without needing Mongo.
 *
 * Replays the query shape that staleTripService uses on an in-memory
 * list of ride snapshots and asserts which ones match / do not match.
 *
 *   node scripts/verifyStaleRideDetection.js
 */
import { writeSync } from 'node:fs';

const log = (l) => writeSync(2, `${l}\n`);
let passed = 0, failed = 0;
const check = (c, m) => { if (c) { passed++; log(`  ok   ${m}`); } else { failed++; log(`  FAIL ${m}`); } };

// Mirror the exact condition the service will run against Mongo.
function matchesStaleCondition(ride, nowMs) {
  const STALE_MINUTES = 15;
  const STALE_LEGACY_MINUTES = 20;
  if (ride.status !== 'in-progress') return false;
  const cutoff = nowMs - STALE_MINUTES * 60 * 1000;
  const legacyCutoff = nowMs - STALE_LEGACY_MINUTES * 60 * 1000;

  if (ride.lastDriverLocationAt != null) {
    return new Date(ride.lastDriverLocationAt).getTime() < cutoff;
  }
  return new Date(ride.updatedAt).getTime() < legacyCutoff;
}

const now = Date.now();
const ago = (mins) => new Date(now - mins * 60 * 1000);

log('A. ride with fresh GPS ping is NOT stale');
check(!matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: ago(3),
  updatedAt: ago(45),
}, now), '3-min ping = not stale even if ride created 45m ago');

log('\nB. ride with no GPS ping for 10 min is NOT stale (under 15min threshold)');
check(!matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: ago(10),
  updatedAt: ago(10),
}, now), '10m-stale ping = not yet flagged');

log('\nC. ride with no GPS ping for 20 min IS stale');
check(matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: ago(20),
  updatedAt: ago(20),
}, now), '20m-stale ping = flagged');

log('\nD. legacy ride without lastDriverLocationAt, 15m old updatedAt = NOT stale');
check(!matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: null,
  updatedAt: ago(15),
}, now), 'legacy ride uses 20m threshold');

log('\nE. legacy ride without lastDriverLocationAt, 25m old updatedAt = IS stale');
check(matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: null,
  updatedAt: ago(25),
}, now), 'legacy ride flagged after 20m');

log('\nF. non-in-progress ride is never stale (handled by different sweep)');
check(!matchesStaleCondition({
  status: 'arrived',
  lastDriverLocationAt: ago(60),
}, now), 'arrived status excluded');
check(!matchesStaleCondition({
  status: 'completed',
  lastDriverLocationAt: ago(60),
}, now), 'completed status excluded');

log('\nG. NORMAL LONG RIDE: 25-min trip with regular 2-min pings is NOT stale');
// This is the key regression the old code failed. Replays a realistic
// Abakaliki keke ride: accepted 25 min ago, in-progress, driver pinging every
// 2 min so lastDriverLocationAt is always recent.
check(!matchesStaleCondition({
  status: 'in-progress',
  lastDriverLocationAt: ago(2),
  updatedAt: ago(25),
}, now), 'long trip with live pings stays healthy');

log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
