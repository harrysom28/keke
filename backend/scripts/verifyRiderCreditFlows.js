/**
 * End-to-end checks of every rider credit/debit call site against a REAL MongoDB (replica set preferred, so the
 * Mongo-transaction paths in creditWalletFromPaystack and processRidePayment really run).
 * Calls the actual controllers/services with fake req/res objects.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_flows_test?replicaSet=rs0' node scripts/verifyRiderCreditFlows.js
 *
 * Safety: refuses to run unless the connected database name contains "test" (it empties every collection), and
 * refuses FerretDB and other servers that are not real MongoDB.
 */
import mongoose from 'mongoose';
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_for_flow_checks'; // paymentController builds its Stripe client at import time
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
const UserWallet = await M('../src/models/UserWallet.js');
const UserWalletTransaction = await M('../src/models/UserWalletTransaction.js');
const Ride = await M('../src/models/Ride.js');
const Payment = await M('../src/models/Payment.js');
const AdminSettings = await M('../src/models/AdminSettings.js');
const AuditLog = await M('../src/models/AuditLog.js');
const DriverWallet = await M('../src/models/DriverWallet.js');
const Transaction = await M('../src/models/Transaction.js');
const WalletFundingTransaction = await M('../src/models/WalletFundingTransaction.js');
const PaystackUnmatchedPayment = await M('../src/models/PaystackUnmatchedPayment.js');
const axios = await M('axios');
const Stripe = await M('stripe');
const features = await import('../src/controllers/additionalFeaturesController.js');
const payments = await import('../src/controllers/paymentController.js');
const admin = await import('../src/controllers/adminController.js');
const { validationRules } = await import('../src/middleware/validation.js');
const { validationResult } = await import('express-validator');
const { processRideRefund } = await import('../src/services/refundService.js');
const { processRidePayment } = await import('../src/services/paymentService.js');
const { creditWalletFromPaystack } = await import('../src/services/walletFundingService.js');
const { reconcilePaystackFunding } = await import('../src/services/paystackReconcileService.js');
const { creditRiderBalance, getRiderBalance } = await import('../src/services/riderBalanceService.js');
const { computeRiderWalletApiTotals } = await import('../src/services/escrowWalletService.js');

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
await WalletFundingTransaction.collection.createIndex({ reference: 1 }, { unique: true });
await PaystackUnmatchedPayment.collection.createIndex({ reference: 1 }, { unique: true });
await Transaction.collection.createIndex({ transactionId: 1 }, { unique: true });
// Collections must exist before a transaction touches them.
for (const m of [UserWallet, UserWalletTransaction, WalletFundingTransaction, Payment, User, Ride]) await m.createCollection().catch(() => {});

// Stripe: answer paymentIntents.retrieve locally (the resource methods live on a prototype shared by all clients).
const intents = {};
Object.getPrototypeOf(new Stripe('sk_test_x').paymentIntents).retrieve = async (id) => intents[id] || { id, status: 'requires_payment_method', amount: 0 };

try {
let seq = 0;
const makeRider = async (extra = {}) => {
  const u = await User.create({ name: `Rider ${++seq}`, phone: `+234800${String(Date.now()).slice(-6)}${seq}`, role: 'passenger', ...extra });
  await sleep(120); // post-save hook creates the wallet
  return u;
};
const wallet = async (id) => (await UserWallet.findOne({ userId: id }).lean())?.availableBalance;
const mirror = async (id) => (await User.findById(id).lean())?.balance;
const makeRide = (rider, extra = {}) => Ride.create({
  rider, vehicleType: new mongoose.Types.ObjectId(),
  pickupLocation: { coordinates: [7.5, 6.3], address: 'A' }, dropoffLocation: { coordinates: [7.6, 6.4], address: 'B' },
  status: 'completed', paymentMethod: 'cash', fare: { totalFare: 500, riderChargeTotal: 500 }, ...extra,
});
const call = (handler, req) => new Promise((resolve) => {
  // asyncHandler() does not return its promise, so wait for the response or next(err) instead.
  const out = { status: 200, body: null, error: null };
  const done = () => setTimeout(() => resolve(out), 0);
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; done(); return this; }, set() { return this; }, send(b) { out.body = b; done(); return this; } };
  setTimeout(() => { out.error = new Error('handler timed out'); resolve(out); }, 20000).unref();
  handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req }, res, (e) => { out.error = e || null; done(); });
});
const errMsg = (r) => (r.error ? ` [${r.error.message}]` : '');
const rows = (id, type) => UserWalletTransaction.find({ userId: id, type }).lean();
const adminUser = () => ({ _id: new mongoose.Types.ObjectId(), email: 'a@keke.test' });
const failWalletUpdates = () => {
  const real = UserWallet.findOneAndUpdate;
  UserWallet.findOneAndUpdate = () => { throw new Error('simulated database failure'); };
  return () => { UserWallet.findOneAndUpdate = real; };
};

