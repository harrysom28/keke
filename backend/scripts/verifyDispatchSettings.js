/**
 * Admin-configurable dispatch radii (settings.dispatch) against a REAL MongoDB.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_dispatch_test?replicaSet=rs0' node scripts/verifyDispatchSettings.js
 *
 * Checks:
 *   - defaults returned when no AdminSettings doc / empty dispatch group
 *   - valid updates persist and invalidate the settings cache
 *   - out-of-range values and round1 > round2 return 400
 *   - getSearchRadiusKm / getLocationMaxAgeMs / resolveDispatchSearchRadiusKm read the updated values
 *   - Fee settings save path accepts {dispatch} alongside fees/cancellation/arrival/dropoff
 *
 * Safety: refuses to run unless the connected database name contains "test".
 */
import mongoose from 'mongoose';
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_flow_checks';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_dummy';
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/test/i.test(uri.split('?')[0].split('/').pop())) {
  console.error('Set TEST_MONGODB_URI to a database whose name contains "test".');
  process.exit(2);
}

const { default: logger } = await import('../src/utils/logger.js');
logger.exitOnError = false;
logger.level = 'error';
process.on('unhandledRejection', (e) => { console.error('UNHANDLED', e); process.exit(3); });

const M = async (p) => (await import(p)).default;
const AdminSettings = await M('../src/models/AdminSettings.js');
const admin = await import('../src/controllers/adminController.js');
const {
  getSettings,
  invalidateCache,
  validateDispatchUpdate,
  DISPATCH_DEFAULTS,
} = await import('../src/services/settingsService.js');
const {
  getSearchRadiusKm,
  getLocationMaxAgeMs,
  resolveDispatchSearchRadiusKm,
  RIDER_PREVIEW_SEARCH_RADIUS_KM,
  RIDER_MATCH_SEARCH_RADIUS_KM,
  DISPATCH_RADIUS_ROUND_2_KM,
  DISPATCH_RADIUS_ROUND_3_KM,
  ASSIGN_NEW_DRIVER_RADIUS_KM,
  DRIVER_LOCATION_MAX_AGE_MS,
} = await import('../src/utils/driverSearchRadius.js');

let passed = 0, failed = 0;
const check = (c, m) => { if (c) { passed++; console.log('  ok  ', m); } else { failed++; console.log('  FAIL', m); } };
const eq = (a, b, m) => check(a === b, `${m} (got ${a}, want ${b})`);

await mongoose.connect(uri);
const dbName = mongoose.connection.db.databaseName;
if (!/test/i.test(dbName)) {
  console.error(`Refusing to run: connected database "${dbName}" does not contain "test".`);
  await mongoose.disconnect();
  process.exit(2);
}
const bi = await mongoose.connection.db.admin().command({ buildInfo: 1 });
if (bi.ferretdbVersion) {
  console.error('Refusing to run on FerretDB.');
  await mongoose.disconnect();
  process.exit(2);
}
console.log(`MongoDB ${bi.version} on database ${dbName}`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
await AdminSettings.createCollection().catch(() => {});

const call = (handler, req) => new Promise((resolve) => {
  const out = { status: 200, body: null, error: null };
  const done = () => setTimeout(() => resolve(out), 0);
  const res = {
    status(c) { out.status = c; return this; },
    json(b) { out.body = b; done(); return this; },
    set() { return this; },
    send(b) { out.body = b; done(); return this; },
  };
  setTimeout(() => { out.error = new Error('handler timed out'); resolve(out); }, 15000).unref();
  handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, user: { _id: new mongoose.Types.ObjectId() }, ...req }, res, (e) => { out.error = e || null; done(); });
});
const errMsg = (r) => (r.error ? ` [${r.error.message}]` : '');
const adminUser = () => ({ _id: new mongoose.Types.ObjectId(), email: 'a@keke.test' });

