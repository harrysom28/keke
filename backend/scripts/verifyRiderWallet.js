/**
 * Integration checks for the rider wallet service against a REAL MongoDB.
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/keke_wallet_test node scripts/verifyRiderWallet.js
 *
 * Safety: refuses to run unless the database name contains "test" (it empties the collections it uses).
 */
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import UserWallet from '../src/models/UserWallet.js';
import UserWalletTransaction from '../src/models/UserWalletTransaction.js';
import {
  ensureRiderWallet, creditRiderBalance, debitRiderBalance, adjustRiderBalance, getRiderBalance,
} from '../src/services/riderBalanceService.js';
import { computeRiderWalletApiTotals } from '../src/services/escrowWalletService.js';

const uri = process.env.TEST_MONGODB_URI;
if (!uri || !/test/i.test(uri.split('?')[0].split('/').pop())) {
  console.error('Set TEST_MONGODB_URI to a database whose name contains "test".');
  process.exit(2);
}

let failed = 0, passed = 0;
const check = (cond, msg) => { if (cond) { passed++; console.log('  ok  ', msg); } else { failed++; console.log('  FAIL', msg); } };
const eq = (a, b, msg) => check(a === b, `${msg} (got ${a}, want ${b})`);
const rejects = async (fn, code, msg) => {
  try { await fn(); check(false, `${msg} (did not throw)`); } catch (e) { check(!code || e.code === code, `${msg} (threw ${e.code || e.message})`); }
};
let n = 0;
const makeUser = (extra = {}) => User.create({ name: `Rider ${++n}`, phone: `+23480000${String(Date.now()).slice(-5)}${n}`, role: 'passenger', ...extra });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Some Mongo-compatible servers refuse the geo (2dsphere) index builds other models request; that is irrelevant here.
const { default: logger } = await import('../src/utils/logger.js');
logger.exitOnError = false; // the app logger exits on any unhandled rejection; a geo-index refusal must not end this run
process.on('unhandledRejection', (e) => { if (!/2dsphere/.test(String(e?.message))) { console.error('UNHANDLED', e); process.exit(3); } });
await mongoose.connect(uri);
if (!/test/i.test(mongoose.connection.db.databaseName)) {
  console.error(`Refusing to run: connected database "${mongoose.connection.db.databaseName}" does not contain "test".`);
  await mongoose.disconnect();
  process.exit(2);
}
const buildInfo = await mongoose.connection.db.admin().command({ buildInfo: 1 });
const isRealMongo = !buildInfo.ferretdbVersion;
console.log(isRealMongo ? `MongoDB ${buildInfo.version}` : `FerretDB ${buildInfo.ferretdbVersion} (not real MongoDB: concurrency-atomicity checks are SKIPPED)`);
const skip = (msg) => console.log('  skip ', msg);
await Promise.all([User.deleteMany({}), UserWallet.deleteMany({}), UserWalletTransaction.deleteMany({})]);
await UserWallet.collection.createIndex({ userId: 1 }, { unique: true });                                  // arbiter for concurrent wallet creation
await UserWalletTransaction.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true }); // arbiter for exactly-once credits

console.log('\n1. wallet creation');
{
  const u = await makeUser({ balance: 300 });
  await sleep(300);
  eq(await UserWallet.countDocuments({ userId: u._id }), 1, 'new passenger gets a wallet automatically (model hook)');
  const w = await UserWallet.findOne({ userId: u._id });
  eq(w.availableBalance, 300, 'hook wallet is seeded from the balance the rider was created with');
  const legacy = await User.create({ name: 'Legacy', phone: `+2348111${Date.now().toString().slice(-6)}`, role: 'driver', balance: 750 });
  await UserWallet.deleteMany({ userId: legacy._id });
  await User.updateOne({ _id: legacy._id }, { $set: { role: 'passenger' } });
  const made = await Promise.all(Array.from({ length: 12 }, () => ensureRiderWallet(legacy._id)));
  eq(await UserWallet.countDocuments({ userId: legacy._id }), 1, '12 concurrent ensure calls create exactly one wallet');
  eq(made[0].availableBalance, 750, 'wallet is seeded from existing User.balance (no gap created)');
  const again = await ensureRiderWallet(legacy._id);
  eq(again.availableBalance, 750, 'ensure on an existing wallet does not reseed');
}