console.log('\nA. milestone reward');
{
  const u = await makeRider();
  await Ride.collection.insertMany(Array.from({ length: 10 }, () => ({ rider: u._id, status: 'completed' })));
  const r1 = await call(features.claimMilestoneOffer, { user: { _id: u._id } });
  eq(r1.body?.data?.claimed, true, 'first claim succeeds' + errMsg(r1));
  eq(await wallet(u._id), 1000, 'wallet got the reward'); eq(await mirror(u._id), 1000, 'mirror matches');
  const r2 = await call(features.claimMilestoneOffer, { user: { _id: u._id } });
  check(!!r2.error, 'second claim refused'); eq(await wallet(u._id), 1000, 'no second payment');
  eq((await rows(u._id, 'reward')).length, 1, 'exactly one reward ledger row');
  eq((await User.findById(u._id).lean()).tenRideFreeClaimed, true, 'claim flag stays set');

  // forced failure, then retry
  const v = await makeRider();
  await Ride.collection.insertMany(Array.from({ length: 10 }, () => ({ rider: v._id, status: 'completed' })));
  const restore = failWalletUpdates();
  const bad = await call(features.claimMilestoneOffer, { user: { _id: v._id } });
  restore();
  check(!!bad.error, 'credit failure surfaces as an error');
  eq((await User.findById(v._id).lean()).tenRideFreeClaimed, false, 'claim flag rolled back after the failed credit');
  eq((await UserWalletTransaction.findOne({ idempotencyKey: `reward:milestone:${v._id}` }).lean())?.status, 'failed', 'ledger row marked failed');
  const again = await call(features.claimMilestoneOffer, { user: { _id: v._id } });
  eq(again.body?.data?.claimed, true, 'retry after a failed attempt succeeds' + errMsg(again)); eq(await wallet(v._id), 1000, 'rider paid exactly once');

  // double tap in parallel
  const w = await makeRider();
  await Ride.collection.insertMany(Array.from({ length: 10 }, () => ({ rider: w._id, status: 'completed' })));
  const par = await Promise.all([1, 2, 3, 4].map(() => call(features.claimMilestoneOffer, { user: { _id: w._id } })));
  eq(par.filter((r) => r.body?.data?.claimed === true).length, 1, '4 parallel taps: exactly one claim succeeds'); eq(await wallet(w._id), 1000, 'paid once');

  // a ledger row left 'pending' must NOT be reported as a success
  const p = await makeRider();
  await Ride.collection.insertMany(Array.from({ length: 10 }, () => ({ rider: p._id, status: 'completed' })));
  await UserWalletTransaction.create({ userId: p._id, type: 'reward', amount: 1000, description: 'died mid-way', status: 'pending', idempotencyKey: `reward:milestone:${p._id}` });
  const pr = await call(features.claimMilestoneOffer, { user: { _id: p._id } });
  check(!!pr.error && /being processed/i.test(pr.error.message) && pr.body?.data?.claimed !== true, "pending ledger row: answers 'being processed', not 'claimed'" + errMsg(pr));
  eq(await wallet(p._id), 0, 'and no money moved');
}

console.log('\nB. referral reward');
{
  await AdminSettings.collection.insertOne({ key: 'default', referral: { enabled: true, rewardType: 'cash', successfulInvitesRequired: 1, cashAmount: 500 } });
  const ref = await makeRider();
  const friend = await makeRider({ referredBy: ref._id, isRegCompleted: true });
  await Ride.collection.insertOne({ rider: friend._id, status: 'completed' });
  const r1 = await call(features.claimReferralReward, { user: { _id: ref._id } });
  eq(r1.body?.data?.claimed, true, 'claim succeeds' + errMsg(r1)); eq(await wallet(ref._id), 500, 'wallet got the reward');
  const r2 = await call(features.claimReferralReward, { user: { _id: ref._id } });
  check(!!r2.error, 'second claim refused (needs another invite)'); eq(await wallet(ref._id), 500, 'no second payment');
  eq((await User.findById(ref._id).lean()).referralRewardsClaimedCount, 1, 'claim counter = 1');
  eq((await UserWalletTransaction.findOne({ idempotencyKey: `reward:referral:${ref._id}:1` }).lean())?.status, 'completed', 'ledger key reward:referral:<user>:<n>');

  // forced failure then retry
  const ref2 = await makeRider();
  const f2 = await makeRider({ referredBy: ref2._id, isRegCompleted: true });
  await Ride.collection.insertOne({ rider: f2._id, status: 'completed' });
  const restore = failWalletUpdates();
  const bad = await call(features.claimReferralReward, { user: { _id: ref2._id } });
  restore();
  check(!!bad.error, 'credit failure surfaces as an error');
  eq((await User.findById(ref2._id).lean()).referralRewardsClaimedCount, 0, 'counter rolled back after the failed credit');
  const retry = await call(features.claimReferralReward, { user: { _id: ref2._id } });
  eq(retry.body?.data?.claimed, true, 'retry succeeds' + errMsg(retry)); eq(await wallet(ref2._id), 500, 'paid once');

  // pending row is not a success
  const ref3 = await makeRider();
  const f3 = await makeRider({ referredBy: ref3._id, isRegCompleted: true });
  await Ride.collection.insertOne({ rider: f3._id, status: 'completed' });
  await UserWalletTransaction.create({ userId: ref3._id, type: 'reward', amount: 500, description: 'died', status: 'pending', idempotencyKey: `reward:referral:${ref3._id}:1` });
  const pr = await call(features.claimReferralReward, { user: { _id: ref3._id } });
  check(!!pr.error && /being processed/i.test(pr.error.message) && pr.body?.data?.claimed !== true, "pending ledger row: answers 'being processed', not 'claimed'" + errMsg(pr));
  eq(await wallet(ref3._id), 0, 'and no money moved');
}

