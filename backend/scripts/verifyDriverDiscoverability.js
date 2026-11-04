/**
 * Discoverability fixes: vehicle-type inside the geo query, and isAvailable restore
 * after offer timeout / rider cancel.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_discover_test?replicaSet=rs0' \
 *     OFFER_WINDOW_MS=250 node scripts/verifyDriverDiscoverability.js
 *
 * Safety: refuses to run unless the connected database name contains "test".
 */
process.env.OFFER_WINDOW_MS ||= '250';
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_flow_checks';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_dummy';

import mongoose from 'mongoose';
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
const RideOffer = await M('../src/models/RideOffer.js');
const VehicleType = await M('../src/models/VehicleType.js');
const UserWallet = await M('../src/models/UserWallet.js');
const UserWalletTransaction = await M('../src/models/UserWalletTransaction.js');
const rideMatchingService = await M('../src/services/rideMatchingService.js');
const { dispatchRide, OFFER_WINDOW_MS } = await import(
  '../src/services/driverNotificationService.js'
);
const rideCtl = await import('../src/controllers/rideController.js');

let passed = 0;
let failed = 0;
const check = (c, m) => {
  if (c) {
    passed++;
    console.log('  ok  ', m);
  } else {
    failed++;
    console.log('  FAIL', m);
  }
};
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
  console.error('Refusing to run on FerretDB.');
  await mongoose.disconnect();
  process.exit(2);
}
console.log(`MongoDB ${bi.version} on database ${dbName}`);
console.log(`OFFER_WINDOW_MS=${OFFER_WINDOW_MS}`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
for (const m of [User, Driver, Ride, RideOffer, VehicleType, UserWallet, UserWalletTransaction]) {
  await m.createCollection().catch(() => {});
}
await Driver.collection.createIndex({ currentLocation: '2dsphere' });
await Driver.collection.createIndex({
  'vehicleDetails.vehicleType': 1,
  currentLocation: '2dsphere',
});

const PICKUP = { lat: 6.32, lng: 8.11 };
const M_PER_DEG = 111195;
const offset = (kmNorth) => ({
  lat: PICKUP.lat + (kmNorth * 1000) / M_PER_DEG,
  lng: PICKUP.lng,
});

let seq = 0;
const makeVehicleTypes = async () => {
  const taxi = await VehicleType.create({
    name: `taxi_${Date.now()}`,
    displayName: 'Taxi',
    baseFare: 500,
    perKmRate: 100,
    perMinuteRate: 10,
    capacity: 4,
  });
  const keke = await VehicleType.create({
    name: `keke_${Date.now()}`,
    displayName: 'Keke',
    baseFare: 300,
    perKmRate: 80,
    perMinuteRate: 8,
    capacity: 3,
  });
  return { taxi, keke };
};

const makeRider = async () =>
  User.create({
    name: `Rider ${++seq}`,
    phone: `+234800${String(Date.now()).slice(-6)}${seq}`,
    role: 'passenger',
  });

const makeDriver = async ({ vehicleTypeId, kmNorth, available = true }) => {
  const u = await User.create({
    name: `Driver ${++seq}`,
    phone: `+234700${String(Date.now()).slice(-6)}${seq}`,
    role: 'driver',
  });
  const p = offset(kmNorth);
  return Driver.create({
    user: u._id,
    licenseNumber: `LIC${Date.now()}${seq}`,
    licenseExpiry: new Date(Date.now() + 1e10),
    vehicleDetails: {
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      plateNumber: `PLT${Date.now()}${seq}`,
      color: 'yellow',
      vehicleType: vehicleTypeId,
    },
    documentsVerified: true,
    verificationStatus: 'approved',
    isOnline: true,
    isAvailable: available,
    currentLocation: {
      type: 'Point',
      coordinates: [p.lng, p.lat],
      lastUpdated: new Date(),
      lastRealFixAt: new Date(),
    },
    lastActiveAt: new Date(),
  });
};

const makeSearchingRide = (rider, vehicleTypeId) =>
  Ride.create({
    rider: rider._id,
    vehicleType: vehicleTypeId,
    pickupLocation: {
      coordinates: [PICKUP.lng, PICKUP.lat],
      address: 'Pickup',
    },
    dropoffLocation: {
      coordinates: [PICKUP.lng + 0.01, PICKUP.lat + 0.01],
      address: 'Dropoff',
    },
    status: 'searching',
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    fare: { totalFare: 500, riderChargeTotal: 500 },
  });

const call = (handler, req) =>
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
    handler(
      { ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req },
      res,
      (e) => {
        out.error = e || null;
        done();
      }
    );
  });

