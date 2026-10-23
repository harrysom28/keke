/**
 * After a driver accepts, GET active ride must include the driver's phone
 * so the rider can call them. The old `.populate('driver').populate('driver.user')`
 * chain left `driver.user` unpopulated.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27099/keke_call_test?replicaSet=rs0' \
 *     node scripts/verifyRiderCallDriver.js
 *
 * Connects via connectDB (MONGODB_URI). TEST_MONGODB_URI, when set, overrides
 * MONGODB_URI so this can run beside the other verify scripts.
 * Refuses a database literally named "test" unless --allow-test-db is passed,
 * and refuses any database whose name does not contain "test" (this script
 * deletes the collections it uses).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });
if (process.env.TEST_MONGODB_URI) {
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
}

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_flow_checks';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_paystack_dummy';
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const allowTestDb = process.argv.includes('--allow-test-db');

const { default: logger } = await import('../src/utils/logger.js');
logger.exitOnError = false;
logger.level = 'error';
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED', e);
  process.exit(3);
});

const { connectDB, disconnectDB } = await import('../src/config/database.js');
const User = (await import('../src/models/User.js')).default;
const Driver = (await import('../src/models/Driver.js')).default;
const Ride = (await import('../src/models/Ride.js')).default;
const VehicleType = (await import('../src/models/VehicleType.js')).default;
const UserWallet = (await import('../src/models/UserWallet.js')).default;
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
    handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req }, res, (e) => {
      out.error = e || null;
      done();
    });
  });

try {
  await connectDB();
} catch (err) {
  console.error(`MongoDB connection failed: ${err?.message || err}`);
  process.exit(1);
}

const dbName = mongoose.connection.name;
console.log(`Connected to ${dbName}`);
if (dbName === 'test' && !allowTestDb) {
  console.error(
    'Refusing to run against database "test". Check MONGODB_URI in backend/.env, ' +
      'or pass --allow-test-db if you really mean it.'
  );
  await disconnectDB();
  process.exit(2);
}
if (!/test/i.test(dbName)) {
  console.error(
    `Refusing to run: connected database "${dbName}" does not contain "test". ` +
      'This script creates and deletes documents.'
  );
  await disconnectDB();
  process.exit(2);
}
const bi = await mongoose.connection.db.admin().command({ buildInfo: 1 });
if (bi.ferretdbVersion) {
  console.error('Refusing to run on FerretDB.');
  await disconnectDB();
  process.exit(2);
}
console.log(`MongoDB ${bi.version} on database ${dbName}`);

try {
  for (const m of [User, Driver, Ride, VehicleType, UserWallet]) {
    await m.deleteMany({});
    await m.createCollection().catch(() => {});
  }

  const seq = Date.now().toString().slice(-6);
  const driverPhone = `+234701${seq}`;
  const passenger = await User.create({
    name: 'Call Rider',
    phone: `+234801${seq}`,
    role: 'passenger',
  });
  const driverUser = await User.create({
    name: 'Call Driver',
    phone: driverPhone,
    role: 'driver',
  });
  const vehicleType = await VehicleType.create({
    name: `keke_call_${seq}`,
    displayName: 'Keke',
    baseFare: 300,
    perKmRate: 80,
    perMinuteRate: 8,
    capacity: 3,
  });
  const driver = await Driver.create({
    user: driverUser._id,
    licenseNumber: `LIC${seq}`,
    licenseExpiry: new Date(Date.now() + 1e10),
    vehicleDetails: {
      make: 'Bajaj',
      model: 'RE',
      year: 2020,
      plateNumber: `CALL${seq}`,
      color: 'yellow',
      vehicleType: vehicleType._id,
    },
    documentsVerified: true,
    verificationStatus: 'approved',
    isOnline: true,
    isAvailable: false,
    currentLocation: {
      type: 'Point',
      coordinates: [8.11, 6.32],
      lastUpdated: new Date(),
    },
  });
  await Ride.create({
    rider: passenger._id,
    driver: driver._id,
    vehicleType: vehicleType._id,
    pickupLocation: { coordinates: [8.11, 6.32], address: 'Pickup' },
    dropoffLocation: { coordinates: [8.12, 6.33], address: 'Dropoff' },
    status: 'accepted',
    acceptedByDriver: true,
    paymentMethod: 'cash',
    paymentStatus: 'pending',
    fare: { totalFare: 500, riderChargeTotal: 500 },
  });

  const res = await call(rideCtl.getActiveRide, { user: { _id: passenger._id } });
  if (res.error) {
    check(false, `getActiveRide threw: ${res.error.message}`);
  } else {
    eq(res.status, 200, 'getActiveRide status');
    eq(res.body?.data?.ride?.driver?.phone, driverPhone, 'data.ride.driver.phone is the driver phone');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await disconnectDB();
}
