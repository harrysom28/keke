/**
 * A Pusher outage / quota failure (403 "daily message limit exceeded", 5xx, timeouts) must NEVER take the API down.
 * Runs against a REAL MongoDB. Calls the real controllers / services with fake req/res objects.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_pusher_test?replicaSet=rs0' node scripts/verifyPusherOutage.js
 *
 * What it proves:
 *   A. safeTrigger(): never rejects, no-op when Pusher is not configured, rate-limited warn logging, bounded time.
 *   B. No bare `.trigger(` call exists in src/ outside safeTrigger (static guard).
 *   C. A real Node process with the production logger + utils/errors.js handlers survives an unhandledRejection AND an
 *      uncaughtException (regression guard for winston `exitOnError`, the thing that actually called process.exit(1)).
 *   D. With pusher.trigger mocked to reject with a 403 RequestError (exactly what Pusher returns):
 *      - every PusherService emitter, the stale-trip job (the boot-time tick), and the ride endpoints
 *        (arrived, start, driver location, complete, chat message, cancel) still succeed,
 *      - zero unhandledRejection events fire anywhere,
 *      - the warn log is rate limited.
 *
 * Safety: refuses to run unless the connected database name contains "test" (it empties every collection), refuses
 * FerretDB. The Pusher client is pointed at a dead local port so nothing here can ever reach the real Pusher.
 */
import mongoose from 'mongoose';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_flow_checks';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_dummy';
// A configured Pusher client that can only ever talk to a dead local port. trigger() is mocked below anyway.
process.env.PUSHER_APP_ID = '1';
process.env.PUSHER_APP_KEY = 'testkey';
process.env.PUSHER_APP_SECRET = 'testsecret';
process.env.PUSHER_CLUSTER = 'mt1';
process.env.PUSHER_HOST = '127.0.0.1';
process.env.PUSHER_PORT = '9';
process.env.PUSHER_SCHEME = 'http';
process.env.PUSHER_TRIGGER_TIMEOUT_MS = '300';
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '../src');

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/test/i.test(uri.split('?')[0].split('/').pop())) {
  console.error('Set TEST_MONGODB_URI to a database whose name contains "test".');
  process.exit(2);
}

// Count (do not die on) unhandled rejections: the whole point is that there must be none.
const unhandled = [];
process.on('unhandledRejection', (e) => { unhandled.push(e); });

const { default: logger } = await import('../src/utils/logger.js');
logger.level = 'error';
// Capture warn lines (logger.level hides them from the console, but safeTrigger still calls logger.warn).
const warns = [];
const realWarn = logger.warn.bind(logger);
logger.warn = (...a) => { warns.push(a.map(String).join(' ')); };
const pusherWarns = () => warns.filter((w) => w.startsWith('Pusher trigger failed'));

const M = async (p) => (await import(p)).default;
const User = await M('../src/models/User.js');
const Driver = await M('../src/models/Driver.js');
const UserWallet = await M('../src/models/UserWallet.js');
const UserWalletTransaction = await M('../src/models/UserWalletTransaction.js');
const Ride = await M('../src/models/Ride.js');
const Payment = await M('../src/models/Payment.js');
const Notification = await M('../src/models/Notification.js');
const SupportTicket = await M('../src/models/SupportTicket.js');
const DriverWallet = await M('../src/models/DriverWallet.js');
const Message = await M('../src/models/Message.js');
const driverCtl = await import('../src/controllers/driverController.js');
const rideCtl = await import('../src/controllers/rideController.js');
const messageCtl = await import('../src/controllers/messageController.js');
const pusherMod = await import('../src/services/pusherService.js');
const { safeTrigger, getPusherService, _resetTriggerFailureLog } = pusherMod;
const { default: staleTripService } = await import('../src/services/staleTripService.js');
const { initializeSocketService } = await import('../src/services/socketService.js');
const PusherLib = (await import('pusher')).default;

