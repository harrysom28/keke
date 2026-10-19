/**
 * End-to-end checks for ending a trip near (or far from) the destination, against a REAL MongoDB
 * (replica set preferred). Calls the actual controllers with fake req/res objects.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_flows_test?replicaSet=rs0' node scripts/verifyDropoffCompletion.js
 *
 * Safety: refuses to run unless the connected database name contains "test" (it empties every collection), and
 * refuses FerretDB and other servers that are not real MongoDB.
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
const User = await M('../src/models/User.js');
const Driver = await M('../src/models/Driver.js');
const UserWallet = await M('../src/models/UserWallet.js');
const UserWalletTransaction = await M('../src/models/UserWalletTransaction.js');
const Ride = await M('../src/models/Ride.js');
const Payment = await M('../src/models/Payment.js');
const AdminSettings = await M('../src/models/AdminSettings.js');
const Notification = await M('../src/models/Notification.js');
const SupportTicket = await M('../src/models/SupportTicket.js');
const DriverWallet = await M('../src/models/DriverWallet.js');
const driverCtl = await import('../src/controllers/driverController.js');
const rideCtl = await import('../src/controllers/rideController.js');
const admin = await import('../src/controllers/adminController.js');
const { validationRules } = await import('../src/middleware/validation.js');
const { validationResult } = await import('express-validator');
const { creditRiderBalance } = await import('../src/services/riderBalanceService.js');
const { holdRideFunds } = await import('../src/services/escrowWalletService.js');
const { getSettings, invalidateCache, validateDropoffUpdate } = await import('../src/services/settingsService.js');
const { calculateDistanceMeters } = await import('../src/utils/geolocation.js');

let passed = 0, failed = 0;
const check = (c, m) => { if (c) { passed++; console.log('  ok  ', m); } else { failed++; console.log('  FAIL', m); } };
const eq = (a, b, m) => check(a === b, `${m} (got ${a}, want ${b})`);
const near = (a, b, tol, m) => check(typeof a === 'number' && Math.abs(a - b) <= tol, `${m} (got ${a}, want ~${b})`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mongoose.connect(uri);
const dbName = mongoose.connection.db.databaseName;
if (!/test/i.test(dbName)) {
  console.error(`Refusing to run: connected database "${dbName}" does not contain "test".`);
  await mongoose.disconnect();
  process.exit(2);
}
const bi = await mongoose.connection.db.admin().command({ buildInfo: 1 });
if (bi.ferretdbVersion) {
  console.error('Refusing to run on FerretDB: these checks need real MongoDB (atomic updates, transactions).');
  await mongoose.disconnect();
  process.exit(2);
}
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
const hasTransactions = !!hello.setName || hello.msg === 'isdbgrid';
console.log(`MongoDB ${bi.version} on database ${dbName} (${hasTransactions ? 'replica set: transaction paths ARE exercised' : 'standalone: transaction paths are NOT exercised'})`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
await UserWallet.collection.createIndex({ userId: 1 }, { unique: true });
await UserWalletTransaction.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
for (const m of [UserWallet, UserWalletTransaction, Payment, User, Ride, Driver, DriverWallet, Notification, SupportTicket]) await m.createCollection().catch(() => {});

try {
// ── helpers ──────────────────────────────────────────────────────────────────
const DEST = { lat: 6.4, lng: 7.6 }; // ride dropoff is [7.6, 6.4] (lng, lat)
const M_PER_DEG = 111195;
const north = (meters) => ({ lat: DEST.lat + meters / M_PER_DEG, lng: DEST.lng });
const fix = (meters, o = {}) => ({ ...north(meters), accuracy: 10, capturedAt: Date.now(), mocked: false, ...o });

let seq = 0;
const makeRider = async () => {
  const u = await User.create({ name: `Rider ${++seq}`, phone: `+234800${String(Date.now()).slice(-6)}${seq}`, role: 'passenger' });
  await sleep(120); // post-save hook creates the wallet
  return u;
};
const makeDriver = async ({ at = undefined, ageMs = 1000 } = {}) => {
  const u = await User.create({ name: `Driver ${++seq}`, phone: `+234700${String(Date.now()).slice(-6)}${seq}`, role: 'driver' });
  const p = at === undefined ? null : north(at);
  const d = await Driver.create({
    user: u._id,
    licenseNumber: `LIC${Date.now()}${seq}`,
    licenseExpiry: new Date(Date.now() + 1e10),
    vehicleDetails: { make: 'Bajaj', model: 'RE', year: 2020, plateNumber: `KEKE${Date.now()}${seq}`, color: 'yellow', vehicleType: new mongoose.Types.ObjectId() },
    isOnline: true,
    isAvailable: false,
    currentLocation: { type: 'Point', coordinates: p ? [p.lng, p.lat] : [0, 0], lastUpdated: new Date(Date.now() - ageMs) },
  });
  return d;
};
const makeTrip = (rider, driver, extra = {}) => Ride.create({
  rider: rider._id || rider, driver: driver._id, vehicleType: new mongoose.Types.ObjectId(),
  pickupLocation: { coordinates: [7.5, 6.3], address: 'A' }, dropoffLocation: { coordinates: [DEST.lng, DEST.lat], address: 'B' },
  status: 'in-progress', isRideStarted: true, acceptedByDriver: true, startedAt: new Date(),
  paymentMethod: 'cash', paymentStatus: 'pending', fare: { totalFare: 500, riderChargeTotal: 500 }, ...extra,
});
// A real wallet ride: fare + service charge is held in escrow when the ride is booked, settled when it ends.
const makeHeldWalletTrip = async (rider, driver) => {
  const ride = await makeTrip(rider, driver, { paymentMethod: 'wallet', paymentStatus: 'pending' });
  await holdRideFunds(rider._id, ride._id, 500);
  await Ride.updateOne({ _id: ride._id }, { $set: { paymentStatus: 'held' } });
  return ride;
};
const walletState = async (id) => { const w = await UserWallet.findOne({ userId: id }).lean(); return { available: w?.availableBalance, held: w?.heldBalance }; };
const call = (handler, req) => new Promise((resolve) => {
  // asyncHandler() does not return its promise, so wait for the response or next(err) instead.
  const out = { status: 200, body: null, error: null };
  const done = () => setTimeout(() => resolve(out), 0);
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; done(); return this; }, set() { return this; }, send(b) { out.body = b; done(); return this; } };
  setTimeout(() => { out.error = new Error('handler timed out'); resolve(out); }, 20000).unref();
  handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req }, res, (e) => { out.error = e || null; done(); });
});
const errMsg = (r) => (r.error ? ` [${r.error.message}]` : '');
const endTrip = (driver, ride, body = {}) => call(driverCtl.completeRide, { user: { _id: driver.user }, body: { rideId: ride._id.toString(), dropoff_flow: 2, ...body } });
// Old app builds never send dropoff_flow.
const endTripOld = (driver, ride, body = {}) => call(driverCtl.completeRide, { user: { _id: driver.user }, body: { rideId: ride._id.toString(), ...body } });
const askRider = (driver, ride, body = {}) => call(driverCtl.requestDropoffConfirm, { user: { _id: driver.user }, body: { rideId: ride._id.toString(), ...body } });
const riderAnswer = (rider, ride, confirmed) => call(rideCtl.confirmDropoff, { user: { _id: rider._id }, params: { rideId: ride._id.toString() }, body: { confirmed } });
const reload = (ride) => Ride.findById(ride._id).lean();
const payments = (ride) => Payment.countDocuments({ ride: ride._id });
const notes = (rider, key, ride) => Notification.countDocuments({ target_user_id: rider._id, event_key: key, ...(ride ? { ride_id: ride._id } : {}) });
const walletOf = async (id) => (await UserWallet.findOne({ userId: id }).lean())?.availableBalance;
const adminUser = () => ({ _id: new mongoose.Types.ObjectId(), email: 'a@keke.test' });
const setDropoff = async (dropoff) => {
  const r = await call(admin.updateSettings, { user: adminUser(), body: { dropoff } });
  invalidateCache();
  return r;
};
const runRules = async (rules, body) => {
  const req = { query: {}, params: {}, headers: {}, body };
  for (const c of rules) { if (c?.run) await c.run(req); }
  return validationResult(req);
};

await setDropoff({ freeRadiusMeters: 500, confirmRadiusMeters: 3000, liveFixMaxAgeSeconds: 30, riderConfirmWindowSeconds: 120 });
{
  const s = (await getSettings()).dropoff;
  eq(s.freeRadiusMeters, 500, 'settings: free radius default applied'); eq(s.confirmRadiusMeters, 3000, 'settings: confirm radius default applied');
}

console.log('\nA. Tier 1: close enough ends the trip with no friction');
{
  const rider = await makeRider(); const driver = await makeDriver({ at: 100 });
  const ride = await makeTrip(rider, driver);
  const r = await endTrip(driver, ride, { location: fix(100) });
  check(!r.error && r.status === 200, `ends at 100 m${errMsg(r)}`);
  const d = await reload(ride);
  eq(d.status, 'completed', 'ride completed'); eq(d.dropoff_proximity_status, 'confirmed', 'proximity confirmed');
  near(d.dropoff_distance_from_destination, 100, 3, 'distance recorded'); eq(d.dropoff_distance_source, 'live', 'source is the live fix');
  eq(d.flag ?? null, null, 'no flag'); eq(d.completed_by, 'driver', 'completed by driver'); eq(d.dropoff_end_reason ?? null, null, 'no reason stored');
  eq(await notes(rider, 'dropoff_review'), 0, 'rider is not sent a review prompt');
  eq(await payments(ride), 1, 'payment processed once');
  eq(d.statusHistory.filter((h) => h.status === 'completed').length, 1, 'one completed history row');

  // edge of the free radius (500 m)
  const d2 = await makeDriver({ at: 498 }); const ride2 = await makeTrip(rider, d2);
  const r2 = await endTrip(d2, ride2, { location: fix(498) });
  check(!r2.error && r2.status === 200, `ends at 498 m (inside 500)${errMsg(r2)}`);
  eq((await reload(ride2)).dropoff_proximity_status, 'confirmed', '498 m is confirmed');
  const d3 = await makeDriver({ at: 503 }); const ride3 = await makeTrip(rider, d3);
  const r3 = await endTrip(d3, ride3, { location: fix(503) });
  eq(r3.status, 409, '503 m (outside 500) is refused without a reason'); eq(r3.body?.code, 'DROPOFF_REASON_REQUIRED', '... with the reason code');

  // saved location only (no live fix in the request)
  const d4 = await makeDriver({ at: 300 }); const ride4 = await makeTrip(rider, d4);
  const r4 = await endTrip(d4, ride4);
  check(!r4.error && r4.status === 200, `ends from the saved location${errMsg(r4)}`);
  const x4 = await reload(ride4);
  eq(x4.dropoff_distance_source, 'saved', 'source is saved'); near(x4.dropoff_distance_from_destination, 300, 3, 'saved distance'); eq(x4.flag ?? null, null, 'no flag for a saved-only end');
}

console.log('\nA2. accuracy widens the free radius (and radii are changeable from admin without a deploy)');
{
  const set = await setDropoff({ freeRadiusMeters: 100, confirmRadiusMeters: 3000 });
  check(!set.error, `admin accepts free radius 100${errMsg(set)}`);
  eq((await getSettings()).dropoff.freeRadiusMeters, 100, 'new radius is read by the server');
  const rider = await makeRider();
  // accuracy 120 -> free limit max(100, 170) = 170
  const a = await makeDriver({ at: 168 }); const rideA = await makeTrip(rider, a);
  const rA = await endTrip(a, rideA, { location: fix(168, { accuracy: 120 }) });
  check(!rA.error && rA.status === 200, `168 m with accuracy 120 is free${errMsg(rA)}`);
  eq((await reload(rideA)).dropoff_proximity_status, 'confirmed', '... and confirmed');
  const b = await makeDriver({ at: 173 }); const rideB = await makeTrip(rider, b);
  const rB = await endTrip(b, rideB, { location: fix(173, { accuracy: 120 }) });
  eq(rB.body?.code, 'DROPOFF_REASON_REQUIRED', '173 m with accuracy 120 is outside the widened radius');
  near(rB.body?.free_radius_meters, 170, 0, 'error body reports the widened free radius'); eq(rB.body?.confirm_radius_meters, 3000, 'error body reports the confirm radius');
  // accuracy 10 -> free limit 100: 150 m needs a reason
  const c = await makeDriver({ at: 150 }); const rideC = await makeTrip(rider, c);
  const rC = await endTrip(c, rideC, { location: fix(150, { accuracy: 10 }) });
  eq(rC.body?.code, 'DROPOFF_REASON_REQUIRED', '150 m with good accuracy needs a reason when free=100');
  // accuracy 200 is not trusted: the live fix is dropped and the saved location (20 m) is used instead
  const e = await makeDriver({ at: 20 }); const rideE = await makeTrip(rider, e);
  const rE = await endTrip(e, rideE, { location: fix(168, { accuracy: 200 }) });
  check(!rE.error && rE.status === 200, `accuracy 200 fix is not used${errMsg(rE)}`);
  const xE = await reload(rideE);
  eq(xE.dropoff_distance_source, 'saved', 'accuracy 200 -> falls back to saved'); near(xE.dropoff_distance_from_destination, 20, 3, 'distance is the saved one');
  // invalid ranges are refused
  const bad = await setDropoff({ freeRadiusMeters: 50 });
  check(!!bad.error, 'free radius below 100 is refused');
  await setDropoff({ freeRadiusMeters: 500, confirmRadiusMeters: 3000 });
  eq((await getSettings()).dropoff.freeRadiusMeters, 500, 'radius restored');
}

console.log('\nB. Tier 2: between the radii the driver must give a reason');
{
  const rider = await makeRider(); const driver = await makeDriver({ at: 1200 });
  const ride = await makeTrip(rider, driver);
  const r = await endTrip(driver, ride, { location: fix(1200) });
  eq(r.status, 409, 'no reason -> 409'); eq(r.body?.code, 'DROPOFF_REASON_REQUIRED', 'code DROPOFF_REASON_REQUIRED');
  near(r.body?.distance_meters, 1200, 3, 'distance_meters in the body'); eq(r.body?.free_radius_meters, 500, 'free_radius_meters in the body'); eq(r.body?.confirm_radius_meters, 3000, 'confirm_radius_meters in the body');
  const before = await reload(ride);
  eq(before.status, 'in-progress', 'ride unchanged (still in progress)'); eq(before.flag ?? null, null, 'no flag written'); eq(before.dropoff_proximity_status ?? null, null, 'no proximity written');
  eq(await payments(ride), 0, 'nothing paid'); eq(await notes(rider, 'dropoff_review'), 0, 'rider not notified yet');

  const bad = await runRules(validationRules.completeRide, { rideId: ride._id.toString(), reason: 'because' });
  check(!bad.isEmpty(), 'validation rejects an unknown reason');
  const good = await runRules(validationRules.completeRide, { rideId: ride._id.toString(), reason: 'road_blocked', location: fix(10) });
  check(good.isEmpty(), 'validation accepts a known reason and a well-formed location');
  const badLoc = await runRules(validationRules.completeRide, { rideId: ride._id.toString(), location: { lat: 'x', lng: 7 } });
  check(!badLoc.isEmpty(), 'validation rejects a malformed location');

  const r2 = await endTrip(driver, ride, { location: fix(1200), reason: 'pin_inaccurate' });
  check(!r2.error && r2.status === 200, `with a reason the trip ends${errMsg(r2)}`);
  const d = await reload(ride);
  eq(d.status, 'completed', 'completed'); eq(d.dropoff_proximity_status, 'unlikely', 'status unlikely'); eq(d.flag, 'dropoff_far_from_destination', 'flagged far from destination');
  eq(d.dropoff_end_reason, 'pin_inaccurate', 'reason stored'); near(d.dropoff_distance_from_destination, 1200, 3, 'distance stored');
  eq(await notes(rider, 'dropoff_review', ride), 1, 'rider notified (dropoff_review)'); eq(await payments(ride), 1, 'paid once');

  // rider can still confirm
  const c1 = await riderAnswer(rider, ride, true);
  check(!c1.error, `rider confirms${errMsg(c1)}`);
  const afterC = await reload(ride);
  eq(afterC.flag ?? null, null, 'confirm clears the far flag'); eq(afterC.dropoff_rider_response, 'confirmed', 'response recorded'); check(!!afterC.dropoff_rider_responded_at, 'response time recorded');
  const c2 = await riderAnswer(rider, ride, false);
  check(!c2.error && c2.body?.data?.noop === true, 'second answer is a no-op');
  const afterC2 = await reload(ride);
  eq(afterC2.dropoff_rider_response, 'confirmed', 'a later dispute cannot overwrite the answer'); eq(afterC2.flag ?? null, null, 'flag still clear');
  eq(await payments(ride), 1, 'still paid once');

  // rider can dispute instead
  const driverB = await makeDriver({ at: 1500 }); const rideB = await makeTrip(rider, driverB);
  await endTrip(driverB, rideB, { location: fix(1500), reason: 'other' });
  const stranger = await makeRider();
  const sx = await riderAnswer(stranger, rideB, false);
  check(!!sx.error, 'another rider cannot answer for this ride'); eq((await reload(rideB)).dropoff_rider_response ?? null, null, '... and nothing changed');
  const dsp = await riderAnswer(rider, rideB, false);
  check(!dsp.error, `rider disputes${errMsg(dsp)}`);
  const dB = await reload(rideB);
  eq(dB.dropoff_rider_response, 'disputed', 'disputed recorded'); eq(dB.flag, 'dropoff_disputed', 'flag dropoff_disputed');
  eq(await SupportTicket.countDocuments({ ride: rideB._id }), 1, 'admins get a support ticket');
  const dsp2 = await riderAnswer(rider, rideB, false);
  check(!dsp2.error && dsp2.body?.data?.noop === true, 'repeat dispute is a no-op'); eq(await SupportTicket.countDocuments({ ride: rideB._id }), 1, 'still one ticket');
  await riderAnswer(rider, rideB, true);
  eq((await reload(rideB)).dropoff_rider_response, 'disputed', 'confirm after dispute does not undo it');

  // an unanswered Tier 2 trip stays flagged for admins
  const driverU = await makeDriver({ at: 2000 }); const rideU = await makeTrip(rider, driverU);
  await endTrip(driverU, rideU, { location: fix(2000), reason: 'road_blocked' });
  eq((await reload(rideU)).flag, 'dropoff_far_from_destination', 'unanswered: stays flagged until the rider responds');
}

console.log('\nC. Tier 3: the rider must confirm');
{
  const rider = await makeRider(); const driver = await makeDriver({ at: 5000 });
  const ride = await makeTrip(rider, driver);
  const r = await endTrip(driver, ride, { location: fix(5000) });
  eq(r.status, 409, '5 km -> 409'); eq(r.body?.code, 'DROPOFF_TOO_FAR', 'code DROPOFF_TOO_FAR');
  near(r.body?.distance_meters, 5000, 5, 'distance_meters'); eq(r.body?.confirm_radius_meters, 3000, 'confirm radius in body');
  const r2 = await endTrip(driver, ride, { location: fix(5000), reason: 'other' });
  eq(r2.body?.code, 'DROPOFF_TOO_FAR', 'a reason does not bypass Tier 3');
  const d0 = await reload(ride);
  eq(d0.status, 'in-progress', 'ride unchanged'); eq(await payments(ride), 0, 'nothing paid'); eq(d0.flag ?? null, null, 'no flag written');

  const early = await riderAnswer(rider, ride, true);
  eq(early.error?.code, 'DROPOFF_CONFIRM_NOT_REQUESTED', 'rider cannot end a trip nobody asked about'); eq((await reload(ride)).status, 'in-progress', '... still in progress');

  const ask = await askRider(driver, ride, { location: fix(5000) });
  check(!ask.error, `driver asks the rider to confirm${errMsg(ask)}`);
  check(!!(await reload(ride)).dropoff_confirm_requested_at, 'request time recorded');
  eq(await notes(rider, 'dropoff_confirm_request', ride), 1, 'rider got the confirm request');
  const ask2 = await askRider(driver, ride, { location: fix(5000) });
  eq(ask2.error?.statusCode, 429, 'asking again within 60 s is rate limited'); eq(await notes(rider, 'dropoff_confirm_request', ride), 1, '... and no second push');

  const other = await makeDriver({ at: 5000 });
  const askOther = await askRider(other, ride, { location: fix(5000) });
  check(!!askOther.error, 'a different driver cannot ask');

  const near1 = await makeDriver({ at: 100 }); const rideNear = await makeTrip(rider, near1);
  const askNear = await askRider(near1, rideNear, { location: fix(100) });
  eq(askNear.error?.code, 'DROPOFF_CONFIRM_NOT_NEEDED', 'cannot ask the rider when already close enough'); eq((await reload(rideNear)).dropoff_confirm_requested_at ?? null, null, '... nothing recorded');

  const no = await riderAnswer(rider, ride, false);
  check(!no.error && no.body?.data?.declined === true, '"Not yet" is acknowledged'); eq((await reload(ride)).status, 'in-progress', '... trip keeps going');

  const yes = await riderAnswer(rider, ride, true);
  check(!yes.error, `rider confirms${errMsg(yes)}`);
  const d1 = await reload(ride);
  eq(d1.status, 'completed', 'trip ended'); eq(d1.completed_by, 'driver', 'completed_by driver'); eq(d1.dropoff_rider_response, 'confirmed', 'response confirmed');
  eq(d1.dropoff_proximity_status, 'unlikely', 'proximity unlikely'); near(d1.dropoff_distance_from_destination, 5000, 5, 'distance kept from the request');
  eq(d1.flag ?? null, null, 'rider vouched: no far flag'); eq(await payments(ride), 1, 'paid exactly once');
  eq(d1.statusHistory.filter((h) => h.status === 'completed').length, 1, 'one completed history row');
  const again = await riderAnswer(rider, ride, true);
  check(!again.error && again.body?.data?.noop === true, 'second confirm is a no-op'); eq(await payments(ride), 1, 'still paid once');
  const late = await endTrip(driver, ride, { location: fix(5000) });
  check(!!late.error, 'driver tapping End Trip afterwards is refused'); eq(await payments(ride), 1, 'still paid once');

  // two simultaneous confirmations complete once
  const driverP = await makeDriver({ at: 4000 }); const rideP = await makeTrip(rider, driverP);
  await askRider(driverP, rideP, { location: fix(4000) });
  const [p1, p2] = await Promise.all([riderAnswer(rider, rideP, true), riderAnswer(rider, rideP, true)]);
  check(!p1.error && !p2.error, `both parallel confirms answer cleanly${errMsg(p1)}${errMsg(p2)}`);
  eq(await payments(rideP), 1, 'parallel confirms pay once'); eq((await reload(rideP)).status, 'completed', 'completed');

  // after the window: refused
  const driverW = await makeDriver({ at: 4000 }); const rideW = await makeTrip(rider, driverW);
  await askRider(driverW, rideW, { location: fix(4000) });
  await Ride.updateOne({ _id: rideW._id }, { $set: { dropoff_confirm_requested_at: new Date(Date.now() - 10 * 60 * 1000) } });
  const exp = await riderAnswer(rider, rideW, true);
  eq(exp.error?.code, 'DROPOFF_CONFIRM_EXPIRED', 'confirm after the window is refused');
  eq((await reload(rideW)).status, 'in-progress', '... trip still in progress'); eq(await payments(rideW), 0, '... nothing paid');

  // a tighter window from admin settings takes effect without a deploy
  await setDropoff({ riderConfirmWindowSeconds: 30 });
  const driverT = await makeDriver({ at: 4000 }); const rideT = await makeTrip(rider, driverT);
  await askRider(driverT, rideT, { location: fix(4000) });
  await Ride.updateOne({ _id: rideT._id }, { $set: { dropoff_confirm_requested_at: new Date(Date.now() - 45 * 1000) } });
  eq((await riderAnswer(rider, rideT, true)).error?.code, 'DROPOFF_CONFIRM_EXPIRED', '45 s old request is expired with a 30 s window');
  await setDropoff({ riderConfirmWindowSeconds: 120 });

  // wallet ride (escrow): settled exactly once when the rider confirms
  const wr = await makeRider(); await creditRiderBalance(wr._id, 1000, { type: 'topup' });
  const driverQ = await makeDriver({ at: 4500 }); const rideQ = await makeHeldWalletTrip(wr, driverQ);
  const heldBefore = await walletState(wr._id);
  eq(heldBefore.held, 600, 'escrow: fare + service charge held before the trip ends');
  await askRider(driverQ, rideQ, { location: fix(4500) });
  await riderAnswer(wr, rideQ, true);
  const afterQ = await walletState(wr._id);
  eq(afterQ.held, 0, 'escrow: hold released after rider confirmation'); eq(await payments(rideQ), 1, 'escrow: one Payment row'); eq((await reload(rideQ)).paymentStatus, 'completed', 'escrow: ride settled');
  await riderAnswer(wr, rideQ, true);
  const afterQ2 = await walletState(wr._id);
  eq(afterQ2.available, afterQ.available, 'escrow: repeat confirm moves no money'); eq(await payments(rideQ), 1, 'escrow: still one Payment row');
}

console.log('\nD. Positions the server will not trust');
{
  const rider = await makeRider();
  // stale live fix (60 s old) -> saved location is used, ride flagged
  const a = await makeDriver({ at: 100 }); const rideA = await makeTrip(rider, a);
  const rA = await endTrip(a, rideA, { location: fix(10, { capturedAt: Date.now() - 60 * 1000 }) });
  check(!rA.error && rA.status === 200, `stale fix: trip may end${errMsg(rA)}`);
  const xA = await reload(rideA);
  eq(xA.flag, 'dropoff_unverified', 'stale fix: flagged dropoff_unverified'); eq(xA.dropoff_distance_source, 'saved', 'stale fix: saved location used'); near(xA.dropoff_distance_from_destination, 100, 3, 'stale fix: distance from the saved one');

  // mocked fix -> ignored, flagged
  const b = await makeDriver({ at: 300 }); const rideB = await makeTrip(rider, b);
  const rB = await endTrip(b, rideB, { location: fix(10, { mocked: true }) });
  check(!rB.error && rB.status === 200, `mocked fix: trip may end${errMsg(rB)}`);
  const xB = await reload(rideB);
  eq(xB.flag, 'dropoff_unverified', 'mocked: flagged'); eq(xB.dropoff_distance_source, 'saved', 'mocked: saved location used'); near(xB.dropoff_distance_from_destination, 300, 3, 'mocked: the fake 10 m is ignored');

  // mocked cannot be used to end far away
  const b2 = await makeDriver({ at: 5000 }); const rideB2 = await makeTrip(rider, b2);
  const rB2 = await endTrip(b2, rideB2, { location: fix(0, { mocked: true }) });
  eq(rB2.body?.code, 'DROPOFF_TOO_FAR', 'mocked pin-on-destination cannot end a trip 5 km away'); eq((await reload(rideB2)).status, 'in-progress', '... trip unchanged');

  // live fix 5 km from a fresh saved location -> ignored, flagged
  const c = await makeDriver({ at: 100, ageMs: 5000 }); const rideC = await makeTrip(rider, c);
  const rC = await endTrip(c, rideC, { location: fix(5100) });
  check(!rC.error && rC.status === 200, `jumping fix: trip may end${errMsg(rC)}`);
  const xC = await reload(rideC);
  eq(xC.flag, 'dropoff_unverified', 'jump: flagged'); eq(xC.dropoff_distance_source, 'saved', 'jump: saved location used'); near(xC.dropoff_distance_from_destination, 100, 3, 'jump: distance from the saved one');
  // ...and a fake "I'm at the pin" jump cannot end a trip that is really 5 km away
  const c2 = await makeDriver({ at: 5000, ageMs: 5000 }); const rideC2 = await makeTrip(rider, c2);
  const rC2 = await endTrip(c2, rideC2, { location: fix(10) });
  eq(rC2.body?.code, 'DROPOFF_TOO_FAR', 'jump to the pin is ignored: still too far'); eq(await payments(rideC2), 0, '... nothing paid');

  // saved position too old and no live fix -> unverifiable, ends, flagged
  const d = await makeDriver({ at: 100, ageMs: 10 * 60 * 1000 }); const rideD = await makeTrip(rider, d);
  const rD = await endTrip(d, rideD);
  check(!rD.error && rD.status === 200, `stale saved position: trip may end${errMsg(rD)}`);
  const xD = await reload(rideD);
  eq(xD.flag, 'dropoff_unverified', 'unverifiable: flagged'); eq(xD.dropoff_proximity_status, 'unverifiable', 'status unverifiable'); eq(xD.dropoff_distance_from_destination ?? null, null, 'no distance recorded');

  // no location at all
  const e = await makeDriver(); const rideE = await makeTrip(rider, e);
  const rE = await endTrip(e, rideE);
  check(!rE.error && rE.status === 200, `no location at all: trip may end${errMsg(rE)}`);
  const xE = await reload(rideE);
  eq(xE.flag, 'dropoff_unverified', 'no location: flagged'); eq(xE.status, 'completed', 'no location: completed'); eq(await payments(rideE), 1, 'no location: paid once');

  // a poor-accuracy honest fix is not "suspicious": saved is used, no flag
  const f = await makeDriver({ at: 100 }); const rideF = await makeTrip(rider, f);
  await endTrip(f, rideF, { location: fix(100, { accuracy: 400 }) });
  eq((await reload(rideF)).flag ?? null, null, 'poor accuracy alone does not flag');
}

console.log('\nE. Admin: flag filter and ride details');
{
  const far = await Ride.countDocuments({ flag: 'dropoff_far_from_destination' });
  const unv = await Ride.countDocuments({ flag: 'dropoff_unverified' });
  const dis = await Ride.countDocuments({ flag: 'dropoff_disputed' });
  check(far > 0 && unv > 0 && dis > 0, `test data has all three flags (far ${far}, unverified ${unv}, disputed ${dis})`);
  for (const [flag, n] of [['dropoff_far_from_destination', far], ['dropoff_unverified', unv], ['dropoff_disputed', dis]]) {
    const r = await call(admin.listRides, { user: adminUser(), query: { flag, limit: 100 } });
    check(!r.error && r.body?.data?.rides?.length === n && r.body.data.rides.every((x) => x.flag === flag), `rides list filters ${flag}${errMsg(r)}`);
  }
  const badFlag = await call(admin.listRides, { user: adminUser(), query: { flag: 'bogus' } });
  check(!!badFlag.error, 'unknown flag filter is refused');
  const one = await Ride.findOne({ flag: 'dropoff_disputed' }).lean();
  const det = await call(admin.getRideDetails, { user: adminUser(), params: { id: one._id.toString() } });
  const rr = det.body?.data?.ride;
  check(!det.error && rr?.dropoff_rider_response === 'disputed' && rr?.flag === 'dropoff_disputed' && rr?.dropoff_end_reason === 'other' && rr?.dropoff_proximity_status === 'unlikely' && rr?.dropoff_distance_source === 'live' && rr?.dropoff_distance_from_destination > 1000, `ride details show proximity, distance, source, reason, response and flag${errMsg(det)}`);
}

console.log('\nF. Settings validation');
{
  const cur = { freeRadiusMeters: 500, confirmRadiusMeters: 3000, liveFixMaxAgeSeconds: 30, riderConfirmWindowSeconds: 120 };
  check(!!validateDropoffUpdate({ confirmRadiusMeters: 500 }, cur).error, 'confirm == free is rejected');
  check(!!validateDropoffUpdate({ confirmRadiusMeters: 1200, freeRadiusMeters: 1000 }, cur).error === false, 'confirm 1200 > free 1000 is accepted');
  check(!!validateDropoffUpdate({ freeRadiusMeters: 1000, confirmRadiusMeters: 1000 }, cur).error, 'confirm <= free is rejected (both changed)');
  check(!!validateDropoffUpdate({ freeRadiusMeters: 3500 }, cur).error, 'free above its range is rejected');
  check(!!validateDropoffUpdate({ liveFixMaxAgeSeconds: 5 }, cur).error, 'live fix age below its range is rejected');
  check(!!validateDropoffUpdate({ riderConfirmWindowSeconds: 900 }, cur).error, 'rider window above its range is rejected');
  const viaAdmin = await setDropoff({ freeRadiusMeters: 900, confirmRadiusMeters: 800 });
  check(!!viaAdmin.error, 'admin PATCH rejects confirm <= free');
  const s = (await getSettings()).dropoff;
  eq(s.freeRadiusMeters, 500, 'settings unchanged after the rejected update'); eq(s.confirmRadiusMeters, 3000, 'confirm radius unchanged');
}

console.log('\nG. Refactor regressions: settlement and atomicity');
{
  // cash ride
  const rider = await makeRider(); const driver = await makeDriver({ at: 50 });
  const cash = await makeTrip(rider, driver);
  const r = await endTrip(driver, cash, { location: fix(50) });
  check(!r.error, `cash ride ends${errMsg(r)}`);
  const cd = await reload(cash);
  eq(cd.status, 'completed', 'cash: completed'); eq(cd.paymentStatus, 'cash_collected', 'cash: payment settled as cash collected');
  eq(await payments(cash), 1, 'cash: one Payment row'); eq(r.body?.data?.ride?.status !== undefined, true, 'cash: response carries the formatted ride');
  check(r.body?.data?.fareBreakdown?.baseFare === 500, 'cash: fareBreakdown unchanged');
  eq(await notes(rider, 'ride_completed', cash), 1, 'cash: rider gets the completed push');
  const cashPush = await Notification.countDocuments({ target_user_id: driver.user, event_key: 'cash_collection' });
  eq(cashPush, 1, 'cash: driver gets the collect-cash push');

  // wallet (escrow) ride
  const wr = await makeRider(); await creditRiderBalance(wr._id, 1000, { type: 'topup' });
  const d2 = await makeDriver({ at: 50 }); const wallet = await makeHeldWalletTrip(wr, d2);
  const r2 = await endTrip(d2, wallet, { location: fix(50) });
  check(!r2.error, `wallet ride ends${errMsg(r2)}`);
  const w2 = await walletState(wr._id);
  eq(w2.held, 0, 'wallet: escrow hold released'); eq(await payments(wallet), 1, 'wallet: one Payment row'); eq((await reload(wallet)).paymentStatus, 'completed', 'wallet: ride settled');
  const driverCredit = await DriverWallet.findOne({ driverId: d2._id }).lean();
  check(!!driverCredit && (driverCredit.pendingBalance + driverCredit.availableBalance) > 0, 'wallet: driver earnings credited');

  // double tap: exactly one completion
  const wr2 = await makeRider(); await creditRiderBalance(wr2._id, 1000, { type: 'topup' });
  const d3 = await makeDriver({ at: 50 }); const dbl = await makeHeldWalletTrip(wr2, d3);
  const [x, y] = await Promise.all([endTrip(d3, dbl, { location: fix(50) }), endTrip(d3, dbl, { location: fix(50) })]);
  eq([x, y].filter((q) => !q.error && q.status === 200).length, 1, 'double tap: exactly one succeeds'); eq([x, y].filter((q) => !!q.error).length, 1, 'double tap: the other is refused');
  eq(await payments(dbl), 1, 'double tap: one Payment row'); eq((await walletState(wr2._id)).held, 0, 'double tap: hold released once');
  const dc = await DriverWallet.findOne({ driverId: d3._id }).lean();
  check(!!dc && (dc.pendingBalance + dc.availableBalance) > 0 && (dc.pendingBalance + dc.availableBalance) === (driverCredit.pendingBalance + driverCredit.availableBalance), 'double tap: driver credited once (same as the single-tap ride)');

  // not your ride / not in progress still refused
  const other = await makeDriver({ at: 50 });
  check(!!(await endTrip(other, (await makeTrip(rider, driver)), { location: fix(50) })).error, 'another driver cannot end the ride');
  check(!!(await endTrip(driver, cash, { location: fix(50) })).error, 'ending an already completed ride is refused');
}

console.log('\nH. Old app builds (no dropoff_flow) keep the old rules; dropoff_flow: 2 gets the new ones');
{
  const rider = await makeRider();
  const oldTrip = async (at, opts = {}) => { const d = await makeDriver({ at, ...(opts.ageMs ? { ageMs: opts.ageMs } : {}) }); return { d, ride: await makeTrip(rider, d) }; };
  const noNewCodes = (r, m) => check(r.body?.code === undefined && r.error?.code === undefined && !/DROPOFF_/.test(JSON.stringify(r.body ?? {}) + (r.error?.message ?? '')), m);

  // <= 200 m confirmed, <= 500 m probable, <= 1000 m unlikely + flag
  const a = await oldTrip(150);
  const rA = await endTripOld(a.d, a.ride);
  check(!rA.error && rA.status === 200, `old: 150 m ends${errMsg(rA)}`);
  const xA = await reload(a.ride);
  eq(xA.dropoff_proximity_status, 'confirmed', 'old: <= 200 m confirmed'); near(xA.dropoff_distance_from_destination, 150, 3, 'old: distance stored'); eq(xA.flag ?? null, null, 'old: no flag');
  const b = await oldTrip(400);
  await endTripOld(b.d, b.ride);
  const xB = await reload(b.ride);
  eq(xB.dropoff_proximity_status, 'probable', 'old: <= 500 m probable'); eq(xB.flag ?? null, null, 'old: probable has no flag');
  // 700 m: the new flow would ask for a reason; old builds just end, flagged
  const c = await oldTrip(700);
  const rC = await endTripOld(c.d, c.ride);
  check(!rC.error && rC.status === 200, `old: 700 m ends without a reason${errMsg(rC)}`); noNewCodes(rC, 'old: 700 m response carries no DROPOFF_ code');
  const xC = await reload(c.ride);
  eq(xC.status, 'completed', 'old: 700 m completed'); eq(xC.dropoff_proximity_status, 'unlikely', 'old: 500-1000 m unlikely'); eq(xC.flag, 'dropoff_far_from_destination', 'old: flagged far from destination');
  eq(xC.dropoff_end_reason ?? null, null, 'old: no reason stored'); eq(await notes(rider, 'dropoff_review', c.ride), 0, 'old: no rider review prompt'); eq(await payments(c.ride), 1, 'old: paid once');

  // above 1000 m: refused with the old message, ride untouched
  const d = await oldTrip(1200);
  const rD = await endTripOld(d.d, d.ride);
  check(!!rD.error && rD.error.statusCode === 400, 'old: 1.2 km is refused (400)');
  eq(rD.error?.message, 'You are 1.2km from the destination. Please get closer before ending the trip.', 'old: exact old message');
  noNewCodes(rD, 'old: refusal carries no DROPOFF_ code');
  const xD = await reload(d.ride);
  eq(xD.status, 'in-progress', 'old: refused ride unchanged'); eq(xD.flag ?? null, null, 'old: no flag written'); eq(await payments(d.ride), 0, 'old: nothing paid');
  const e = await oldTrip(5000);
  const rE = await endTripOld(e.d, e.ride);
  eq(rE.error?.message, 'You are 5.0km from the destination. Please get closer before ending the trip.', 'old: 5 km refused with the old message'); noNewCodes(rE, 'old: 5 km carries no DROPOFF_ code');

  // old rule ignores a position in the body and a reason
  const f = await oldTrip(1200);
  const rF = await endTripOld(f.d, f.ride, { location: fix(10), reason: 'other' });
  eq(rF.error?.message, 'You are 1.2km from the destination. Please get closer before ending the trip.', 'old: body location and reason are ignored');
  eq((await reload(f.ride)).status, 'in-progress', 'old: still in progress');

  // stale saved position: unverifiable, ends, no flag (as before)
  const g = await oldTrip(100, { ageMs: 10 * 60 * 1000 });
  const rG = await endTripOld(g.d, g.ride);
  check(!rG.error && rG.status === 200, `old: stale position still ends${errMsg(rG)}`);
  const xG = await reload(g.ride);
  eq(xG.dropoff_proximity_status, 'unverifiable', 'old: stale -> unverifiable'); eq(xG.flag ?? null, null, 'old: unverifiable is not flagged'); eq(xG.dropoff_distance_from_destination ?? null, null, 'old: no distance');

  // a body that sends dropoff_flow: 2 gets the new tiers; values below 2 stay old
  const h = await oldTrip(1200);
  const rH = await endTrip(h.d, h.ride);
  eq(rH.body?.code, 'DROPOFF_REASON_REQUIRED', 'new: dropoff_flow 2 at 1.2 km -> reason required');
  const i = await oldTrip(5000);
  eq((await endTrip(i.d, i.ride)).body?.code, 'DROPOFF_TOO_FAR', 'new: dropoff_flow 2 at 5 km -> too far');
  const j = await oldTrip(1200);
  const rJ = await endTripOld(j.d, j.ride, { dropoff_flow: 1 });
  noNewCodes(rJ, 'old: dropoff_flow 1 is still the old flow'); eq(rJ.error?.statusCode, 400, 'old: dropoff_flow 1 refused with the old 400');
  const k = await oldTrip(700);
  const rK = await endTrip(k.d, k.ride, { location: fix(700), reason: 'other' });
  check(!rK.error, `new: dropoff_flow 2 with a reason ends${errMsg(rK)}`); eq((await reload(k.ride)).dropoff_end_reason, 'other', 'new: reason stored');

  // the request body is validated
  const okFlow = await runRules(validationRules.completeRide, { rideId: a.ride._id.toString(), dropoff_flow: 2 });
  check(okFlow.isEmpty(), 'validation accepts dropoff_flow: 2');
  check((await runRules(validationRules.completeRide, { rideId: a.ride._id.toString() })).isEmpty(), 'validation accepts a body without dropoff_flow');
  check(!(await runRules(validationRules.completeRide, { rideId: a.ride._id.toString(), dropoff_flow: 'two' })).isEmpty(), 'validation rejects a non-integer dropoff_flow');
  check(!(await runRules(validationRules.completeRide, { rideId: a.ride._id.toString(), dropoff_flow: 1.5 })).isEmpty(), 'validation rejects a fractional dropoff_flow');

  // settlement is shared: an old-build wallet ride still settles once
  const wr = await makeRider(); await creditRiderBalance(wr._id, 1000, { type: 'topup' });
  const dw = await makeDriver({ at: 50 }); const wride = await makeHeldWalletTrip(wr, dw);
  const [x1, x2] = await Promise.all([endTripOld(dw, wride), endTripOld(dw, wride)]);
  eq([x1, x2].filter((q) => !q.error && q.status === 200).length, 1, 'old: double tap completes once');
  eq(await payments(wride), 1, 'old: wallet ride paid once'); eq((await walletState(wr._id)).held, 0, 'old: escrow released');
}

} catch (e) { failed++; console.log('  FAIL script error:', e.stack || e); }

console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