console.log('\nC. change after a cash ride');
{
  const u = await makeRider();
  const ride = await makeRide(u._id, { changeAmount: 150 });
  const r1 = await call(payments.retrieveChange, { user: { _id: u._id }, query: { rideId: ride._id.toString() } });
  eq(r1.body?.data?.change_amount, 150, 'change returned' + errMsg(r1)); eq(await wallet(u._id), 150, 'wallet got the change');
  eq(await mirror(u._id), 150, 'mirror matches');
  const r2 = await call(payments.retrieveChange, { user: { _id: u._id }, query: { rideId: ride._id.toString() } });
  eq(r2.body?.data?.change_amount, 0, 'second call: nothing left'); eq(await wallet(u._id), 150, 'no double credit');
  // ride.save failed after the credit on a first attempt: changeAmount is still set, the key stops a second payment
  await Ride.updateOne({ _id: ride._id }, { $set: { changeAmount: 150 } });
  const r3 = await call(payments.retrieveChange, { user: { _id: u._id }, query: { rideId: ride._id.toString() } });
  check(!r3.error, 'replay after a half-finished first attempt is accepted' + errMsg(r3)); eq(await wallet(u._id), 150, 'still no double credit');
}

console.log('\nD. cancellation refund');
{
  const u = await makeRider();
  const ride = await makeRide(u._id);
  await Payment.create({ user: u._id, ride: ride._id, amount: 1000, method: 'wallet', status: 'completed', transactionId: `T-${Date.now()}` });
  const fake = { _id: ride._id, rider: u._id, save: async () => {} };
  await processRideRefund(fake, 200);
  eq(await wallet(u._id), 800, 'refund = payment - fee'); eq(await mirror(u._id), 800, 'mirror matches');
  await processRideRefund(fake, 200);
  eq(await wallet(u._id), 800, 'repeating the refund does not pay twice');
  eq((await rows(u._id, 'refund')).length, 1, 'one refund ledger row');
}

console.log('\nE. admin payment refund');
{
  const u = await makeRider();
  const payment = await Payment.create({ user: u._id, amount: 1000, method: 'wallet', status: 'completed', transactionId: `T2-${Date.now()}` });
  const a = adminUser();
  const r1 = await call(admin.processRefund, { user: a, params: { id: payment._id.toString() }, body: { amount: 400, method: 'wallet', reason: 'test' } });
  check(!r1.error, `refund 400 ok${errMsg(r1)}`); eq(await wallet(u._id), 400, 'wallet +400');
  const r2 = await call(admin.processRefund, { user: a, params: { id: payment._id.toString() }, body: { amount: 300, method: 'wallet', reason: 'test' } });
  check(!r2.error, `second partial refund ok${errMsg(r2)}`); eq(await wallet(u._id), 700, 'wallet +300 more (a later partial refund still pays)');
  eq((await rows(u._id, 'refund')).length, 2, 'two refund ledger rows');
  // a retry of the SAME refund after a crash between the credit and processRefund(): same cumulative key, pays nothing
  await Payment.updateOne({ _id: payment._id }, { $set: { refundAmount: 400, status: 'completed' } });
  const r3 = await call(admin.processRefund, { user: a, params: { id: payment._id.toString() }, body: { amount: 300, method: 'wallet', reason: 'test' } });
  check(!r3.error, `replay accepted${errMsg(r3)}`); eq(await wallet(u._id), 700, 'replayed refund (same cumulative amount) did not pay again');
}

console.log('\nF. dispute refund (driver clawback still runs)');
{
  const u = await makeRider();
  const driverId = new mongoose.Types.ObjectId();
  const ride = await makeRide(u._id, { driver: driverId, fare: { totalFare: 800, riderChargeTotal: 800, driverNetAmount: 300 } });
  await Payment.create({ user: u._id, ride: ride._id, amount: 800, method: 'wallet', status: 'completed', transactionId: `T3-${Date.now()}` });
  await DriverWallet.collection.insertOne({ driverId, availableBalance: 500, pendingBalance: 0, currency: 'NGN', clawbackOwed: 0 });
  await Transaction.create({ transactionId: `E-${Date.now()}`, rideId: ride._id, driverId, type: 'ride_earning', amount: 300, currency: 'NGN', balanceBefore: 200, balanceAfter: 500 });
  const a = adminUser();
  const r = await call(admin.handleDispute, { user: a, params: { id: ride._id.toString() }, body: { resolution: 'refund_to_wallet', refundAmount: 200, reason: 'test' } });
  check(!r.error, `dispute handled${errMsg(r)}`); eq(await wallet(u._id), 200, 'rider wallet +200');
  eq(await Transaction.countDocuments({ rideId: ride._id, type: 'clawback_accrued' }), 1, 'driver clawback transaction was recorded');
  eq((await DriverWallet.findOne({ driverId }).lean()).availableBalance, 200, 'driver wallet had the 300 net taken back');
  eq((await UserWalletTransaction.findOne({ idempotencyKey: { $regex: '^refund:dispute:' } }).lean())?.status, 'completed', 'ledger key refund:dispute:<payment>');
}