let passed = 0, failed = 0;
const check = (c, m) => { if (c) { passed++; console.log('  ok  ', m); } else { failed++; console.log('  FAIL', m); } };
const eq = (a, b, m) => check(a === b, `${m} (got ${a}, want ${b})`);
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
  console.error('Refusing to run on FerretDB: these checks need real MongoDB.');
  await mongoose.disconnect();
  process.exit(2);
}
const hello = await mongoose.connection.db.admin().command({ hello: 1 });
console.log(`MongoDB ${bi.version} on database ${dbName} (${hello.setName ? 'replica set' : 'standalone'})`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
await UserWallet.collection.createIndex({ userId: 1 }, { unique: true });
await UserWalletTransaction.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
for (const m of [UserWallet, UserWalletTransaction, Payment, User, Ride, Driver, DriverWallet, Notification, SupportTicket, Message]) await m.createCollection().catch(() => {});

// ── the mock: exactly what Pusher does once the daily quota is gone ──────────────────────────────────────
const ps = getPusherService();
const real403 = () => new PusherLib.RequestError('Unexpected status code 403', 'https://api-mt1.pusher.com/apps/1/events', undefined, 403, 'The account has exceeded its message limit');
let triggerCalls = 0;
let triggerMode = 'reject403';
ps.pusher.trigger = (channel, event) => {
  triggerCalls++;
  if (triggerMode === 'reject403') return Promise.reject(real403());
  if (triggerMode === 'reject500') return Promise.reject(Object.assign(new Error('boom'), { status: 500 }));
  if (triggerMode === 'throw') throw new Error('sync boom');
  if (triggerMode === 'hang') return new Promise(() => {});
  return Promise.resolve({ status: 200 });
};

const call = (handler, req) => new Promise((resolve) => {
  const out = { status: 200, body: null, error: null };
  const done = () => setTimeout(() => resolve(out), 0);
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; done(); return this; }, set() { return this; }, send(b) { out.body = b; done(); return this; } };
  setTimeout(() => { out.error = new Error('handler timed out'); resolve(out); }, 20000).unref();
  handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req }, res, (e) => { out.error = e || null; done(); });
});
const errMsg = (r) => (r.error ? ` [${r.error.message}]` : '');

