/**
 * Unit tests for parseClientGpsFix and readGoOnlineBody — no DB needed.
 *
 * Covers clock-skew immunity via ageMs, the loosened going-online accuracy
 * ceiling, and the capturedAt fallback behavior.
 *
 *   node scripts/verifyGpsFixParser.js
 */
import { writeSync } from 'node:fs';

const log = (line) => writeSync(2, `${line}\n`);

const {
  parseClientGpsFix,
  readGoOnlineBody,
  REAL_FIX_MAX_AGE_MS,
  REAL_FIX_MAX_ACCURACY_M,
  GO_ONLINE_MAX_ACCURACY_M,
  FALLBACK_CLOCK_SKEW_TOLERANCE_MS,
  LOCATION_REQUIRED_MESSAGE,
  realFixIsFresh,
} = await import('../src/utils/driverGpsFix.js');

let passed = 0;
let failed = 0;
const check = (cond, msg) => {
  if (cond) {
    passed++;
    log(`  ok   ${msg}`);
  } else {
    failed++;
    log(`  FAIL ${msg}`);
  }
};
const eq = (a, b, msg) => check(a === b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const NOW = 1_700_000_000_000; // deterministic clock for tests
const ABK = { lat: 6.32, lng: 8.11 }; // Abakaliki

log('A. constants');
eq(REAL_FIX_MAX_AGE_MS, 60_000, 'REAL_FIX_MAX_AGE_MS = 60s');
eq(REAL_FIX_MAX_ACCURACY_M, 150, 'REAL_FIX_MAX_ACCURACY_M = 150m (strict)');
eq(GO_ONLINE_MAX_ACCURACY_M, 500, 'GO_ONLINE_MAX_ACCURACY_M = 500m (looser)');
eq(FALLBACK_CLOCK_SKEW_TOLERANCE_MS, 10 * 60 * 1000, 'FALLBACK_CLOCK_SKEW_TOLERANCE_MS = 10min');
eq(typeof LOCATION_REQUIRED_MESSAGE, 'string', 'LOCATION_REQUIRED_MESSAGE is a string');

log('\nB. parseClientGpsFix: ageMs happy path');
{
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, ageMs: 1500 }, NOW);
  check(fix != null, 'ageMs path returns a fix');
  eq(fix.lat, ABK.lat, '  lat');
  eq(fix.lng, ABK.lng, '  lng');
  eq(fix.accuracy, 12, '  accuracy');
  eq(fix.capturedAt.getTime(), NOW - 1500, '  capturedAt = now - ageMs');
}

log('\nC. parseClientGpsFix: ageMs ignores wall-clock skew');
{
  // Phone clock is 5 minutes ahead of server. capturedAt looks like future.
  const fix = parseClientGpsFix(
    { ...ABK, accuracy: 12, capturedAt: NOW + 5 * 60 * 1000, ageMs: 2000 },
    NOW
  );
  check(fix != null, 'drifted clock accepted via ageMs');
  eq(fix.capturedAt.getTime(), NOW - 2000, '  capturedAt uses ageMs, not capturedAt');
}

log('\nD. parseClientGpsFix: ageMs > 60s is rejected');
{
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, ageMs: 90_000 }, NOW);
  check(fix == null, '90s ageMs is rejected');
}

log('\nE. parseClientGpsFix: negative ageMs is rejected');
{
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, ageMs: -5000 }, NOW);
  check(fix == null, 'negative ageMs is rejected');
}

log('\nF. parseClientGpsFix: NaN ageMs is rejected');
{
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, ageMs: 'banana' }, NOW);
  check(fix == null, 'non-numeric ageMs is rejected');
}

log('\nG. parseClientGpsFix: capturedAt fallback (strict freshness)');
{
  const capturedAt = NOW - 800;
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, capturedAt }, NOW);
  check(fix != null, 'strict-fresh capturedAt accepted');
  eq(fix.capturedAt.getTime(), capturedAt, '  capturedAt preserved as-sent (strict)');
}

log('\nH. parseClientGpsFix: capturedAt within fallback tolerance stamps server-now');
{
  const skewed = NOW + 3 * 60 * 1000; // 3 min clock skew, no ageMs
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, capturedAt: skewed }, NOW);
  check(fix != null, '3min-skewed capturedAt accepted');
  eq(fix.capturedAt.getTime(), NOW, '  capturedAt clamped to server-now when skewed');
}