console.log('\nG. pay for a completed ride from the wallet');
{
  const u = await makeRider({ balance: 1000 });
  const ride = await makeRide(u._id, { paymentStatus: 'pending' });
  await UserWallet.updateOne({ userId: u._id }, { $set: { availableBalance: 1000 } });
  const r1 = await call(payments.payForRideWithWallet, { user: { _id: u._id }, body: { rideId: ride._id.toString() } });
  check(!r1.error, `paid${errMsg(r1)}`); eq(await wallet(u._id), 500, 'wallet charged 500'); eq(await mirror(u._id), 500, 'mirror matches');
  const r2 = await call(payments.payForRideWithWallet, { user: { _id: u._id }, body: { rideId: ride._id.toString() } });
  check(!!r2.error, 'paying again is refused'); eq(await wallet(u._id), 500, 'not charged twice');
  const poor = await makeRider(); const ride2 = await makeRide(poor._id, { paymentStatus: 'pending' });
  const r3 = await call(payments.payForRideWithWallet, { user: { _id: poor._id }, body: { rideId: ride2._id.toString() } });
  check(!!r3.error && /nsufficient/.test(r3.error.message), 'insufficient balance refused'); eq(await wallet(poor._id), 0, 'balance untouched');

  // initializePayment (wallet) uses the same key
  const v = await makeRider(); await creditRiderBalance(v._id, 900, { type: 'topup' });
  const ride3 = await makeRide(v._id, { paymentStatus: 'pending' });
  const i1 = await call(payments.initializePayment, { user: { _id: v._id }, body: { rideId: ride3._id.toString(), amount: 500, method: 'wallet' } });
  check(!i1.error, `initializePayment (wallet) paid${errMsg(i1)}`); eq(await wallet(v._id), 400, 'wallet charged 500');
  await Ride.updateOne({ _id: ride3._id }, { $set: { paymentStatus: 'pending' } });
  const i2 = await call(payments.initializePayment, { user: { _id: v._id }, body: { rideId: ride3._id.toString(), amount: 500, method: 'wallet' } });
  check(!!i2.error, 'second initializePayment for the same ride refused'); eq(await wallet(v._id), 400, 'not charged twice');
  const i3 = await call(payments.payForRideWithWallet, { user: { _id: v._id }, body: { rideId: ride3._id.toString() } });
  check(!!i3.error, 'pay-for-ride after initializePayment refused'); eq(await wallet(v._id), 400, 'still not charged twice');
}

console.log('\nG2. processRidePayment legacy wallet debit (Mongo transaction path)');
{
  const u = await makeRider(); await creditRiderBalance(u._id, 1000, { type: 'topup' });
  const ride = await makeRide(u._id, { paymentMethod: 'wallet', paymentStatus: 'pending' });
  const res = await processRidePayment(await Ride.findById(ride._id));
  check(res.success === true && res.payment?.status === 'completed', 'payment processed');
  eq(await wallet(u._id), 500, 'wallet debited by the rider charge inside the transaction'); eq(await mirror(u._id), 500, 'mirror matches');
  eq(await Payment.countDocuments({ ride: ride._id, method: 'wallet' }), 1, 'one Payment row');
  eq((await UserWalletTransaction.findOne({ idempotencyKey: `fare:wallet:${ride._id}` }).lean())?.status, 'completed', 'ledger key fare:wallet:<ride>');
  const again = await processRidePayment(await Ride.findById(ride._id));
  eq(again.message, 'Payment already processed', 'second call is a no-op'); eq(await wallet(u._id), 500, 'not charged twice');

  // insufficient: the transaction rolls back, so no Payment row survives
  const poor = await makeRider(); await creditRiderBalance(poor._id, 100, { type: 'topup' });
  const ride2 = await makeRide(poor._id, { paymentMethod: 'wallet', paymentStatus: 'pending' });
  let threw = null; try { await processRidePayment(await Ride.findById(ride2._id)); } catch (e) { threw = e; }
  check(!!threw && /nsufficient/.test(threw.message), 'insufficient balance refused');
  eq(await wallet(poor._id), 100, 'wallet untouched'); eq(await Payment.countDocuments({ ride: ride2._id }), 0, 'no Payment row left behind (rolled back)');

  // already charged through another route: no second charge, existing payment reused
  const w = await makeRider(); await creditRiderBalance(w._id, 1000, { type: 'topup' });
  const ride3 = await makeRide(w._id, { paymentStatus: 'pending' });
  await call(payments.payForRideWithWallet, { user: { _id: w._id }, body: { rideId: ride3._id.toString() } });
  await Ride.updateOne({ _id: ride3._id }, { $set: { paymentMethod: 'wallet', paymentStatus: 'pending' } });
  const reuse = await processRidePayment(await Ride.findById(ride3._id));
  check(reuse.success === true, 'completion after pay-for-ride succeeds'); eq(await wallet(w._id), 500, 'charged exactly once overall');
  eq(await Payment.countDocuments({ ride: ride3._id, method: 'wallet' }), 1, 'no duplicate Payment row');
}

console.log('\nH. Stripe: both routes share one key');
{
  const u = await makeRider();
  intents.pi_A = { id: 'pi_A', status: 'succeeded', amount: 100000, latest_charge: 'ch_A' };
  await Payment.create({ user: u._id, amount: 1000, method: 'stripe', status: 'processing', stripePaymentIntentId: 'pi_A' });
  const c1 = await call(payments.confirmStripePayment, { user: { _id: u._id, role: 'passenger' }, body: { paymentIntentId: 'pi_A' } });
  check(!c1.error, `confirmStripePayment credited${errMsg(c1)}`); eq(await wallet(u._id), 1000, 'wallet +1000');
  const t1 = await call(payments.topUpWallet, { user: { _id: u._id, role: 'passenger' }, body: { amount: 1000, method: 'card', paymentIntentId: 'pi_A' } });
  check(!t1.error, `topUpWallet on the same intent answers${errMsg(t1)}`); eq(await wallet(u._id), 1000, 'no second credit from the other route');
  eq(await UserWalletTransaction.countDocuments({ idempotencyKey: 'stripe:pi_A' }), 1, 'one ledger row for the intent');

  const v = await makeRider();
  intents.pi_B = { id: 'pi_B', status: 'succeeded', amount: 50000, latest_charge: 'ch_B' };
  const t2 = await call(payments.topUpWallet, { user: { _id: v._id, role: 'passenger' }, body: { amount: 500, method: 'card', paymentIntentId: 'pi_B' } });
  check(!t2.error, `topUpWallet credited${errMsg(t2)}`); eq(await wallet(v._id), 500, 'wallet +500');
  await Payment.updateOne({ stripePaymentIntentId: 'pi_B' }, { $set: { status: 'processing' } }); // reopen so confirm gets as far as the credit
  const c2 = await call(payments.confirmStripePayment, { user: { _id: v._id, role: 'passenger' }, body: { paymentIntentId: 'pi_B' } });
  void c2; eq(await wallet(v._id), 500, 'confirmStripePayment after topUpWallet: still 500');
}

