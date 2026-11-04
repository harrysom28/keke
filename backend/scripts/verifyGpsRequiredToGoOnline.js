/**
 * GPS is required to go online, matching ignores a stamped lastUpdated with no
 * real fix, and the stale-GPS nudge fires once inside its window.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_gps_test?replicaSet=rs0' \
 *     node scripts/verifyGpsRequiredToGoOnline.js
 *
 * Safety: refuses to run unless the connected database name contains "test".
 */
import mongoose from 'mongoose';
import { writeSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const log = (line) => writeSync(2, `${line}\n`);

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
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED', e);
  process.exit(3);
});

const M = async (p) => (await import(p)).default;
const User = await M('../src/models/User.js');
const Driver = await M('../src/models/Driver.js');
const Ride = await M('../src/models/Ride.js');
const VehicleType = await M('../src/models/VehicleType.js');
const AdminSettings = await M('../src/models/AdminSettings.js');
const Notification = await M('../src/models/Notification.js');
const driverCtl = await import('../src/controllers/driverController.js');
const { nudgeDriversWithStaleGps } = await import('../src/services/staleTripService.js');
const { invalidateCache } = await import('../src/services/settingsService.js');
const { gpsDotStatus, LOCATION_REQUIRED_MESSAGE } = await import('../src/utils/driverGpsFix.js');