log('\nI. parseClientGpsFix: capturedAt > 10min skew is rejected');
{
  const skewed = NOW + 15 * 60 * 1000;
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12, capturedAt: skewed }, NOW);
  check(fix == null, '15min skew is rejected');
}

log('\nJ. parseClientGpsFix: missing both capturedAt and ageMs is rejected');
{
  const fix = parseClientGpsFix({ ...ABK, accuracy: 12 }, NOW);
  check(fix == null, 'no freshness proof is rejected');
}

log('\nK. parseClientGpsFix: [0,0] coords rejected regardless of freshness proof');
{
  const fix = parseClientGpsFix({ lat: 0, lng: 0, accuracy: 12, ageMs: 100 }, NOW);
  check(fix == null, '[0,0] rejected even with valid ageMs');
}

log('\nL. parseClientGpsFix: accuracy above strict ceiling rejected (default)');
{
  // No override → uses the strict REAL_FIX_MAX_ACCURACY_M = 150
  const fix = parseClientGpsFix({ ...ABK, accuracy: 300, ageMs: 100 }, NOW);
  check(fix == null, '300m accuracy rejected under default strict ceiling');
}

log('\nM. parseClientGpsFix: accuracy above override ceiling rejected');
{
  const fix = parseClientGpsFix(
    { ...ABK, accuracy: 600, ageMs: 100 },
    NOW,
    { maxAccuracyM: 500 }
  );
  check(fix == null, '600m accuracy rejected even with 500m override');
}

log('\nN. parseClientGpsFix: accuracy within override ceiling accepted');
{
  const fix = parseClientGpsFix(
    { ...ABK, accuracy: 300, ageMs: 100 },
    NOW,
    { maxAccuracyM: 500 }
  );
  check(fix != null, '300m accuracy accepted with 500m override');
}

log('\nO. readGoOnlineBody: no GPS fields → not rejected (caller falls through)');
{
  const r = readGoOnlineBody({ isAvailable: true }, NOW);
  eq(r.rejected, false, 'no fields: rejected=false');
  eq(r.fix, null, 'no fields: fix=null');
}

log('\nP. readGoOnlineBody: valid ageMs fix accepted');
{
  const r = readGoOnlineBody(
    { isAvailable: true, ...ABK, accuracy: 12, ageMs: 500 },
    NOW
  );
  eq(r.rejected, false, 'valid fix: rejected=false');
  check(r.fix != null, 'valid fix: fix is set');
  eq(r.fix.capturedAt.getTime(), NOW - 500, 'valid fix: capturedAt = now - ageMs');
}

log('\nQ. readGoOnlineBody: 400m accuracy accepted (going-online loosened ceiling)');
{
  const r = readGoOnlineBody(
    { isAvailable: true, ...ABK, accuracy: 400, ageMs: 500 },
    NOW
  );
  eq(r.rejected, false, '400m accuracy: going-online accepts it');
  check(r.fix != null, '400m accuracy: fix is set');
}

log('\nR. readGoOnlineBody: 600m accuracy still rejected');
{
  const r = readGoOnlineBody(
    { isAvailable: true, ...ABK, accuracy: 600, ageMs: 500 },
    NOW
  );
  eq(r.rejected, true, '600m accuracy: rejected');
  eq(r.fix, null, '600m accuracy: no fix');
}

log('\nS. readGoOnlineBody: invalid lat/lng → rejected');
{
  const r = readGoOnlineBody(
    { isAvailable: true, lat: 'banana', lng: ABK.lng, ageMs: 500 },
    NOW
  );
  eq(r.rejected, true, 'invalid lat: rejected');
}

log('\nT. realFixIsFresh: still uses the strict 60s window');
{
  check(realFixIsFresh(new Date(NOW - 30_000), NOW), '30s-old fix is fresh');
  check(!realFixIsFresh(new Date(NOW - 90_000), NOW), '90s-old fix is not fresh');
  check(!realFixIsFresh(null, NOW), 'null fix is not fresh');
}

log('\nU. backward compat: heartbeat path (no ageMs, strict accuracy) unchanged');
{
  // Simulates persistDriverLocationMongo's parse call without ageMs.
  const fix = parseClientGpsFix(
    { ...ABK, accuracy: 20, capturedAt: NOW - 1000 },
    NOW
  );
  check(fix != null, 'heartbeat with ok accuracy accepted');
  const too = parseClientGpsFix(
    { ...ABK, accuracy: 200, capturedAt: NOW - 1000 },
    NOW
  );
  check(too == null, 'heartbeat with 200m accuracy still rejected (strict path)');
}

log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