console.log('\nH2. Stripe top-up routes are rider-only');
{
  const drv = await User.create({ name: 'Drv', phone: `+234812${String(Date.now()).slice(-6)}`, role: 'driver', balance: 40 });
  await sleep(120);
  intents.pi_D = { id: 'pi_D', status: 'succeeded', amount: 100000, latest_charge: 'ch_D' };
  await Payment.create({ user: drv._id, amount: 1000, method: 'stripe', status: 'processing', stripePaymentIntentId: 'pi_D' });
  const walletsBefore = await UserWallet.countDocuments({});
  const ledgerBefore = await UserWalletTransaction.countDocuments({});
  const driverWalletsBefore = await DriverWallet.countDocuments({});
  for (const role of ['driver', 'admin']) {
    const as = { _id: drv._id, role };
    const t = await call(payments.topUpWallet, { user: as, body: { amount: 1000, method: 'card', paymentIntentId: 'pi_D' } });
    check(t.error?.statusCode === 403 && /riders/i.test(t.error.message), `topUpWallet refused for role ${role} with 403${errMsg(t)}`);
    const c = await call(payments.confirmStripePayment, { user: as, body: { paymentIntentId: 'pi_D' } });
    check(c.error?.statusCode === 403 && /riders/i.test(c.error.message), `confirmStripePayment refused for role ${role} with 403${errMsg(c)}`);
  }
  eq(await UserWallet.countDocuments({ userId: drv._id }), 0, 'no wallet was created for the driver');
  eq(await UserWallet.countDocuments({}), walletsBefore, 'no wallet of any kind was created');
  eq(await UserWalletTransaction.countDocuments({}), ledgerBefore, 'no ledger row was written (not even a pending one)');
  eq((await User.findById(drv._id).lean()).balance, 40, 'driver User.balance untouched');
  eq((await Payment.findOne({ stripePaymentIntentId: 'pi_D' }).lean()).status, 'processing', 'the payment was not marked completed');
  eq(await DriverWallet.countDocuments({}), driverWalletsBefore, 'driver wallets untouched');
  // the rider routes still work for a passenger (covered in H); a rider body without a role field is refused too
  const noRole = await call(payments.topUpWallet, { user: { _id: drv._id }, body: { amount: 1000, method: 'card', paymentIntentId: 'pi_D' } });
  eq(noRole.error?.statusCode, 403, 'a user object with no role is refused');
}

console.log('\nH3. confirmStripePayment only for the payment owner');
{
  const rider = await makeRider();
  const otherRider = await makeRider({ balance: 25 });
  const drv = await User.create({ name: 'Drv2', phone: `+234813${String(Date.now()).slice(-6)}`, role: 'driver', balance: 60 });
  await sleep(120);
  for (const [id, amt] of [['pi_own_drv', 70000], ['pi_own_rider', 80000]]) intents[id] = { id, status: 'succeeded', amount: amt, latest_charge: `ch_${id}` };
  await Payment.create({ user: drv._id, amount: 700, method: 'stripe', status: 'processing', stripePaymentIntentId: 'pi_own_drv' });
  await Payment.create({ user: otherRider._id, amount: 800, method: 'stripe', status: 'processing', stripePaymentIntentId: 'pi_own_rider' });
  const snap = async () => ({
    wallets: await UserWallet.find({}).sort({ userId: 1 }).lean(),
    ledger: await UserWalletTransaction.countDocuments({}),
    funding: await WalletFundingTransaction.countDocuments({}),
    payments: await Payment.find({ stripePaymentIntentId: { $in: ['pi_own_drv', 'pi_own_rider'] } }).sort({ stripePaymentIntentId: 1 }).lean(),
    balances: (await User.find({ _id: { $in: [rider._id, otherRider._id, drv._id] } }).sort({ _id: 1 }).lean()).map((x) => x.balance),
  });
  const before = JSON.stringify(await snap());
  intents.pi_does_not_exist = { id: 'pi_does_not_exist', status: 'succeeded', amount: 100, latest_charge: 'ch_x' };
  const missing2 = await call(payments.confirmStripePayment, { user: { _id: rider._id, role: 'passenger' }, body: { paymentIntentId: 'pi_does_not_exist' } });
  for (const [label, pi] of [['a driver', 'pi_own_drv'], ['another rider', 'pi_own_rider']]) {
    const r = await call(payments.confirmStripePayment, { user: { _id: rider._id, role: 'passenger' }, body: { paymentIntentId: pi } });
    check(r.error?.statusCode === 404 && r.body === null, `confirming a payment owned by ${label} is refused with 404${errMsg(r)}`);
    check(r.error?.message === missing2.error?.message && r.error?.statusCode === missing2.error?.statusCode, `...and it is the same error as for a payment that does not exist (${label})`);
  }
  eq(JSON.stringify(await snap()), before, 'wallets, ledger, funding rows, payments and balances are all exactly as they were');
  const own = (await Payment.findOne({ stripePaymentIntentId: 'pi_own_rider' }).lean());
  check(own.status === 'processing' && !own.paidAt && !own.transactionId, 'the other user\'s payment stayed processing, unpaid, no transaction id');
  eq(await UserWallet.countDocuments({ userId: drv._id }), 0, 'no wallet created for the driver owner');
  // the owner can still confirm their own payment
  const mine = await call(payments.confirmStripePayment, { user: { _id: otherRider._id, role: 'passenger' }, body: { paymentIntentId: 'pi_own_rider' } });
  check(!mine.error, `the owner can still confirm it${errMsg(mine)}`); eq(await wallet(otherRider._id), 800 + 25, 'owner credited once (seeded 25 + 800)');
}

