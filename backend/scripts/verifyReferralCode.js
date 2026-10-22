/**
 * Referral codes: one code under concurrent reads, collisions retry, backfill
 * does not duplicate, login/refresh return the code, and admin prize edits
 * show up on the next getReferralCode.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_referral_test?replicaSet=rs0' \
 *     node scripts/verifyReferralCode.js
 *
 * Safety: refuses to run unless the connected database name contains "test".
 */
import mongoose from 'mongoose';
import { writeSync } from 'node:fs';

const log = (line) => writeSync(2, `${line}\n`);

process.env.NODE_ENV = 'test';
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

const User = (await import('../src/models/User.js')).default;
const AdminSettings = (await import('../src/models/AdminSettings.js')).default;
const UserSession = (await import('../src/models/UserSession.js')).default;
const UserDevice = (await import('../src/models/UserDevice.js')).default;
const UserWallet = (await import('../src/models/UserWallet.js')).default;
const profileCtl = await import('../src/controllers/profileController.js');
const authCtl = await import('../src/controllers/authController.js');
const adminCtl = await import('../src/controllers/adminController.js');
const { useReferralCodeGenerator } = await import('../src/utils/referralCode.js');
const { backfillReferralCodes } = await import('./backfillReferralCodes.js');

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

for (const m of [User, AdminSettings, UserSession, UserDevice, UserWallet]) {
  await m.deleteMany({});
  await m.createCollection().catch(() => {});
}
try {
  await User.collection.dropIndex('referralCode_1');
} catch {
  /* first run has no index */
}
await User.collection.createIndex({ referralCode: 1 }, { unique: true, sparse: true });

let seq = 0;
const phone = () => {
  seq += 1;
  return `+234809${String(Date.now()).slice(-6)}${String(seq).padStart(2, '0')}`;
};

const insertBare = (extra = {}) =>
  User.collection.insertOne({
    name: `Bare ${seq + 1}`,
    phone: phone(),
    role: 'passenger',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });

const invoke = (handler, req) =>
  new Promise((resolve) => {
    const out = { status: 200, body: null, error: null };
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setTimeout(() => resolve(out), 0);
    };
    const res = {
      status(c) {
        out.status = c;
        return this;
      },
      json(b) {
        out.body = b;
        finish();
        return this;
      },
    };
    setTimeout(() => {
      if (!settled) {
        out.error = new Error('handler timed out');
        settled = true;
        resolve(out);
      }
    }, 20000).unref();
    handler({ ip: '127.0.0.1', headers: {}, params: {}, query: {}, body: {}, ...req }, res, (e) => {
      out.error = e || null;
      finish();
    });
  });

