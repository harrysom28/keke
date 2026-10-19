/**
 * Checks for the restricted `drivers_manager` admin login (approve / suspend drivers only), against a REAL MongoDB.
 * Calls the actual middleware and controllers with fake req/res objects.
 *
 *   TEST_MONGODB_URI='mongodb://127.0.0.1:27017/keke_flows_test?replicaSet=rs0' node scripts/verifyDriversManager.js
 *
 * Safety: refuses to run unless the connected database name contains "test" (it empties every collection), and
 * refuses FerretDB and other servers that are not real MongoDB.
 */
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
process.env.JWT_SECRET ||= 'test-secret';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret';
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
const DriverKyc = await M('../src/models/DriverKyc.js');
const DriverVehicle = await M('../src/models/DriverVehicle.js');
const AuditLog = await M('../src/models/AuditLog.js');
const admin = await import('../src/controllers/adminController.js');
const { requireAdminAccess, restrictStaffRoles } = await import('../src/middleware/auth.js');

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
console.log(`MongoDB ${bi.version} on database ${dbName}`);

for (const m of Object.values(mongoose.models)) await m.deleteMany({});
for (const m of [User, Driver, DriverKyc, DriverVehicle, AuditLog]) await m.createCollection().catch(() => {});

try {
// ── helpers ──────────────────────────────────────────────────────────────────
let seq = 0;
const phone = (p) => `+234${p}${String(Date.now()).slice(-6)}${++seq}`;
const PASSWORD = 'Sup3r-secret-pw';
const makeStaff = (role, email) => User.create({ name: role, email, phone: phone('801'), password: PASSWORD, role, isActive: true, isVerified: true });
const makeDriver = async (extra = {}) => {
  const u = await User.create({ name: `Driver ${++seq}`, phone: phone('700'), role: 'driver', ...extra });
  const d = await Driver.create({
    user: u._id,
    licenseNumber: `LIC${Date.now()}${seq}`,
    licenseExpiry: new Date(Date.now() + 1e10),
    vehicleDetails: { make: 'Bajaj', model: 'RE', year: 2020, plateNumber: `KEKE${Date.now()}${seq}`, color: 'yellow', vehicleType: new mongoose.Types.ObjectId() },
  });
  return { u, d };
};
const call = (handler, req) => new Promise((resolve) => {
  // asyncHandler() does not return its promise, so wait for the response or next(err) instead.
  const out = { status: 200, body: null, error: null };
  const done = () => setTimeout(() => resolve(out), 0);
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; done(); return this; }, set() { return this; }, send(b) { out.body = b; done(); return this; } };
  setTimeout(() => { out.error = new Error('handler timed out'); resolve(out); }, 20000).unref();
  handler({ ip: '127.0.0.1', headers: {}, params: {}, body: {}, query: {}, ...req }, res, (e) => { out.error = e || null; done(); });
});
// Middleware are plain sync functions that throw (or call next).
const runMw = (mw, req) => { let nexted = false; try { mw(req, {}, () => { nexted = true; }); } catch (e) { return { nexted: false, error: e }; } return { nexted, error: null }; };
const reqFor = (user, method, path) => ({ user, method, path });
const fresh = (id) => User.findById(id).lean();
const auditCount = (q = {}) => AuditLog.countDocuments(q);
const id24 = () => new mongoose.Types.ObjectId().toString();

const dm = await makeStaff('drivers_manager', 'approver@keke.test');
const am = await makeStaff('agents_manager', 'agents@keke.test');
const fullAdmin = await makeStaff('admin', 'root@keke.test');
const rider = await User.create({ name: 'Rider', phone: phone('802'), role: 'passenger' });

// ── 1. the role exists and survives a save ───────────────────────────────────
console.log('\n[role]');
eq((await fresh(dm._id)).role, 'drivers_manager', 'drivers_manager is stored as-is (not coerced to passenger)');
const dmDoc = await User.findById(dm._id); dmDoc.name = 'Approver'; await dmDoc.save();
eq((await fresh(dm._id)).role, 'drivers_manager', 'still drivers_manager after a re-save');