console.log('\nI. Paystack top-up credit (rider with no wallet yet; real transaction path)');
{
  const u = await makeRider();
  await UserWallet.deleteMany({ userId: u._id }); await User.updateOne({ _id: u._id }, { $set: { balance: 250 } });
  const r = await creditWalletFromPaystack('REF-1', 1000, u._id.toString(), { channel: 'dedicated_nuban', ip: 'x' });
  eq(r.credited, true, 'credited');
  eq(await wallet(u._id), 1250, 'wallet created from the 250 balance, then +1000'); eq(await mirror(u._id), 1250, 'mirror matches');
  const r2 = await creditWalletFromPaystack('REF-1', 1000, u._id.toString(), { channel: 'dedicated_nuban', ip: 'x' });
  eq(r2.credited, false, 'same reference again: not credited'); eq(await wallet(u._id), 1250, 'balance unchanged');
  eq(await WalletFundingTransaction.countDocuments({ reference: 'REF-1' }), 1, 'one funding ledger row');
  const par = await Promise.all(Array.from({ length: 5 }, () => creditWalletFromPaystack('REF-2', 100, u._id.toString(), { channel: 'card', ip: 'x' }).catch((e) => ({ credited: false, err: e.message }))));
  eq(par.filter((x) => x.credited).length, 1, '5 parallel credits of one reference: exactly one lands'); eq(await wallet(u._id), 1350, 'wallet +100 once');
  const drv = await User.create({ name: 'Drv', phone: `+234811${String(Date.now()).slice(-6)}`, role: 'driver' });
  await creditWalletFromPaystack('REF-D', 100, drv._id.toString(), { channel: 'card', ip: 'x' });
  eq(await UserWallet.countDocuments({ userId: drv._id, userType: 'rider' }), 0, 'a driver top-up does not create a rider wallet');
}

console.log('\nI2. card verify and webhook on the same reference');
{
  const u = await makeRider();
  const verifyBody = (ref, amountNaira) => ({ data: { status: true, data: { status: 'success', amount: amountNaira * 100, reference: ref, metadata: { type: 'wallet_topup', userId: u._id.toString() } } } });
  const realGet = axios.get;
  axios.get = async (url) => (String(url).includes('/transaction/verify/') ? verifyBody(decodeURIComponent(String(url).split('/verify/')[1]), 1000) : realGet(url));
  // webhook first, then the app's verify
  await creditWalletFromPaystack('CARD-1', 1000, u._id.toString(), { channel: 'card', ip: 'hook' });
  const v1 = await call(payments.verifyWalletTopup, { user: { _id: u._id }, body: { reference: 'CARD-1' } });
  check(!v1.error && v1.body?.data?.already_credited === true, `verify after webhook: already credited${errMsg(v1)}`); eq(await wallet(u._id), 1000, 'credited once');
  // verify first, then the webhook
  const v2 = await call(payments.verifyWalletTopup, { user: { _id: u._id }, body: { reference: 'CARD-2' } });
  check(!v2.error && v2.body?.data?.already_credited === false, `verify credits${errMsg(v2)}`); eq(await wallet(u._id), 2000, 'wallet +1000');
  const hook = await creditWalletFromPaystack('CARD-2', 1000, u._id.toString(), { channel: 'card', ip: 'hook' });
  eq(hook.credited, false, 'webhook after verify: not credited'); eq(await wallet(u._id), 2000, 'still credited once');
  eq(await WalletFundingTransaction.countDocuments({ reference: 'CARD-2' }), 1, 'one ledger row shared by both');
  // both at the same instant
  const [x, y] = await Promise.all([
    call(payments.verifyWalletTopup, { user: { _id: u._id }, body: { reference: 'CARD-3' } }),
    creditWalletFromPaystack('CARD-3', 1000, u._id.toString(), { channel: 'card', ip: 'hook' }).catch((e) => ({ err: e })),
  ]);
  void x; void y; eq(await wallet(u._id), 3000, 'verify and webhook racing: credited once (+1000)');
  // a top-up the OLD verify credited (completed Payment row, no ledger row) must not be credited again
  await Payment.create({ user: u._id, amount: 1000, method: 'card', status: 'completed', transactionId: 'CARD-OLD', paidAt: new Date(), metadata: new Map([['paystackReference', 'CARD-OLD']]) });
  const old = await call(payments.verifyWalletTopup, { user: { _id: u._id }, body: { reference: 'CARD-OLD' } });
  check(!old.error && old.body?.data?.already_credited === true, `legacy-credited reference is not credited again${errMsg(old)}`); eq(await wallet(u._id), 3000, 'balance unchanged');
  axios.get = realGet;
}