console.log('\n2. credit');
{
  const u = await makeUser(); await sleep(200);
  const r1 = await creditRiderBalance(u._id, 500, { type: 'refund', idempotencyKey: 'k:refund:1', description: 't' });
  eq(r1.credited, true, 'first credit applied'); eq(r1.balanceAfter, 500, 'balanceAfter');
  const r2 = await creditRiderBalance(u._id, 500, { type: 'refund', idempotencyKey: 'k:refund:1', description: 't' });
  eq(r2.credited, false, 'same key again is a no-op');
  const par = await Promise.all(Array.from({ length: 10 }, () => creditRiderBalance(u._id, 200, { type: 'reward', idempotencyKey: 'k:reward:1' })));
  eq(par.filter((x) => x.credited).length, 1, '10 parallel credits with one key apply exactly once');
  const w = await UserWallet.findOne({ userId: u._id });
  eq(w.availableBalance, 700, 'wallet = 500 + 200');
  eq((await User.findById(u._id)).balance, 700, 'User.balance mirror equals wallet');
  eq(await UserWalletTransaction.countDocuments({ userId: u._id, status: 'completed' }), 2, 'two completed ledger rows');
  const noKey = await Promise.all([creditRiderBalance(u._id, 10), creditRiderBalance(u._id, 10)]);
  eq(noKey.filter((x) => x.credited).length, 2, 'credits without a key are independent');
  await rejects(() => creditRiderBalance(u._id, 0), null, 'rejects zero');
  await rejects(() => creditRiderBalance(u._id, -5), null, 'rejects negative');
  await rejects(() => creditRiderBalance(u._id, NaN), null, 'rejects NaN');
  await UserWalletTransaction.updateOne({ idempotencyKey: 'k:refund:1' }, { $set: { status: 'failed' } });
  const retry = await creditRiderBalance(u._id, 500, { type: 'refund', idempotencyKey: 'k:refund:1' });
  eq(retry.credited, true, 'a key whose earlier attempt FAILED can be retried');
}

console.log('\n2b. failure and crash semantics');
{
  const u = await makeUser(); await sleep(200);
  // The atomic wallet update THROWS once, after the ledger row was claimed.
  const real = UserWallet.findOneAndUpdate;
  let thrown = 0;
  UserWallet.findOneAndUpdate = function patched(filter, update, ...rest) {
    if (update?.$inc?.availableBalance > 0 && thrown === 0) { thrown++; throw new Error('simulated db failure'); }
    return real.call(this, filter, update, ...rest);
  };
  await rejects(() => creditRiderBalance(u._id, 300, { type: 'reward', idempotencyKey: 'k:throw:1' }), null, 'credit whose update throws propagates the error');
  UserWallet.findOneAndUpdate = real;
  const failedRow = await UserWalletTransaction.findOne({ idempotencyKey: 'k:throw:1' });
  eq(failedRow?.status, 'failed', 'the claimed row is marked failed when the update throws');
  eq((await getRiderBalance(u._id)).available, 0, 'no money moved by the failed attempt');
  const retry = await creditRiderBalance(u._id, 300, { type: 'reward', idempotencyKey: 'k:throw:1' });
  eq(retry.credited, true, 'retry after a failed attempt succeeds');
  const again = await creditRiderBalance(u._id, 300, { type: 'reward', idempotencyKey: 'k:throw:1' });
  eq(again.credited, false, 'and a further retry does not pay again');
  eq((await getRiderBalance(u._id)).available, 300, 'paid exactly once');
  eq(await UserWalletTransaction.countDocuments({ idempotencyKey: 'k:throw:1' }), 1, 'one ledger row for the key');
  if (isRealMongo) {
    // Two retries race for the same failed row: exactly one wins it.
    await UserWalletTransaction.create({ userId: u._id, type: 'reward', amount: 50, description: 'x', status: 'failed', idempotencyKey: 'k:race:1' });
    const rr = await Promise.all(Array.from({ length: 6 }, () => creditRiderBalance(u._id, 50, { type: 'reward', idempotencyKey: 'k:race:1' })));
    eq(rr.filter((x) => x.credited).length, 1, '6 concurrent retries of a failed key pay exactly once');
    eq((await getRiderBalance(u._id)).available, 350, 'wallet = 300 + 50');
  }

  // A row left 'pending' (the process died between claim and update) is never auto-retried.
  await UserWalletTransaction.create({ userId: u._id, type: 'reward', amount: 70, description: 'died', status: 'pending', idempotencyKey: 'k:pending:1' });
  const p = await creditRiderBalance(u._id, 70, { type: 'reward', idempotencyKey: 'k:pending:1' });
  check(p.credited === false && p.pending === true, "a row left 'pending' returns credited:false, pending:true");
  const dp = await debitRiderBalance(u._id, 10, { idempotencyKey: 'k:pendingdebit:1' }).catch(() => null);
  await UserWalletTransaction.updateOne({ idempotencyKey: 'k:pendingdebit:1' }, { $set: { status: 'pending' } });
  const dp2 = await debitRiderBalance(u._id, 10, { idempotencyKey: 'k:pendingdebit:1' });
  check(dp2.debited === false && dp2.pending === true, "a debit row left 'pending' is reported, not retried");
  void dp;
  const before = (await getRiderBalance(u._id)).available;
  await creditRiderBalance(u._id, 70, { type: 'reward', idempotencyKey: 'k:pending:1' });
  eq((await getRiderBalance(u._id)).available, before, "a pending row never moves money on later attempts");
}