let passed = 0;
let failed = 0;
const check = (c, m) => {
  if (c) {
    passed++;
    log(`  ok   ${m}`);
  } else {
    failed++;
    log(`  FAIL ${m}`);
  }
};
const eq = (a, b, m) => check(a === b, `${m} (got ${a}, want ${b})`);

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
} catch (err) {
  log(`MongoDB connection failed: ${err?.message || err}`);
  process.exit(1);
}
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
log(`MongoDB ${bi.version} on database ${dbName}`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
for (const m of [User, Driver, Ride, VehicleType, AdminSettings, Notification]) {
  await m.createCollection().catch(() => {});
}
await Driver.collection.createIndex({ currentLocation: '2dsphere' });
invalidateCache();

const PICKUP = { lat: 6.32, lng: 8.11 };
const M_PER_DEG = 111195;
const offset = (kmNorth) => ({
  lat: PICKUP.lat + (kmNorth * 1000) / M_PER_DEG,
  lng: PICKUP.lng,
});

let seq = 0;
const makeUser = () =>
  User.create({
    name: `Driver ${++seq}`,
    phone: `+234701${String(Date.now()).slice(-6)}${seq}`,
    role: 'driver',
  });

const makeDriver = async (extra = {}) => {
  const u = await makeUser();
  const d = await Driver.create({
    user: u._id,
    licenseNumber: `LIC${Date.now()}${seq}`,
    licenseExpiry: new Date(Date.now() + 1e10),
    vehicleDetails: {
      make: 'Bajaj',
      model: 'RE',
      year: 2020,
      plateNumber: `PLT${Date.now()}${seq}`,
      color: 'yellow',
      vehicleType: new mongoose.Types.ObjectId(),
    },
    documentsVerified: true,
    verificationStatus: 'approved',
    isOnline: false,
    isAvailable: false,
    ...extra,
  });
  return { user: u, driver: d };
};

const call = (body, user) =>
  new Promise((resolve) => {
    const out = { status: 200, body: null, error: null };
    const done = () => setTimeout(() => resolve(out), 0);
    const res = {
      status(c) {
        out.status = c;
        return this;
      },
      json(b) {
        out.body = b;
        done();
        return this;
      },
      set() {
        return this;
      },
      send(b) {
        out.body = b;
        done();
        return this;
      },
    };
    setTimeout(() => {
      out.error = new Error('handler timed out');
      resolve(out);
    }, 20000).unref();
    driverCtl.toggleAvailability(
      { ip: '127.0.0.1', headers: {}, params: {}, query: {}, body, user },
      res,
      (e) => {
        out.error = e || null;
        done();
      }
    );
  });

const reload = (id) => Driver.findById(id).lean();
const fixBody = (lat, lng, capturedAt = Date.now() - 500) => ({
  isAvailable: true,
  lat,
  lng,
  accuracy: 12,
  capturedAt,
});

const assertLocationRequired = (r, label) => {
  check(!!r.error && r.error.statusCode === 409, `${label}: 409`);
  eq(r.error?.code, 'LOCATION_REQUIRED', `${label}: code`);
  eq(r.error?.message, LOCATION_REQUIRED_MESSAGE, `${label}: message`);
  check(r.body == null, `${label}: no success body`);
};

try {
  log('\nA. admin GPS dot');
  {
    const fresh = { type: 'Point', coordinates: [8.11, 6.32], lastRealFixAt: new Date() };
    eq(gpsDotStatus(fresh, 300), 'green', 'fix inside freshness is green');
    const aging = {
      type: 'Point',
      coordinates: [8.11, 6.32],
      lastRealFixAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      lastUpdated: new Date(),
    };
    eq(gpsDotStatus(aging, 300), 'yellow', 'fix older than freshness but under 24h is yellow');
    eq(
      gpsDotStatus({ type: 'Point', coordinates: [8.11, 6.32], lastUpdated: new Date() }, 300),
      'red',
      'null lastRealFixAt is red even when lastUpdated is fresh'
    );
    eq(
      gpsDotStatus(
        { type: 'Point', coordinates: [0, 0], lastRealFixAt: new Date(), lastUpdated: new Date() },
        300
      ),
      'red',
      '[0,0] is red even with a recent lastRealFixAt'
    );
    eq(gpsDotStatus(null, 300), 'red', 'missing location is red');
  }

  log('\nB. new driver has no currentLocation');
  {
    const { driver } = await makeDriver();
    const doc = await reload(driver._id);
    check(doc.currentLocation == null, 'currentLocation is unset');
  }

  log('\nC. online with no body and stored [0,0]');
  {
    const { user, driver } = await makeDriver({
      isOnline: false,
      currentLocation: {
        type: 'Point',
        coordinates: [0, 0],
        lastUpdated: new Date(),
      },
    });
    const before = await reload(driver._id);
    const r = await call({ isAvailable: true }, { _id: user._id });
    assertLocationRequired(r, '[0,0] no body');
    const after = await reload(driver._id);
    eq(after.isOnline, before.isOnline, '[0,0] isOnline unchanged');
    eq(after.isAvailable, false, '[0,0] isAvailable unchanged');
  }

  log('\nD. online with a valid non-zero fix');
  {
    const p = offset(0.4);
    const capturedAt = Date.now() - 800;
    const { user, driver } = await makeDriver();
    const r = await call(fixBody(p.lat, p.lng, capturedAt), { _id: user._id });
    check(!r.error && r.status === 200, `valid fix goes online${r.error ? ` [${r.error.message}]` : ''}`);
    const after = await reload(driver._id);
    eq(after.isOnline, true, 'isOnline true');
    eq(after.isAvailable, true, 'isAvailable true');
    eq(after.currentLocation.coordinates[0], p.lng, 'longitude stored');
    eq(after.currentLocation.coordinates[1], p.lat, 'latitude stored');
    eq(
      new Date(after.currentLocation.lastRealFixAt).getTime(),
      capturedAt,
      'lastRealFixAt is the client capturedAt'
    );
  }

  log('\nE. stale lastRealFixAt and no body');
  {
    const p = offset(0.2);
    const stamped = new Date();
    const { user, driver } = await makeDriver({
      currentLocation: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
        lastUpdated: stamped,
        lastRealFixAt: new Date(Date.now() - 90 * 1000),
      },
    });
    const r = await call({ isAvailable: true }, { _id: user._id });
    assertLocationRequired(r, 'stale fix');
    const after = await reload(driver._id);
    eq(after.isOnline, false, 'stale fix leaves isOnline false');
    eq(
      new Date(after.currentLocation.lastUpdated).getTime(),
      stamped.getTime(),
      'stale fix does not refresh lastUpdated'
    );
  }

  log('\nF. toggle off then on without new coords (stamp-refresh hole)');
  {
    const p = offset(0.3);
    const realFixAt = new Date(Date.now() - 90 * 1000);
    const { user, driver } = await makeDriver({
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        type: 'Point',
        coordinates: [p.lng, p.lat],
        lastUpdated: realFixAt,
        lastRealFixAt: realFixAt,
      },
    });
    const off = await call({ isAvailable: false }, { _id: user._id });
    check(!off.error && off.status === 200, `toggle off${off.error ? ` [${off.error.message}]` : ''}`);
    eq((await reload(driver._id)).isOnline, false, 'toggled offline');

    // The old bug refreshed lastUpdated here. A fresh stamp must not be enough.
    const stamped = new Date();
    await Driver.updateOne(
      { _id: driver._id },
      { $set: { 'currentLocation.lastUpdated': stamped } }
    );
    const r = await call({ isAvailable: true }, { _id: user._id });
    assertLocationRequired(r, 'reuse old doc');
    const after = await reload(driver._id);
    eq(after.isOnline, false, 'still offline without a new fix');
    eq(
      new Date(after.currentLocation.lastRealFixAt).getTime(),
      realFixAt.getTime(),
      'lastRealFixAt not rewritten by the toggle'
    );
    eq(
      new Date(after.currentLocation.lastUpdated).getTime(),
      stamped.getTime(),
      'lastUpdated stamp was not treated as a fix'
    );
  }

  log('\nG. findNearbyAvailable excludes drivers with no lastRealFixAt');
  {
    const goodP = offset(0.5);
    const badP = offset(0.6);
    const { driver: good } = await makeDriver({
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        type: 'Point',
        coordinates: [goodP.lng, goodP.lat],
        lastUpdated: new Date(),
        lastRealFixAt: new Date(),
      },
    });
    const { driver: bad } = await makeDriver({
      isOnline: true,
      isAvailable: true,
      currentLocation: {
        type: 'Point',
        coordinates: [badP.lng, badP.lat],
        lastUpdated: new Date(),
        lastRealFixAt: null,
      },
    });
    const nearby = await Driver.findNearbyAvailable(PICKUP.lat, PICKUP.lng, 10, null);
    const ids = new Set(nearby.map((d) => String(d._id)));
    check(ids.has(String(good._id)), 'driver with a real fix is matchable');
    check(!ids.has(String(bad._id)), 'findNearbyAvailable excludes drivers with no lastRealFixAt');
  }

  log('\nH. nudge once per driver per hour, only inside the window');
  {
    await AdminSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: { 'dispatch.locationFreshnessSeconds': 300 } },
      { upsert: true }
    );
    invalidateCache();

    const inWindowAt = new Date(Date.now() - 280 * 1000);
    const { user: windowUser, driver: windowDriver } = await makeDriver({
      isOnline: true,
      currentLocation: {
        type: 'Point',
        coordinates: [PICKUP.lng, PICKUP.lat],
        lastUpdated: inWindowAt,
        lastRealFixAt: inWindowAt,
      },
    });
    const { user: freshUser } = await makeDriver({
      isOnline: true,
      currentLocation: {
        type: 'Point',
        coordinates: [PICKUP.lng, PICKUP.lat],
        lastUpdated: new Date(),
        lastRealFixAt: new Date(Date.now() - 10 * 1000),
      },
    });
    const { user: oldUser } = await makeDriver({
      isOnline: true,
      currentLocation: {
        type: 'Point',
        coordinates: [PICKUP.lng, PICKUP.lat],
        lastUpdated: new Date(Date.now() - 700 * 1000),
        lastRealFixAt: new Date(Date.now() - 700 * 1000),
      },
    });

    const countFor = (userId) =>
      Notification.countDocuments({ event_key: 'gps_stale_nudge', target_user_id: userId });

    const first = await nudgeDriversWithStaleGps();
    eq(first.sent, 1, 'first tick sends one nudge');
    eq(await countFor(windowUser._id), 1, 'in-window driver got one push');
    const note = await Notification.findOne({ target_user_id: windowUser._id, event_key: 'gps_stale_nudge' }).lean();
    eq(note?.title, 'Location stopped updating', 'nudge title');
    eq(
      note?.message,
      'Open the app and keep it in the foreground to continue receiving rides.',
      'nudge body'
    );
    eq(note?.type, 'push', 'nudge is push, not SMS');
    check((await reload(windowDriver._id)).lastGpsNudgeAt != null, 'lastGpsNudgeAt recorded');
    eq(await countFor(freshUser._id), 0, 'fresh fix is not nudged');
    eq(await countFor(oldUser._id), 0, 'fix outside the tail is not nudged');

    const second = await nudgeDriversWithStaleGps();
    eq(second.sent, 0, 'second tick inside the hour sends nothing');
    eq(await countFor(windowUser._id), 1, 'still exactly one nudge');

    await Driver.updateOne(
      { _id: windowDriver._id },
      { $set: { lastGpsNudgeAt: new Date(Date.now() - 61 * 60 * 1000) } }
    );
    const third = await nudgeDriversWithStaleGps();
    eq(third.sent, 1, 'after an hour the same driver can be nudged again');
    eq(await countFor(windowUser._id), 2, 'second nudge is a new hour');
  }

  log('\nI. nudge does nothing when freshness is very long');
  {
    await AdminSettings.findOneAndUpdate(
      { key: 'default' },
      { $set: { 'dispatch.locationFreshnessSeconds': 7200 } },
      { upsert: true }
    );
    invalidateCache();
    const { user, driver } = await makeDriver({
      isOnline: true,
      currentLocation: {
        type: 'Point',
        coordinates: [PICKUP.lng, PICKUP.lat],
        lastUpdated: new Date(Date.now() - 280 * 1000),
        lastRealFixAt: new Date(Date.now() - 280 * 1000),
      },
    });
    const result = await nudgeDriversWithStaleGps();
    eq(result.sent, 0, 'long freshness sends nothing');
    eq(
      await Notification.countDocuments({ event_key: 'gps_stale_nudge', target_user_id: user._id }),
      0,
      'driver who would be nudged at 300s is not nudged'
    );
    check((await reload(driver._id)).lastGpsNudgeAt == null, 'lastGpsNudgeAt left unset');
  }

  log('\nJ. clearZeroZeroLocations script');
  {
    const { driver } = await makeDriver({
      currentLocation: { type: 'Point', coordinates: [0, 0], lastUpdated: new Date() },
    });
    const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
    const runScript = (args, mongodbUri) =>
      spawnSync(process.execPath, ['scripts/clearZeroZeroLocations.js', ...args], {
        cwd: backendRoot,
        env: { ...process.env, MONGODB_URI: mongodbUri },
        encoding: 'utf8',
      });

    const testDbUri = uri.replace(/\/[^/?]+(\?|$)/, '/test$1');
    const refused = runScript([], testDbUri);
    eq(refused.status, 2, 'script refuses database "test" without --allow-test-db');

    const dry = runScript([], uri);
    eq(dry.status, 0, `dry-run exits 0${dry.stderr ? ` [${dry.stderr.slice(0, 180)}]` : ''}`);
    check(String(dry.stdout).includes(String(driver._id)), 'dry-run lists the [0,0] driver');
    check(
      (await reload(driver._id)).currentLocation != null,
      'dry-run does not unset currentLocation'
    );

    const fixed = runScript(['--fix'], uri);
    eq(fixed.status, 0, `fix exits 0${fixed.stderr ? ` [${fixed.stderr.slice(0, 180)}]` : ''}`);
    check((await reload(driver._id)).currentLocation == null, '--fix unsets [0,0] currentLocation');
  }
} catch (err) {
  log(err?.stack || String(err));
  failed++;
}

log(`\n${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed > 0 ? 1 : 0);