console.log('\nJ. admin balance edit and audit log');
{
  const u = await makeRider(); await creditRiderBalance(u._id, 700, { type: 'topup' });
  const a = adminUser();
  const r0 = await call(admin.updateUser, { user: a, params: { id: u._id.toString() }, body: { balance: 900 } });
  check(!!r0.error, 'balance change without a reason is refused'); eq(await wallet(u._id), 700, 'wallet unchanged');
  eq(await AuditLog.countDocuments({ action: 'wallet_adjust' }), 0, 'no audit entry for a refused change');
  const r1 = await call(admin.updateUser, { user: a, params: { id: u._id.toString() }, body: { balance: 900, balanceReason: 'goodwill credit' } });
  check(!r1.error, `edit ok${errMsg(r1)}`); eq(await wallet(u._id), 900, 'wallet moved by the delta (+200)'); eq(await mirror(u._id), 900, 'mirror matches');
  eq((await rows(u._id, 'admin_adjustment')).length, 1, 'ledger row written');
  const audit = await AuditLog.findOne({ action: 'wallet_adjust' }).lean();
  check(audit && audit.details?.delta === 200 && audit.details?.before === 700 && audit.details?.after === 900 && audit.details?.reason === 'goodwill credit', 'audit log entry carries before/after/delta/reason');
  const same = await call(admin.updateUser, { user: a, params: { id: u._id.toString() }, body: { name: 'New Name', balance: 900 } });
  check(!same.error, 'saving other fields with the same balance needs no reason'); eq((await User.findById(u._id).lean()).name, 'New Name', 'other field saved');
  const down = await call(admin.updateUser, { user: a, params: { id: u._id.toString() }, body: { balance: 100, balanceReason: 'fraud clawback' } });
  check(!down.error, `a decrease works${errMsg(down)}`); eq(await wallet(u._id), 100, 'wallet -800');
  const tooMuch = await call(admin.updateUser, { user: a, params: { id: u._id.toString() }, body: { balance: -5, balanceReason: 'nonsense' } });
  eq(await wallet(u._id), 100, 'wallet never goes negative' + (tooMuch.error ? '' : ' (no error raised)'));

  // listing / details show the wallet, not the mirror
  await User.updateOne({ _id: u._id }, { $set: { balance: 4242 } });
  const det = await call(admin.getUserDetails, { user: a, params: { id: u._id.toString() } });
  eq(det.body?.data?.user?.balance, 100, 'user details show the wallet balance'); eq(det.body?.data?.user?.balance_mirror, 4242, 'and expose the drifted mirror separately');
  const list = await call(admin.listUsers, { user: a, query: { limit: '100' } });
  const mine = (list.body?.data?.users || []).find((x) => String(x.user_id || x.id || x._id) === String(u._id));
  eq(mine?.balance, 100, 'user list shows the wallet balance' + errMsg(list));

  // audit filter by the new action: controller AND the validation whitelist
  const logs = await call(admin.getAuditLogs, { user: a, query: { action: 'wallet_adjust' } });
  check((logs.body?.data?.audit_logs || []).length >= 2 && logs.body.data.audit_logs.every((l) => l.action === 'wallet_adjust'), 'audit log filtered by wallet_adjust returns only those entries' + errMsg(logs));
  const runChain = async (action) => { const req = { query: { action }, body: {}, params: {}, headers: {} }; for (const c of validationRules.auditLogsQuery) { if (c?.run) await c.run(req); } return validationResult(req); };
  check((await runChain('wallet_adjust')).isEmpty(), 'validation accepts ?action=wallet_adjust');
  check((await runChain('wallet_reconcile')).isEmpty(), 'validation accepts ?action=wallet_reconcile');
  check(!(await runChain('not_a_real_action')).isEmpty(), 'validation still rejects unknown actions');
  // the admin edit rules accept the reason field and bound its length
  const runEdit = async (body) => { const req = { query: {}, body, params: { id: u._id.toString() }, headers: {} }; for (const c of validationRules.updateUser || []) { if (c?.run) await c.run(req); } return validationResult(req); };
  check((await runEdit({ balance: 10, balanceReason: 'ok reason' })).isEmpty(), 'updateUser rules accept balanceReason');
  check(!(await runEdit({ balance: 10, balanceReason: 'x' })).isEmpty(), 'updateUser rules reject a 1-character reason');
}