try {
console.log('\nA. defaults when no doc / empty dispatch');
{
  invalidateCache();
  await AdminSettings.deleteMany({});
  const s = await getSettings();
  eq(s.dispatch.previewRadiusKm, DISPATCH_DEFAULTS.previewRadiusKm, 'getSettings: preview default');
  eq(s.dispatch.round1RadiusKm, DISPATCH_DEFAULTS.round1RadiusKm, 'getSettings: round1 default');
  eq(s.dispatch.round2RadiusKm, DISPATCH_DEFAULTS.round2RadiusKm, 'getSettings: round2 default');
  eq(s.dispatch.round3RadiusKm, DISPATCH_DEFAULTS.round3RadiusKm, 'getSettings: round3 default');
  eq(s.dispatch.assignRadiusKm, DISPATCH_DEFAULTS.assignRadiusKm, 'getSettings: assign default');
  eq(s.dispatch.locationFreshnessSeconds, DISPATCH_DEFAULTS.locationFreshnessSeconds, 'getSettings: freshness default');

  const get = await call(admin.getSettings, { user: adminUser() });
  check(!get.error && get.status === 200, `GET /settings succeeds${errMsg(get)}`);
  const d = get.body?.data?.dispatch;
  eq(d?.previewRadiusKm, 10, 'GET response: previewRadiusKm');
  eq(d?.round1RadiusKm, 10, 'GET response: round1RadiusKm');
  eq(d?.round2RadiusKm, 12, 'GET response: round2RadiusKm');
  eq(d?.round3RadiusKm, 15, 'GET response: round3RadiusKm');
  eq(d?.assignRadiusKm, 10, 'GET response: assignRadiusKm');
  eq(d?.locationFreshnessSeconds, 300, 'GET response: locationFreshnessSeconds');

  // Helpers with defaults (no persisted dispatch yet — cache holds DEFAULTS)
  eq(await getSearchRadiusKm({ phase: 'preview' }), 10, 'helper preview = 10');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 0 }), 10, 'helper round1 = 10');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 1 }), 12, 'helper round2 = 12');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 2 }), 15, 'helper round3 = 15');
  eq(await getSearchRadiusKm({ phase: 'assign' }), 10, 'helper assign = 10');
  eq(await getLocationMaxAgeMs(), 300_000, 'helper freshness = 300s in ms');
  eq(await resolveDispatchSearchRadiusKm({ attempts: 0 }), 10, 'resolveDispatch attempts 0');
  eq(await resolveDispatchSearchRadiusKm({ attempts: 1 }), 12, 'resolveDispatch attempts 1');
  eq(await resolveDispatchSearchRadiusKm({ attempts: 5 }), 15, 'resolveDispatch attempts 5');

  // Compile-time exports still exist as fallbacks
  eq(RIDER_PREVIEW_SEARCH_RADIUS_KM, 10, 'export RIDER_PREVIEW');
  eq(RIDER_MATCH_SEARCH_RADIUS_KM, 10, 'export RIDER_MATCH');
  eq(DISPATCH_RADIUS_ROUND_2_KM, 10, 'export ROUND_2 (compile-time fallback)');
  eq(DISPATCH_RADIUS_ROUND_3_KM, 10, 'export ROUND_3 (compile-time fallback)');
  eq(ASSIGN_NEW_DRIVER_RADIUS_KM, 10, 'export ASSIGN');
  eq(DRIVER_LOCATION_MAX_AGE_MS, 300_000, 'export DRIVER_LOCATION_MAX_AGE_MS');
}

console.log('\nB. validateDispatchUpdate rejects bad input');
{
  const badRange = validateDispatchUpdate({ previewRadiusKm: 0 });
  check(!!badRange.error && /previewRadiusKm/.test(badRange.error), 'preview 0 is rejected');
  const badHigh = validateDispatchUpdate({ round3RadiusKm: 51 });
  check(!!badHigh.error && /round3RadiusKm/.test(badHigh.error), 'round3 51 is rejected');
  const badFresh = validateDispatchUpdate({ locationFreshnessSeconds: 30 });
  check(!!badFresh.error && /locationFreshnessSeconds/.test(badFresh.error), 'freshness 30 is rejected');
  const badOrder = validateDispatchUpdate({ round1RadiusKm: 15, round2RadiusKm: 10, round3RadiusKm: 30 });
  check(!!badOrder.error && /round1RadiusKm/.test(badOrder.error), 'round1 > round2 is rejected');
  const badFloat = validateDispatchUpdate({ assignRadiusKm: 10.5 });
  check(!!badFloat.error, 'non-integer is rejected');
  const ok = validateDispatchUpdate({
    previewRadiusKm: 8,
    round1RadiusKm: 8,
    round2RadiusKm: 15,
    round3RadiusKm: 25,
    assignRadiusKm: 12,
    locationFreshnessSeconds: 180,
  });
  check(!ok.error && ok.value.round2RadiusKm === 15, 'valid update returns merged value');
}