try {
console.log('\nA. safeTrigger never rejects, and its logging is rate limited');
{
  _resetTriggerFailureLog(); warns.length = 0; triggerMode = 'reject403';
  const r = await safeTrigger('private.ride.x', 'evt', { a: 1 }).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
  check(r.ok && r.v === false, '403 rejection -> resolves false (does not reject)');
  eq(pusherWarns().length, 1, 'first failure is logged once at warn');
  check(/http-403/.test(pusherWarns()[0] || ''), 'log line names the error type (http-403)');

  const results = await Promise.all(Array.from({ length: 200 }, (_, i) => safeTrigger(`private.ride.${i}`, 'evt', {})));
  check(results.every((v) => v === false), '200 further 403s all resolve false');
  eq(pusherWarns().length, 1, '... and add NO further log lines inside the interval (no flood)');

  triggerMode = 'reject500';
  await safeTrigger('c', 'e', {});
  eq(pusherWarns().length, 2, 'a different error type (500) gets its own line');

  triggerMode = 'throw';
  const t = await safeTrigger('c', 'e', {}).then((v) => ({ ok: true, v }), () => ({ ok: false }));
  check(t.ok && t.v === false, 'synchronous throw from trigger() -> resolves false');

  // time travel past the 60 s window: logs again and reports what it swallowed
  triggerMode = 'reject403';
  const realNow = Date.now;
  Date.now = () => realNow() + 61_000;
  await safeTrigger('c', 'e', {});
  Date.now = realNow;
  const last = pusherWarns().filter((w) => /http-403/.test(w)).pop();
  eq(pusherWarns().filter((w) => /http-403/.test(w)).length, 2, '403 logs again after 60 s');
  check(/200 similar failure\(s\) suppressed/.test(last), `... and says how many it suppressed (${(last || '').match(/\d+ similar/)?.[0]})`);

  triggerMode = 'hang';
  const t0 = Date.now();
  const h = await safeTrigger('c', 'e', {});
  check(h === false && Date.now() - t0 < 2000, `a hung Pusher call gives up after the timeout (${Date.now() - t0} ms)`);

  triggerMode = 'ok';
  eq(await safeTrigger('c', 'e', {}), true, 'success -> resolves true');

  // Not configured: no-op. Needs a fresh process because the client is created at import time.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^PUSHER/.test(k)) delete env[k];
  const code = `const m = await import(${JSON.stringify(path.join(srcDir, 'services/pusherService.js'))});
    const v = await m.safeTrigger('c','e',{}); const s = m.getPusherService();
    const emitted = [s.emitRideStatusUpdate({_id:'1',rider:'2'},'accepted'), s.emitNotification('u',{})];
    console.log(JSON.stringify({ v, hasClient: !!s.pusher, emitted }));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 20000 });
  const line = (child.stdout || '').trim().split('\n').pop();
  let parsed = null; try { parsed = JSON.parse(line); } catch { /* reported below */ }
  check(child.status === 0 && parsed?.v === false && parsed.hasClient === false, `Pusher not configured: safeTrigger and emitters are silent no-ops${child.status === 0 ? '' : ` [${child.stderr?.slice(0, 200)}]`}`);
}

console.log('\nB. static guard: no bare trigger() call outside safeTrigger');
{
  const offenders = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.js')) {
        readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
          if (/\.trigger\(/.test(l) && !/^\s*(\/\/|\*)/.test(l) && !/withTimeout|'pusher\.trigger/.test(l)) offenders.push(`${path.relative(srcDir, p)}:${i + 1}`);
        });
      }
    }
  };
  walk(srcDir);
  check(offenders.length === 1 && offenders[0].startsWith('services/pusherService.js'), `the only pusher.trigger( in src/ is inside safeTrigger (${offenders.join(', ')})`);
}

console.log('\nC. a real process survives unhandledRejection / uncaughtException (winston exitOnError regression guard)');
{
  const loggerUrl = JSON.stringify(path.join(srcDir, 'utils/logger.js'));
  const errorsUrl = JSON.stringify(path.join(srcDir, 'utils/errors.js'));
  const run = (trigger) => spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { default: logger } = await import(${loggerUrl});
    logger.level = 'error';
    const e = await import(${errorsUrl});
    e.handleUncaughtException(); e.handleUnhandledRejection();   // same order as server.js
    ${trigger}
    setTimeout(() => { console.log('STILL_ALIVE'); process.exit(0); }, 1500);
  `], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 30000 });
  const rej = run(`Promise.reject(Object.assign(new Error('Unexpected status code 403'), { status: 403 }));`);
  check(rej.status === 0 && /STILL_ALIVE/.test(rej.stdout), `un-awaited 403 rejection: process keeps running (exit ${rej.status})`);
  const exc = run(`setTimeout(() => { throw new Error('stray async throw'); }, 50);`);
  check(exc.status === 0 && /STILL_ALIVE/.test(exc.stdout), `uncaught exception: process keeps running (exit ${exc.status})`);
}