try {
  const { taxi, keke } = await makeVehicleTypes();

  console.log('\nA. vehicle-type filter inside geo query (fix 1)');
  {
    // 20 closer taxis + 5 farther kekes: without geo type filter, .limit(20) would
    // starve the kekes. With the filter, a keke request must match a keke.
    for (let i = 0; i < 20; i++) {
      await makeDriver({ vehicleTypeId: taxi._id, kmNorth: 1 + i * 0.01 });
    }
    const kekeDrivers = [];
    for (let i = 0; i < 5; i++) {
      kekeDrivers.push(await makeDriver({ vehicleTypeId: keke._id, kmNorth: 4 + i * 0.01 }));
    }

    const nearbyKeke = await Driver.findNearbyAvailable(
      PICKUP.lat,
      PICKUP.lng,
      10,
      keke._id.toString()
    );
    check(nearbyKeke.length >= 1, `geo+type found ${nearbyKeke.length} keke(s)`);
    check(
      nearbyKeke.every(
        (d) => String(d.vehicleDetails?.vehicleType?._id || d.vehicleDetails?.vehicleType) === String(keke._id)
      ),
      'every geo result is a keke'
    );

    const rider = await makeRider();
    const ride = await makeSearchingRide(rider, keke._id);
    const matched = await rideMatchingService.findAndMatchDrivers(ride, 10, 5);
    check(matched.length >= 1, `findAndMatchDrivers returned ${matched.length} keke match(es)`);
    const matchedIds = new Set(matched.map((m) => String(m.driver._id)));
    check(
      matched.every((m) =>
        kekeDrivers.some((k) => String(k._id) === String(m.driver._id))
      ),
      'matched drivers are from the keke pool'
    );
    check(matchedIds.size === matched.length, 'matched driver ids are unique');
  }

  console.log('\nB. null vehicleTypeId → no type filter in geo query');
  {
    // Fresh mixed pool so the unfiltered top-20 can include both types.
    for (const m of [Driver, User]) await m.deleteMany({});
    const { taxi: tNull, keke: kNull } = await makeVehicleTypes();
    for (let i = 0; i < 5; i++) {
      await makeDriver({ vehicleTypeId: tNull._id, kmNorth: 1 + i * 0.05 });
      await makeDriver({ vehicleTypeId: kNull._id, kmNorth: 1.02 + i * 0.05 });
    }

    const nearbyAny = await Driver.findNearbyAvailable(PICKUP.lat, PICKUP.lng, 10, null);
    const types = new Set(
      nearbyAny.map((d) =>
        String(d.vehicleDetails?.vehicleType?._id || d.vehicleDetails?.vehicleType)
      )
    );
    check(nearbyAny.length === 10, `null type returns all nearby (n=${nearbyAny.length})`);
    check(
      types.has(String(tNull._id)) && types.has(String(kNull._id)),
      'null type includes both taxi and keke (no geo type filter)'
    );

    const rider = await makeRider();
    const ride = await makeSearchingRide(rider, tNull._id);
    ride.vehicleType = null;
    const matched = await rideMatchingService.findAndMatchDrivers(ride, 10, 5);
    check(
      matched.length >= 1,
      `null ride.vehicleType still matches nearby drivers (n=${matched.length})`
    );
  }

  console.log('\nC. offer timeout restores isAvailable (fix 2)');
  {
    for (const m of [Driver, Ride, RideOffer, User]) await m.deleteMany({});
    const { taxi: t2 } = await makeVehicleTypes();
    const rider = await makeRider();
    const driver = await makeDriver({ vehicleTypeId: t2._id, kmNorth: 0.5 });
    const ride = await makeSearchingRide(rider, t2._id);

    await dispatchRide(ride, [{ driver, score: 100, distance: 0.5 }], { maxOffers: 1 });

    // Simulate the stuck state the timeout path must clear.
    await Driver.updateOne({ _id: driver._id }, { $set: { isAvailable: false } });
    eq(
      (await Driver.findById(driver._id).lean()).isAvailable,
      false,
      'driver forced unavailable before timeout'
    );

    await sleep(OFFER_WINDOW_MS + 200);

    const after = await Driver.findById(driver._id).lean();
    eq(after.isAvailable, true, 'after offer timeout, isAvailable is true');
    const pending = await RideOffer.countDocuments({
      ride_id: ride._id,
      status: 'pending',
    });
    eq(pending, 0, 'pending offers expired after timeout');
  }

  console.log('\nD. rider cancel before pickup restores assigned driver (fix 2)');
  {
    for (const m of [Driver, Ride, RideOffer, User]) await m.deleteMany({});
    const { taxi: t3 } = await makeVehicleTypes();
    const rider = await makeRider();
    const driver = await makeDriver({ vehicleTypeId: t3._id, kmNorth: 0.3 });
    const ride = await Ride.create({
      rider: rider._id,
      driver: driver._id,
      vehicleType: t3._id,
      pickupLocation: { coordinates: [PICKUP.lng, PICKUP.lat], address: 'Pickup' },
      dropoffLocation: {
        coordinates: [PICKUP.lng + 0.01, PICKUP.lat + 0.01],
        address: 'Dropoff',
      },
      status: 'accepted',
      acceptedByDriver: true,
      acceptedAt: new Date(),
      paymentMethod: 'cash',
      paymentStatus: 'pending',
      fare: { totalFare: 500, riderChargeTotal: 500 },
    });
    await Driver.updateOne({ _id: driver._id }, { $set: { isAvailable: false } });

    const r = await call(rideCtl.cancelRide, {
      user: { _id: rider._id },
      body: { rideId: ride._id.toString(), reason: 'changed mind' },
    });
    check(!r.error && r.status === 200, `rider cancel succeeds${r.error ? ` [${r.error.message}]` : ''}`);

    const after = await Driver.findById(driver._id).lean();
    eq(after.isAvailable, true, 'assigned driver restored after rider cancel');
    const rideAfter = await Ride.findById(ride._id).lean();
    eq(rideAfter.status, 'cancelled', 'ride marked cancelled');
  }

  console.log('\nE. DEFAULT_MAX_OFFERS is 10');
  {
    const { DEFAULT_MAX_OFFERS } = await import('../src/services/driverNotificationService.js');
    eq(DEFAULT_MAX_OFFERS, 10, 'DEFAULT_MAX_OFFERS');
  }
} catch (e) {
  console.error('\nFATAL', e);
  failed++;
} finally {
  await mongoose.disconnect();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