console.log('\n3. debit');
{
  const u = await makeUser(); await sleep(200);
  await creditRiderBalance(u._id, 250, { type: 'topup' });
  await rejects(() => debitRiderBalance(u._id, 300), 'INSUFFICIENT_BALANCE', 'cannot overdraw');
  if (isRealMongo) {
    const res = await Promise.allSettled(Array.from({ length: 5 }, () => debitRiderBalance(u._id, 100)));
    eq(res.filter((x) => x.status === 'fulfilled').length, 2, '5 parallel 100 debits against 250: exactly 2 succeed');
    eq((await UserWallet.findOne({ userId: u._id })).availableBalance, 50, 'balance never goes negative (50 left)');
  } else {
    skip('5 parallel debits (needs real MongoDB single-document atomicity; FerretDB loses concurrent updates)');
    await debitRiderBalance(u._id, 100); await debitRiderBalance(u._id, 100);
    eq((await UserWallet.findOne({ userId: u._id })).availableBalance, 50, 'two sequential 100 debits leave 50');
  }
  {
    const f = await makeUser(); await sleep(200);
    await creditRiderBalance(f._id, 400, { type: 'topup' });
    const full = await Promise.allSettled(Array.from({ length: 5 }, () => debitRiderBalance(f._id, 400)));
    eq(full.filter((x) => x.status === 'fulfilled').length, 1, '5 parallel debits of the FULL balance: exactly one succeeds');
    check(full.filter((x) => x.status === 'rejected').every((x) => x.reason.code === 'INSUFFICIENT_BALANCE'), 'the other four are refused as insufficient');
    eq((await UserWallet.findOne({ userId: f._id })).availableBalance, 0, 'balance is zero, never negative');
    eq((await User.findById(f._id)).balance, 0, 'mirror equals wallet after the parallel debits');
  }
  const a = await debitRiderBalance(u._id, 10, { idempotencyKey: 'k:fare:1' });
  const b = await debitRiderBalance(u._id, 10, { idempotencyKey: 'k:fare:1' });
  check(a.debited === true && b.debited === false, 'same fare key charges once');
  await UserWallet.updateOne({ userId: u._id }, { $set: { frozen: true } });
  await rejects(() => debitRiderBalance(u._id, 1), 'WALLET_FROZEN', 'frozen wallet cannot be debited');
  const failedRows = await UserWalletTransaction.countDocuments({ userId: u._id, status: 'failed' });
  check(failedRows >= 2, `refused debits leave only failed rows, no money moved (${failedRows} failed)`);
  eq((await UserWallet.findOne({ userId: u._id })).availableBalance, 40, 'refused debits changed nothing (50 - 10 fare = 40)');
  eq((await User.findById(u._id)).balance, 40, 'mirror equals wallet after debits and refusals');
}

console.log('\n4. admin / reconciliation adjustment');
{
  const u = await makeUser(); await sleep(200);
  await rejects(() => adjustRiderBalance(u._id, 100, {}), null, 'adjustment without a reason is refused');
  const up = await adjustRiderBalance(u._id, 100, { reason: 'goodwill', adminId: 'admin1' });
  eq(up.balanceAfter, 100, 'positive adjustment credits');
  const down = await adjustRiderBalance(u._id, -40, { reason: 'correction', adminId: 'admin1' });
  eq(down.balanceAfter, 60, 'negative adjustment debits');
  const row = await UserWalletTransaction.findOne({ userId: u._id, type: 'admin_adjustment' });
  check(row && /admin1/.test(row.description) && /goodwill|correction/.test(row.description), 'ledger row names the admin and the reason');
}

console.log('\n5. balance reads');
{
  const u = await makeUser(); await sleep(200);
  await creditRiderBalance(u._id, 120, { type: 'topup' });
  await User.updateOne({ _id: u._id }, { $set: { balance: 999 } }); // simulate drift of the legacy mirror
  const b = await getRiderBalance(u._id);
  eq(b.available, 120, 'getRiderBalance reads the wallet, not the drifted mirror'); eq(b.source, 'wallet', 'source = wallet');
  const wallet = await UserWallet.findOne({ userId: u._id }).lean();
  delete process.env.RIDER_BALANCE_WALLET_ONLY;
  eq(computeRiderWalletApiTotals(999, wallet).availableBalance, 999, 'default screen total still shows the higher number (until reconciled)');
  process.env.RIDER_BALANCE_WALLET_ONLY = 'true';
  eq(computeRiderWalletApiTotals(999, wallet).availableBalance, 120, 'with RIDER_BALANCE_WALLET_ONLY=true the screen shows the wallet');
  delete process.env.RIDER_BALANCE_WALLET_ONLY;
}

console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