console.log('\nD. Pusher returning 403 for everything: ride flow, stale-trip job, emitters, chat');
{
  triggerMode = 'reject403'; _resetTriggerFailureLog(); warns.length = 0; triggerCalls = 0;
  const unhandledBefore = unhandled.length;

  // Harness control: a raw un-awaited trigger() really does produce an unhandledRejection here.
  ps.pusher.trigger('control', 'evt', {});
  await sleep(100);
  eq(unhandled.length - unhandledBefore, 1, 'control: a bare pusher.trigger() IS an unhandledRejection in this harness');
  unhandled.length = 0; triggerCalls = 0;

  // Realtime layer wired like production (socket service present => Pusher emitters are invoked from controllers).
  const emitted = [];
  const room = (name) => ({ emit: (ev, p) => emitted.push({ name, ev, p }) });
  initializeSocketService({ to: room, emit() {}, sockets: { adapter: { rooms: new Map() } } });

  const PICKUP = [7.5, 6.3]; const DROP = [7.6, 6.4];
  let seq = 0;
  const mkUser = async (role) => User.create({ name: `${role} ${++seq}`, phone: `+2348${String(Date.now()).slice(-7)}${seq}`, role });
  const mkDriver = async (coords) => {
    const u = await mkUser('driver');
    const d = await Driver.create({
      user: u._id, licenseNumber: `LIC${Date.now()}${seq}`, licenseExpiry: new Date(Date.now() + 1e10),
      vehicleDetails: { make: 'Bajaj', model: 'RE', year: 2020, plateNumber: `KEKE${Date.now()}${seq}`, color: 'yellow', vehicleType: new mongoose.Types.ObjectId() },
      isOnline: true, isAvailable: false,
      currentLocation: { type: 'Point', coordinates: coords, lastUpdated: new Date() },
    });
    return d;
  };
  const mkRide = (rider, driver, extra = {}) => Ride.create({
    rider: rider._id, driver: driver?._id, vehicleType: new mongoose.Types.ObjectId(),
    pickupLocation: { coordinates: PICKUP, address: 'A' }, dropoffLocation: { coordinates: DROP, address: 'B' },
    status: 'accepted', acceptedByDriver: true, paymentMethod: 'cash', paymentStatus: 'pending',
    fare: { totalFare: 500, riderChargeTotal: 500 }, ...extra,
  });
  const reload = (r) => Ride.findById(r._id).lean();
  const old = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
  const backdate = (id, minutes) => Ride.collection.updateOne({ _id: id }, { $set: { updatedAt: old(minutes) } });

  // ---- 1. stale-trip job at startup ---------------------------------------------------------------------
  const rider0 = await mkUser('passenger');
  const dStale = await mkDriver(PICKUP);
  const staleInProgress = await mkRide(rider0, dStale, { status: 'in-progress', isRideStarted: true, startedAt: old(60) });
  const staleSearching = await mkRide(rider0, null, { status: 'searching', acceptedByDriver: false });
  const dNoShow = await mkDriver(PICKUP);
  const stuckAccepted = await mkRide(rider0, dNoShow, { status: 'accepted' });
  await backdate(staleInProgress._id, 20); await backdate(staleSearching._id, 45); await backdate(stuckAccepted._id, 30);

  staleTripService.start(); // runs one tick immediately, exactly like server.js after listen()
  for (let i = 0; i < 100 && (staleTripService.isRunning || (await reload(stuckAccepted)).status === 'accepted'); i++) await sleep(100);
  await sleep(300);
  staleTripService.stop();
  eq((await reload(staleInProgress)).status, 'issue_flagged', 'stale job: in-progress ride flagged');
  eq((await reload(staleSearching)).status, 'cancelled', 'stale job: searching ride cancelled');
  eq((await reload(stuckAccepted)).status, 'cancelled', 'stale job: stuck pre-pickup ride cancelled');
  check(triggerCalls >= 3, `stale job really tried Pusher and got 403 (${triggerCalls} attempts)`);
  eq(staleTripService.isRunning, false, 'stale job finished its tick (not wedged)');
  eq(unhandled.length, 0, 'stale job: zero unhandled rejections');

  // ---- 2. ride endpoints ----------------------------------------------------------------------------------
  const rider = await mkUser('passenger');
  const driver = await mkDriver(PICKUP);
  const ride = await mkRide(rider, driver);
  const dReq = (body) => ({ user: { _id: driver.user }, body });
  const before = triggerCalls;

  const arrived = await call(driverCtl.markArrived, dReq({ rideId: ride._id.toString() }));
  check(!arrived.error && arrived.status === 200, `arrived endpoint succeeds${errMsg(arrived)}`);
  eq((await reload(ride)).status, 'arrived', '... ride is arrived');

  const started = await call(driverCtl.startRide, dReq({ rideId: ride._id.toString() }));
  check(!started.error && started.status === 200, `start endpoint succeeds${errMsg(started)}`);
  eq((await reload(ride)).status, 'in-progress', '... ride is in progress');

  const chatRider = await call(messageCtl.sendMessage, { user: { _id: rider._id }, body: { rideId: ride._id.toString(), message: 'where are you?' } });
  check(!chatRider.error && chatRider.status === 201, `chat message (rider -> driver) succeeds${errMsg(chatRider)}`);
  const chatDriver = await call(messageCtl.sendMessage, { user: { _id: driver.user }, body: { rideId: ride._id.toString(), message: 'two minutes' } });
  check(!chatDriver.error && chatDriver.status === 201, `chat message (driver -> rider) succeeds${errMsg(chatDriver)}`);
  eq(await Message.countDocuments({ ride: ride._id }), 2, '... both messages are stored');

  // driver GPS ping while on the trip (the highest-frequency Pusher path), including the "approaching destination" push
  const ping = await call(driverCtl.updateLocation, { user: { _id: driver.user }, body: { latitude: 6.4005, longitude: 7.6, heading: 90 } });
  check(!ping.error && ping.status === 200, `driver location update succeeds${errMsg(ping)}`);

  const completed = await call(driverCtl.completeRide, dReq({ rideId: ride._id.toString(), dropoff_flow: 2, location: { lat: 6.4005, lng: 7.6, accuracy: 10, capturedAt: Date.now(), mocked: false } }));
  check(!completed.error && completed.status === 200, `complete endpoint succeeds${errMsg(completed)}`);
  eq((await reload(ride)).status, 'completed', '... ride is completed');
  check(triggerCalls > before + 3, `endpoints really hit the failing Pusher (${triggerCalls - before} attempts)`);

  // rider cancels a ride that has pending driver offers (rideController emits Pusher revokes)
  const dOffer = await mkDriver(PICKUP);
  const cancelRide = await mkRide(rider, null, { status: 'searching', acceptedByDriver: false });
  const RideOffer = await M('../src/models/RideOffer.js');
  await RideOffer.create({ ride_id: cancelRide._id, driver_id: dOffer._id, status: 'pending', expires_at: new Date(Date.now() + 60000) }).catch(() => {});
  const cancelled = await call(rideCtl.cancelRide, { user: { _id: rider._id }, body: { rideId: cancelRide._id.toString(), reason: 'changed my mind' } });
  eq((await reload(cancelRide)).status, 'cancelled', '... ride is cancelled');
  check(!cancelled.error, `rider cancel succeeds${errMsg(cancelled)}`);

  // ---- 3. every emitter on PusherService ------------------------------------------------------------------
  const rideDoc = await Ride.findById(ride._id).populate('rider');
  const driverDoc = await Driver.findById(driver._id).populate('user');
  const emits = [
    () => ps.emitDriverLocationUpdate(rideDoc, driverDoc, 4, 1.2),
    () => ps.emitRideStatusUpdate(rideDoc, 'accepted', driverDoc),
    () => ps.emitRideAccepted(rideDoc, driverDoc),
    () => ps.emitRideCancelled(rideDoc, 'driver', 'x'),
    () => ps.emitRideCompleted(rideDoc),
    () => ps.emitPaymentReceipt(rideDoc, { _id: new mongoose.Types.ObjectId(), amount: 500 }),
    () => ps.emitRideStarted(rideDoc, driverDoc),
    () => ps.emitNotification(rider._id, { title: 't' }),
    () => ps.emitDriverLiveLocationToRider(driver._id, 6.4, 7.6, 90),
  ];
  let threw = 0;
  for (const e of emits) { try { await e(); } catch { threw++; } }
  eq(threw, 0, `all ${emits.length} PusherService emitters return normally`);

  await sleep(500); // let every fire-and-forget (setImmediate chat push, etc.) settle
  eq(unhandled.length, 0, `zero unhandledRejection events across the whole run (${triggerCalls} failed Pusher calls)`);
  const wl = pusherWarns();
  check(wl.length >= 1 && wl.length <= 3, `failures are logged, but only ${wl.length} line(s) for ${triggerCalls} failed calls`);
  check(wl.every((w) => /http-403/.test(w)), '... all of them tagged http-403');
}

} catch (e) { failed++; console.log('  FAIL script error:', e.stack || e); }

logger.warn = realWarn;
console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