// ── 2. login ──────────────────────────────────────────────────────────────────
console.log('\n[login]');
const login = (email, password) => call(admin.adminLogin, { body: { email, password } });
const lg = await login('approver@keke.test', PASSWORD);
check(!lg.error && lg.body?.status === 'success', `drivers_manager can log in${lg.error ? ` [${lg.error.message}]` : ''}`);
eq(lg.body?.data?.admin?.role, 'drivers_manager', 'login response reports the drivers_manager role');
check(!!lg.body?.authorisation?.token, 'login returns a token');
const bad = await login('approver@keke.test', 'wrong-password');
eq(bad.error?.statusCode, 401, 'wrong password is refused');
check(!(await login('rider@keke.test', PASSWORD)).body, 'unknown email is refused');
await User.updateOne({ _id: dm._id }, { $set: { isActive: false } });
check(!!(await login('approver@keke.test', PASSWORD)).error, 'a deactivated drivers_manager cannot log in');
await User.updateOne({ _id: dm._id }, { $set: { isActive: true } });
const me = await call(admin.getAdminProfile, { user: await fresh(dm._id) });
check(!me.error && me.body?.data?.admin?.role === 'drivers_manager', `GET /me works for drivers_manager${me.error ? ` [${me.error.message}]` : ''}`);

// ── 3. admin-panel gate ───────────────────────────────────────────────────────
console.log('\n[requireAdminAccess]');
check(runMw(requireAdminAccess, { user: dm }).nexted, 'drivers_manager is let into the admin panel');
check(runMw(requireAdminAccess, { user: fullAdmin }).nexted, 'admin still is');
eq(runMw(requireAdminAccess, { user: rider }).error?.statusCode, 403, 'a passenger is not');
const plainDriver = (await makeDriver()).u;
eq(runMw(requireAdminAccess, { user: plainDriver }).error?.statusCode, 403, 'a driver is not');

// ── 4. allowlist ──────────────────────────────────────────────────────────────
console.log('\n[allowlist]');
const X = id24();
const allowed = [
  ['GET', '/me'], ['POST', '/logout'],
  ['GET', '/drivers'], ['GET', `/drivers/${X}`],
  ['PATCH', `/drivers/${X}/verify`],
  ['PATCH', `/drivers/kyc/${X}/approve`], ['PATCH', `/drivers/vehicle/${X}/approve`],
  ['PATCH', `/drivers/${X}/suspend`],
  ['GET', '/drivers/'], ['PATCH', `/drivers/${X}/suspend/`],
];
for (const [method, path] of allowed) {
  const r = runMw(restrictStaffRoles, reqFor(dm, method, path));
  check(r.nexted && !r.error, `drivers_manager allowed: ${method} ${path.replace(X, ':id')}`);
}
const denied = [
  // reject / restore are not part of "approve or suspend"
  ['PATCH', `/drivers/${X}/reject`], ['PATCH', `/drivers/kyc/${X}/reject`], ['PATCH', `/drivers/vehicle/${X}/reject`],
  ['PATCH', `/users/${X}/activate`],
  // the generic user switch works on ANY user (admins included)
  ['PATCH', `/users/${X}/deactivate`], ['DELETE', `/users/${X}`], ['GET', '/users'], ['GET', `/users/${X}`], ['PATCH', `/users/${X}`],
  // money and ride data
  ['GET', `/drivers/${X}/earnings`], ['GET', `/drivers/${X}/rides`], ['GET', `/driver/${X}/wallet`], ['GET', '/transactions'],
  ['GET', '/rides'], ['POST', `/rides/${X}/complete`], ['PATCH', `/rides/${X}`], ['GET', '/dashboard/stats'],
  ['GET', '/settings'], ['PUT', '/settings'], ['GET', '/audit-logs'], ['GET', '/void-requests'], ['POST', `/void-requests/${X}/resolve`],
  // agents area belongs to agents_manager
  ['GET', '/agents'], ['PATCH', `/agents/${X}`],
  // wrong method on an allowed path, malformed ids, tricks
  ['DELETE', `/drivers/${X}`], ['PATCH', `/drivers/${X}`], ['POST', `/drivers/${X}/verify`], ['GET', `/drivers/${X}/verify`], ['POST', '/drivers'],
  ['PATCH', '/drivers/not-an-id/verify'], ['PATCH', `/drivers/${X}/verify/../reject`], ['PATCH', `/drivers/${X}/suspend/extra`],
  ['PATCH', `/drivers/kyc/${X}/approve/x`], ['GET', '/me/extra'], ['GET', ''],
];
for (const [method, path] of denied) {
  const r = runMw(restrictStaffRoles, reqFor(dm, method, path));
  check(!r.nexted && r.error?.statusCode === 403, `drivers_manager denied: ${method} ${path.replace(new RegExp(X, 'g'), ':id') || '(empty)'}`);
}
// other roles are unaffected by the new rule
check(runMw(restrictStaffRoles, reqFor(fullAdmin, 'PATCH', `/drivers/${X}/reject`)).nexted, 'full admin is not restricted (reject)');
check(runMw(restrictStaffRoles, reqFor(fullAdmin, 'DELETE', `/users/${X}`)).nexted, 'full admin is not restricted (delete user)');
check(runMw(restrictStaffRoles, reqFor(am, 'GET', '/agents')).nexted, 'agents_manager can still reach /agents');
eq(runMw(restrictStaffRoles, reqFor(am, 'PATCH', `/drivers/${X}/verify`)).error?.statusCode, 403, 'agents_manager still cannot approve drivers');
eq(runMw(restrictStaffRoles, reqFor(am, 'PATCH', `/drivers/${X}/suspend`)).error?.statusCode, 403, 'agents_manager cannot suspend drivers');