console.log('\nK. Paystack reconciliation job');
{
  const a = await makeRider({ paystackCustomerCode: 'CUS_a' });
  const b = await makeRider({ paystackCustomerCode: 'CUS_dup' }); const c = await makeRider({ paystackCustomerCode: 'CUS_dup' });
  const gone = await makeRider({ paystackCustomerCode: 'CUS_gone' }); await gone.softDelete();
  const late = await makeRider();
  const old = (m) => new Date(Date.now() - m * 60000).toISOString();
  const tx = (ref, code, amountNaira, paidMinsAgo, channel = 'dedicated_nuban', extra = {}) => ({ reference: ref, amount: amountNaira * 100, channel, paid_at: old(paidMinsAgo), customer: { customer_code: code, first_name: 'T', last_name: 'U' }, authorization: {}, metadata: {}, ...extra });
  const realGet = axios.get;
  axios.get = async () => ({ data: { data: [
    tx('R-OK', 'CUS_a', 300, 30),
    tx('R-ALREADY', 'CUS_a', 50, 30),
    tx('R-NOBODY', 'CUS_none', 70, 30),
    tx('R-DUP', 'CUS_dup', 90, 30),
    tx('R-GONE', 'CUS_gone', 60, 30),
    tx('R-NEW', 'CUS_a', 20, 1),
    tx('R-RIDE', 'CUS_a', 40, 30, 'card'),
    tx('R-CARD', 'CUS_x', 80, 30, 'card', { metadata: { type: 'wallet_topup', userId: late._id.toString() } }),
  ] } });
  await WalletFundingTransaction.create({ reference: 'R-ALREADY', user: a._id, amount: 50, balanceBefore: 0, balanceAfter: 50 });

  const ledgerBefore = await WalletFundingTransaction.countDocuments({});
  const dry = await reconcilePaystackFunding({ days: 2, apply: false, graceMinutes: 3 });
  eq(dry.wouldCredit.length, 2, 'dry run: would credit exactly the two missing, matchable payments (DVA + card top-up)');
  eq(await wallet(a._id), 0, 'dry run moved no money'); eq(await PaystackUnmatchedPayment.countDocuments({}), 0, 'dry run wrote no exception rows');
  eq(await WalletFundingTransaction.countDocuments({}), ledgerBefore, 'dry run wrote no ledger rows');

  const real = await reconcilePaystackFunding({ days: 2, apply: true, graceMinutes: 3 });
  eq(real.credited, 2, 'credited the two missing payments'); eq(await wallet(a._id), 300, 'wallet +300'); eq(await wallet(late._id), 80, 'card top-up credited by metadata.userId');
  eq(real.alreadyCredited, 1, 'skipped the already-ledgered one'); eq(real.tooRecent, 1, 'left the 1-minute-old payment to the webhook');
  eq(real.unmatched, 3, 'three payments need a human (unknown customer, shared customer, deleted rider)');
  eq(await PaystackUnmatchedPayment.countDocuments({ status: 'open' }), 3, 'all three recorded for admin review');
  const reasons = Object.fromEntries((await PaystackUnmatchedPayment.find({}).lean()).map((x) => [x.reference, x.reason]));
  check(reasons['R-NOBODY'] === 'no_user' && reasons['R-GONE'] === 'no_user' && reasons['R-DUP'] === 'ambiguous_user', `reasons recorded (${JSON.stringify(reasons)})`);
  const again = await reconcilePaystackFunding({ days: 2, apply: true, graceMinutes: 3 });
  eq(again.credited, 0, 'second run credits nothing'); eq(await wallet(a._id), 300, 'no double credit');
  eq((await PaystackUnmatchedPayment.findOne({ reference: 'R-NOBODY' }).lean()).attempts, 2, 'unmatched row counts attempts instead of duplicating');

  // admin read-only list of the open ones
  const listed = await call(admin.listPaystackUnmatchedPayments, { user: adminUser(), query: {} });
  const refs = (listed.body?.data?.payments || []).map((x) => x.reference).sort().join(',');
  eq(refs, 'R-DUP,R-GONE,R-NOBODY', 'admin list shows exactly the open unmatched payments' + errMsg(listed));

  // a later run that CAN match credits it and closes the exception row
  await User.updateOne({ _id: b._id }, { $set: { paystackCustomerCode: 'CUS_none' } });
  const fixed = await reconcilePaystackFunding({ days: 2, apply: true, graceMinutes: 3 });
  // b gave up the shared code, so R-DUP now has exactly one live owner (c) and is credited too.
  eq(fixed.credited, 2, 'once a customer code matches exactly one rider, the payment is credited (R-NOBODY and R-DUP)');
  eq(await wallet(b._id), 70, 'wallet +70 (R-NOBODY)'); eq(await wallet(c._id), 90, 'wallet +90 (R-DUP, now unambiguous)');
  eq((await PaystackUnmatchedPayment.findOne({ reference: 'R-NOBODY' }).lean()).status, 'resolved', 'exception row marked resolved');
  const listed2 = await call(admin.listPaystackUnmatchedPayments, { user: adminUser(), query: {} });
  eq((listed2.body?.data?.payments || []).map((x) => x.reference).join(','), 'R-GONE', 'resolved rows leave the admin list');
  axios.get = realGet;
}

console.log('\nL. balance screen with RIDER_BALANCE_WALLET_ONLY');
{
  const u = await makeRider(); await creditRiderBalance(u._id, 120, { type: 'topup' });
  await User.updateOne({ _id: u._id }, { $set: { balance: 999 } });
  const w = await UserWallet.findOne({ userId: u._id }).lean();
  delete process.env.RIDER_BALANCE_WALLET_ONLY;
  eq(computeRiderWalletApiTotals(999, w).availableBalance, 999, 'flag off: unchanged max() behaviour');
  process.env.RIDER_BALANCE_WALLET_ONLY = 'true';
  const t = computeRiderWalletApiTotals(999, w);
  eq(t.availableBalance, 120, 'flag on: screen equals the wallet'); eq(t.balance, 120, 'total equals wallet + held');
  eq((await getRiderBalance(u._id)).available, 120, 'booking check equals the wallet');
  delete process.env.RIDER_BALANCE_WALLET_ONLY;
}

} catch (e) { failed++; console.log('  FAIL script error:', e.stack || e); }

console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