try {
  log('\n1. seeded collision retries');
  {
    await insertBare({ referralCode: 'COLLIDE1', name: 'Owner' });
    const bare = await insertBare({ name: 'Needs a code' });
    let n = 0;
    const restore = useReferralCodeGenerator(() => {
      n += 1;
      return n === 1 ? 'COLLIDE1' : 'FRESHCOD';
    });
    try {
      const res = await invoke(profileCtl.getReferralCode, { user: { _id: bare.insertedId } });
      check(!res.error, `getReferralCode succeeded (${res.error?.message || 'ok'})`);
      eq(res.body?.data?.referral_code, 'FRESHCOD', 'collision on the first candidate retries');
      check(n >= 2, `generator was called again after the collision (calls ${n})`);
      eq((await User.findById(bare.insertedId))?.referralCode, 'FRESHCOD', 'saved code is the retry');
    } finally {
      restore();
    }
  }

  log('\n2. five collisions is a 500');
  {
    const bare = await insertBare({ name: 'Stuck' });
    const restore = useReferralCodeGenerator(() => 'COLLIDE1');
    try {
      const res = await invoke(profileCtl.getReferralCode, { user: { _id: bare.insertedId } });
      check(!!res.error && res.error.statusCode === 500, `plain 500 after 5 collisions (got ${res.error?.statusCode})`);
      check(!(await User.findById(bare.insertedId))?.referralCode, 'failed generation does not save a code');
    } finally {
      restore();
    }
  }

  log('\n3. concurrent getReferralCode assigns one code');
  {
    const bare = await insertBare({ name: 'Race' });
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        invoke(profileCtl.getReferralCode, { user: { _id: bare.insertedId } })
      )
    );
    const codes = results.map((r) => r.body?.data?.referral_code);
    check(results.every((r) => !r.error), `no concurrent call failed (${results.map((r) => r.error?.message).filter(Boolean).join('; ')})`);
    check(codes.every((c) => c && c === codes[0]), `all 8 responses share one code (${[...new Set(codes)].join(',')})`);
    check(/^[A-Z0-9]{8}$/.test(codes[0] || ''), `code is 8 characters (${codes[0]})`);
    const saved = await User.findById(bare.insertedId);
    eq(saved?.referralCode, codes[0], 'stored code matches the responses');
    eq(await User.countDocuments({ referralCode: codes[0] }), 1, 'that code belongs to one user');
  }

  log('\n4. backfill assigns without duplicates');
  {
    const keeper = await insertBare({ referralCode: 'KEEPME01', name: 'Keeper' });
    const missing = await insertBare({ name: 'Missing' });
    const blank = await insertBare({ referralCode: '', name: 'Blank' });
    const dry = await backfillReferralCodes({ fix: false });
    eq(dry.assigned, 0, 'dry-run writes nothing');
    check(dry.missing >= 2, `dry-run counts users without a code (missing ${dry.missing})`);
    eq((await User.findById(missing.insertedId))?.referralCode || '', '', 'dry-run leaves a missing code empty');
    eq((await User.findById(blank.insertedId))?.referralCode || '', '', 'dry-run leaves a blank code empty');

    const applied = await backfillReferralCodes({ fix: true });
    eq(applied.assigned, dry.missing, 'fix assigns every missing code');
    const a = (await User.findById(missing.insertedId))?.referralCode;
    const b = (await User.findById(blank.insertedId))?.referralCode;
    check(!!a && !!b && a !== b, `backfill codes are present and distinct (${a}, ${b})`);
    eq((await User.findById(keeper.insertedId))?.referralCode, 'KEEPME01', 'existing code is left alone');
    const rows = await User.find({ referralCode: { $nin: [null, ''] } }).select('referralCode').lean();
    eq(new Set(rows.map((row) => row.referralCode)).size, rows.length, 'no duplicate referral codes');
    eq(applied.remaining, 0, 'nobody is missing a code after fix');
  }

  log('\n5. login and refresh include referral_code');
  {
    const email = `rider${Date.now()}@keke.test`;
    const created = await User.create({
      name: 'Login Rider',
      email,
      phone: phone(),
      password: 'secret12',
      role: 'passenger',
      isActive: true,
    });
    const loginRes = await invoke(authCtl.login, {
      body: { email_phone_number: email, password: 'secret12', device_id: 'device-1' },
    });
    check(!loginRes.error, `login succeeded (${loginRes.error?.message || 'ok'})`);
    const loginCode = loginRes.body?.data?.user?.referral_code;
    eq(loginCode, created.referralCode, 'login response includes referral_code');
    check(typeof loginCode === 'string' && loginCode.length > 0, 'login referral_code is non-empty');

    const refreshRes = await invoke(authCtl.refreshToken, {
      body: { refresh_token: loginRes.body?.authorisation?.refresh_token, device_id: 'device-1' },
    });
    check(!refreshRes.error, `refresh succeeded (${refreshRes.error?.message || 'ok'})`);
    eq(refreshRes.body?.data?.user?.referral_code, created.referralCode, 'refresh response includes referral_code');
  }

  log('\n6. getReferralCode returns the admin prize, including after an edit');
  {
    const past = new Date('2026-01-01T00:00:00.000Z');
    await AdminSettings.create({
      key: 'default',
      referral: {
        enabled: true,
        rewardType: 'cash',
        successfulInvitesRequired: 4,
        cashAmount: 1000,
        freeRideAmount: 1000,
        description: 'Bring friends, get paid',
        updatedAt: past,
      },
    });
    const rider = await User.findOne({ email: /@keke\.test$/ });
    const first = await invoke(profileCtl.getReferralCode, { user: { _id: rider._id } });
    check(!first.error, `getReferralCode succeeded (${first.error?.message || 'ok'})`);
    eq(first.body?.data?.reward_type, 'cash', 'reward_type comes from settings.referral');
    eq(first.body?.data?.reward_amount, 1000, 'reward_amount is the cash amount');
    eq(first.body?.data?.successful_invites_required, 4, 'successful_invites_required');
    eq(first.body?.data?.description, 'Bring friends, get paid', 'description');
    eq(new Date(first.body?.data?.updated_at).toISOString(), past.toISOString(), 'updated_at is settings.referral.updatedAt');

    const saved = await invoke(adminCtl.updateSettings, {
      user: { _id: rider._id },
      body: { referral: { cashAmount: 2500 } },
    });
    check(!saved.error, `admin referral update succeeded (${saved.error?.message || 'ok'})`);

    const second = await invoke(profileCtl.getReferralCode, { user: { _id: rider._id } });
    eq(second.body?.data?.reward_amount, 2500, 'cashAmount edit is on the next getReferralCode');
    eq(second.body?.data?.reward_type, 'cash', 'reward type is unchanged');
    eq(second.body?.data?.description, 'Bring friends, get paid', 'description is unchanged');
    check(
      new Date(second.body?.data?.updated_at).getTime() > past.getTime(),
      'referral.updatedAt moves forward when the admin edits the prize'
    );
  }
} catch (err) {
  failed++;
  log(`  FAIL uncaught ${err?.stack || err}`);
}

log(`\n${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