// the allowlist is only useful if these routes really exist
const routes = readFileSync(new URL('../src/routes/adminRoutes.js', import.meta.url), 'utf8');
for (const needle of [
  "router.get('/drivers',", "router.get('/drivers/:id',", "router.patch('/drivers/:id/verify',",
  "router.patch('/drivers/kyc/:userId/approve',", "router.patch('/drivers/vehicle/:userId/approve',", "router.patch('/drivers/:id/suspend',",
  'router.use(restrictStaffRoles)',
]) check(routes.includes(needle), `adminRoutes.js registers ${needle}`);
check(routes.indexOf('router.use(restrictStaffRoles)') > routes.indexOf('router.use(requireAdminAccess)')
  && routes.indexOf('router.use(restrictStaffRoles)') < routes.indexOf("router.get('/drivers',"), 'restriction is applied before every driver route');

// ── 5. suspend: drivers only ─────────────────────────────────────────────────
console.log('\n[suspend]');
const suspend = (user, id) => call(admin.suspendDriver, { user, params: { id: String(id) } });
{
  const { u, d } = await makeDriver();
  const before = await auditCount({ action: 'user_deactivate' });
  const r = await suspend(dm, u._id);
  check(!r.error && r.status === 200, `suspend by User id works${r.error ? ` [${r.error.message}]` : ''}`);
  eq((await fresh(u._id)).isActive, false, 'driver is now inactive');
  eq(await auditCount({ action: 'user_deactivate' }), before + 1, 'one audit row written');
  const log = await AuditLog.findOne({ action: 'user_deactivate', resourceId: u._id.toString() }).lean();
  eq(log?.adminEmail, 'approver@keke.test', 'audit row names the drivers_manager');
  const again = await suspend(dm, u._id);
  check(!again.error, 'suspending again is a harmless no-op');
  eq(await auditCount({ action: 'user_deactivate' }), before + 1, 'no second audit row');
  const d2 = await makeDriver();
  const r2 = await suspend(dm, d2.d._id);
  check(!r2.error, `suspend by Driver id works${r2.error ? ` [${r2.error.message}]` : ''}`);
  eq((await fresh(d2.u._id)).isActive, false, 'driver (by Driver id) is inactive');
}
for (const [label, target] of [['a passenger', rider], ['a full admin', fullAdmin], ['an agents_manager', am], ['another drivers_manager', dm]]) {
  const before = await auditCount();
  const r = await suspend(dm, target._id);
  eq(r.error?.statusCode, 404, `cannot suspend ${label} (404)`);
  eq((await fresh(target._id)).isActive, true, `${label} is still active`);
  eq(await auditCount(), before, `no audit row for ${label}`);
}
eq((await suspend(dm, id24())).error?.statusCode, 404, 'unknown id is a 404');