console.log('\nC. updateSettings: 400 on bad dispatch, persist on good');
{
  const bad = await call(admin.updateSettings, {
    user: adminUser(),
    body: { dispatch: { round1RadiusKm: 20, round2RadiusKm: 5, round3RadiusKm: 30 } },
  });
  check(!!bad.error, `round1 > round2 → error${errMsg(bad)}`);
  eq(bad.error?.statusCode, 400, '... statusCode 400');

  const oob = await call(admin.updateSettings, {
    user: adminUser(),
    body: { dispatch: { previewRadiusKm: 99 } },
  });
  check(!!oob.error && oob.error?.statusCode === 400, `preview 99 → 400${errMsg(oob)}`);

  const good = await call(admin.updateSettings, {
    user: adminUser(),
    body: {
      dispatch: {
        previewRadiusKm: 7,
        round1RadiusKm: 7,
        round2RadiusKm: 14,
        round3RadiusKm: 21,
        assignRadiusKm: 9,
        locationFreshnessSeconds: 120,
      },
    },
  });
  check(!good.error && good.status === 200, `valid dispatch PATCH succeeds${errMsg(good)}`);
  eq(good.body?.data?.dispatch?.round2RadiusKm, 14, 'response includes saved round2');

  invalidateCache();
  const s = await getSettings();
  eq(s.dispatch.previewRadiusKm, 7, 'persisted preview');
  eq(s.dispatch.round1RadiusKm, 7, 'persisted round1');
  eq(s.dispatch.round2RadiusKm, 14, 'persisted round2');
  eq(s.dispatch.round3RadiusKm, 21, 'persisted round3');
  eq(s.dispatch.assignRadiusKm, 9, 'persisted assign');
  eq(s.dispatch.locationFreshnessSeconds, 120, 'persisted freshness');

  eq(await getSearchRadiusKm({ phase: 'preview' }), 7, 'helper reads preview 7');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 0 }), 7, 'helper reads round1 7');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 1 }), 14, 'helper reads round2 14');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 2 }), 21, 'helper reads round3 21');
  eq(await getSearchRadiusKm({ phase: 'assign' }), 9, 'helper reads assign 9');
  eq(await getLocationMaxAgeMs(), 120_000, 'helper reads freshness 120s');
  eq(await resolveDispatchSearchRadiusKm({ attempts: 1 }), 14, 'resolveDispatch reads 14');
}

console.log('\nD. Fee settings save path accepts dispatch alongside fees/cancellation/arrival/dropoff');
{
  const r = await call(admin.updateSettings, {
    user: adminUser(),
    body: {
      fees: { riderServiceCharge: 100, driverPlatformRate: 0.08 },
      cancellation: { afterAcceptPenalty: 200, gracePeriodSeconds: 60, maxDriverPayoutsPerDay: 3 },
      arrival: { maxRadiusMeters: 150 },
      dropoff: { freeRadiusMeters: 500, confirmRadiusMeters: 3000, liveFixMaxAgeSeconds: 30, riderConfirmWindowSeconds: 120 },
      dispatch: {
        previewRadiusKm: 6,
        round1RadiusKm: 6,
        round2RadiusKm: 12,
        round3RadiusKm: 18,
        assignRadiusKm: 8,
        locationFreshnessSeconds: 240,
      },
      wallet: { minTopupAmount: 500, minWithdrawAmount: 1000, maxDailyWithdrawal: 500000 },
    },
  });
  check(!r.error && r.status === 200, `combined Fee settings PATCH succeeds${errMsg(r)}`);
  eq(r.body?.data?.dispatch?.previewRadiusKm, 6, 'combined save: dispatch preview');
  eq(r.body?.data?.dropoff?.freeRadiusMeters, 500, 'combined save: dropoff still present');
  eq(r.body?.data?.fees?.riderServiceCharge, 100, 'combined save: fees still present');

  invalidateCache();
  eq((await getSettings()).dispatch.round3RadiusKm, 18, 'combined save: helpers see round3 18');
  eq(await getSearchRadiusKm({ phase: 'dispatch', attempts: 2 }), 18, 'helper after combined save');
}

} catch (e) { failed++; console.log('  FAIL script error:', e.stack || e); }

console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