// ── 6. approve ────────────────────────────────────────────────────────────────
console.log('\n[approve]');
{
  const { u, d } = await makeDriver();
  await Driver.updateOne({ _id: d._id }, { $set: { verificationStatus: 'pending', documentsVerified: false } });
  const r = await call(admin.verifyDriver, { user: dm, params: { id: d._id.toString() } });
  check(!r.error && r.status === 200, `approve driver works${r.error ? ` [${r.error.message}]` : ''}`);
  const after = await Driver.findById(d._id).lean();
  eq(after.verificationStatus, 'approved', 'driver is approved');
  eq(after.documentsVerified, true, 'documents flagged verified');
  eq(await auditCount({ action: 'driver_approve', adminEmail: 'approver@keke.test' }), 1, 'approve is audited under the drivers_manager');
  await sleep(150);

  const kyc = await DriverKyc.create({ userId: u._id, idType: 'national_id', idNumber: '123', idImageUrl: 'https://x/y.png', selfieUrl: 'https://x/s.png', verificationStatus: 'pending' });
  const rk = await call(admin.approveDriverKyc, { user: dm, params: { userId: u._id.toString() } });
  check(!rk.error, `approve identity works${rk.error ? ` [${rk.error.message}]` : ''}`);
  eq((await DriverKyc.findById(kyc._id).lean()).verificationStatus, 'verified', 'identity is verified');

  const vt = new mongoose.Types.ObjectId();
  const veh = await DriverVehicle.create({ userId: u._id, vehicleType: vt, plateNumber: `PL${Date.now()}`, make: 'Bajaj', model: 'RE', year: 2020, color: 'yellow', verificationStatus: 'pending' })
    .catch((e) => ({ err: e }));
  if (veh.err) {
    console.log(`  skip  vehicle approve (could not build a DriverVehicle fixture: ${veh.err.message})`);
  } else {
    const rv = await call(admin.approveDriverVehicle, { user: dm, params: { userId: u._id.toString() } });
    check(!rv.error, `approve vehicle works${rv.error ? ` [${rv.error.message}]` : ''}`);
    eq((await DriverVehicle.findById(veh._id).lean()).verificationStatus, 'verified', 'vehicle is verified');
  }
}

// ── 7. read: list and details work, and are drivers only ─────────────────────
console.log('\n[read]');
{
  const lst = await call(admin.listDrivers, { user: dm, query: {} });
  check(!lst.error && Array.isArray(lst.body?.data?.drivers), 'driver list works');
  const ids = (lst.body?.data?.drivers || []).map((x) => x.user?.user_id || x.user?._id || x.user?.id);
  check(!ids.map(String).includes(String(rider._id)) && !ids.map(String).includes(String(fullAdmin._id)), 'list never includes passengers or staff');
  const { u } = await makeDriver();
  const det = await call(admin.getDriverDetails, { user: dm, params: { id: u._id.toString() } });
  check(!det.error && det.body?.data, `driver details work${det.error ? ` [${det.error.message}]` : ''}`);
  eq((await call(admin.getDriverDetails, { user: dm, params: { id: fullAdmin._id.toString() } })).error?.statusCode, 404, 'details for an admin id is a 404');
}

} catch (e) { failed++; console.log('  FAIL script error:', e.stack || e); }

console.log(`\n${failed ? 'FAILED' : 'ALL PASSED'}: ${passed} passed, ${failed} failed`);
await mongoose.disconnect();
process.exit(failed ? 1 : 0);
