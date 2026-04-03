# KEKE PRODUCTION READINESS REPORT

**Audit type:** Read-only production readiness  
**Scope:** Backend (`/backend`) and Mobile (`/mobile`)  
**Date:** 2025-03-16  

---

## CRITICAL — Must fix before launch

*(Any YES here = do not launch)*

| ID | File | Line | Description | Risk |
|----|------|------|-------------|------|
| C1 | backend/src/config/env.js | 19–22 | Missing env vars only trigger **console.warn**, not process exit. If MONGODB_URI or JWT_SECRET is missing in production, app starts and fails at runtime. | App runs with broken DB/auth; money and auth at risk. |
| C2 | backend/src/services/walletService.js | 39–42, 98–104, 161–165 | Driver wallet updates use **read-modify-write** (e.g. `wallet.pendingBalance += …` then `wallet.save()`) without atomic `$inc` when called without a session. Race conditions can double-credit or double-debit. | Double-spend or incorrect driver balances. |
| C3 | backend/src/services/walletService.js | 164–182 | **debitForPayout**: balance is updated with `walletRefreshed.save(opts)` then `Transaction.create(…)`. If `Transaction.create` fails after save, balance is debited with no audit record. | Lost audit trail; reconciliation failures. |
| C4 | backend/src/services/paymentService.js | 104–118 | Non-escrow wallet path: `rider.balance -= amount` then `rider.save()` then `Payment.create()`. Not atomic; if create fails, rider balance is already debited. No transaction wrapper. | Rider charged without payment record. |
| C5 | backend/src/controllers/adminController.js | 695–700, 921–926, 1423–1430 | **search** query param is used directly in `$regex: search` with no escaping. Malicious input (e.g. `.*`, `(a+)+`) can cause ReDoS or alter query semantics. | DoS or data exposure via regex injection. |
| C6 | mobile/utils/secureTokenStorage.ts | 22–28, 42–48 | **JWT access and refresh tokens stored in AsyncStorage.** AsyncStorage is not encrypted on Android; tokens can be extracted by malware or backup. | Token theft and account takeover. |
| C7 | mobile/utils/apiUrlOverride.ts | 42–44 | Production fallback when `extra.apiUrl` is unset: **`http://10.0.2.2:8000`** (Android emulator). On real device in production this is wrong; app would fail to reach API. | Production app unusable if EAS env not set. |

---

## HIGH — Fix before launch

| ID | File | Line | Description | Risk |
|----|------|------|-------------|------|
| H1 | backend/src/controllers/adminController.js | 1510–1516 | **updateRide** allows admin to set **any** status (e.g. `completed` → `requested`) with no state-machine check. Can create inconsistent ride/payment state. | Invalid ride state; escrow/settlement mismatch. |
| H2 | backend/src/controllers/rideController.js | 171–173 | **scheduledAt** is accepted and stored with **no server-side check** that it is in the future. Past timestamps create confusing or invalid scheduled rides. | Scheduled rides in the past; poor UX and logic errors. |
| H3 | backend/src/server.js | 384–398 | **Graceful shutdown** (SIGTERM/SIGINT) calls `server.close()` but **does not close MongoDB**. In-flight DB writes can be aborted; no explicit drain. | Data loss or inconsistency on deploy/restart. |
| H4 | backend/src/routes/index.js | 28–34 | **GET /api/health** returns 200 with only `status`, `message`, `timestamp`. **Does not check MongoDB or Redis.** Load balancer can mark instance healthy while DB is down. | Unhealthy instance receives traffic; failed requests. |
| H5 | backend/src/services/paystackService.js | 203–211, 241–248 | Paystack **axios** calls (initialize, verify) have **no timeout**. Slow or hanging Paystack can block request threads. | Request starvation; timeouts needed (e.g. 15–30s). |
| H6 | backend/src/controllers/paystackWebhookController.js | 13 | **PAYSTACK_SECRET** falls back to `''` if both PAYSTACK_SECRET_KEY and PAYSTACK_WEBHOOK_SECRET are missing. Signature verification then fails (safe) but webhook is unuseable; no fail-fast at startup. | Webhooks fail in production if env misconfigured. |
| H7 | backend/src/utils/errors.js | 91–97 | In **development**, **sendErrorDev** sends `error` and **err.stack** in JSON response. If NODE_ENV is ever set wrong in production, stack traces leak to client. | Information disclosure (verify NODE_ENV in prod). |
| H8 | mobile/app.config.js | 42–44 | Production **apiUrl** default is **`http://10.0.2.2:8000`**. Must be overridden by EXPO_PUBLIC_API_URL in EAS for production; otherwise app points to wrong host. | Same as C7; ensure EAS env is always set for prod builds. |

---

## MEDIUM — Fix within first week post-launch

| ID | File | Line | Description |
|----|------|------|-------------|
| M1 | backend/src/config/feeConfig.js, backend/src/services/settingsService.js | feeConfig.js 12–34, settingsService.js 12–32 | Financial constants (e.g. 100, 0.08, 200, 150) duplicated: **feeConfig.js** (FEE_CONFIG) and **settingsService.js** (DEFAULTS). rideController uses feeConfig.calculateFareBreakdown; escrow uses settingsService. Risk of divergence. |
| M2 | backend/src/middleware/rateLimiter.js | 48 | **console.log** used when rate limit exceeded: `console.log(\`⚠️  Rate limit exceeded for IP: ${req.ip}\`)`. Should use logger for production. |
| M3 | backend/src/cron/learningJobs.js, backend/src/services/placeIntelligence.js, backend/src/controllers/osrmMapsController.js | learningJobs.js 18,26,39,46,60,64,72; placeIntelligence.js 155,197,215,233,243; osrmMapsController.js 181,196 | **console.log** / **console.warn** in production code paths (cron, place intelligence, maps). Pollutes logs; use structured logger. |
| M4 | backend/src/config/env.js | 16 | Required env list does **not** include PAYSTACK_SECRET_KEY, CORS_ORIGIN, or other payment/security vars. Only MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET are checked (and only warned). |
| M5 | backend/src/server.js | 84–85 | **express.json({ limit: '10mb' })** — 10MB is high; consider lower for API (e.g. 1MB) to reduce DoS surface. |
| M6 | backend/src/controllers/driverController.js | 1049–1051 | **rejectRide** sets `ride.status = 'requested'` when driver rejects after accept. No central state machine; ensure this is intended (e.g. ride goes back to pool). |
| M7 | mobile/app/(app)/(tabs)/(home)/_modals/bookRide.tsx | 60–75, 77–86 | Client-side **calculateFare** and **getFareBreakdown** with hardcoded base (200) and perKm rates. Used for preview only; server calculates actual fare. Inconsistent preview vs server possible. |
| M8 | mobile/src/engines/driverEngine.ts | 44–45 | **EXPO_PUBLIC_SUPABASE_URL** and **EXPO_PUBLIC_SUPABASE_ANON_KEY** in JS. If these are secrets, they are bundled; anon key is often public but should be restricted by RLS. |

---

## LOW — Fix within first month

| ID | Description |
|----|-------------|
| L1 | Mobile **.gitignore** lists `.env` but not `.env.local` or `.env.production`. Add them so local overrides are never committed. |
| L2 | Backend **graceful shutdown**: register single handler that closes MongoDB then server (or use a small shutdown module) to avoid duplicate SIGINT in database.js and server.js. |
| L3 | **Health check**: extend GET /api/health to optionally ping MongoDB (e.g. mongoose.connection.readyState === 1) and return 503 if DB down. |
| L4 | **Paystack live vs test**: No code check for sk_test_ vs sk_live_. Rely on env in production; add startup warning if PAYSTACK_SECRET_KEY starts with sk_test_ in production. |
| L5 | **Google Maps key**: Backend uses server-side key (env); mobile uses display-only key (EXPO_PUBLIC_MAPS_DISPLAY_KEY). Keys are separate; document in runbook. |
| L6 | **Currency (Naira)**: Mobile shows ₦ and amounts; ensure all fare/balance displays use consistent formatting (integers, no decimals for Naira) across app. |
| L7 | **Timezone**: Timestamps stored as UTC; ensure mobile displays in WAT (UTC+1) for Nigerian users where appropriate. |
| L8 | **Phone format**: Auth and validation accept various formats; ensure 080/070/090 and +234 are all accepted and normalized. |

---

## PASSED — No issue found

| Check | Confirmation |
|-------|--------------|
| 1.2 Paystack webhook verification | **PASSED.** backend/src/controllers/paystackWebhookController.js verifies X-Paystack-Signature with HMAC-SHA512 (lines 14–17, 166–169). Raw body used (server.js 69–81). Flutterwave: no Flutterwave webhook or verif-hash found in codebase (N/A). |
| 1.3 Webhook idempotency | **PASSED.** Paystack handler checks WalletFundingTransaction by reference (paystackWebhookController.js 55–59); walletFundingService checks reference before credit (walletFundingService.js 26–35, 161–164). |
| 1.5 Fare calculation server-side | **PASSED.** Fare is calculated on backend in rideController (geolocation.calculateFare, AdminSettings pricing, surge). Mobile only shows estimate; request-ride uses server fare. |
| 1.6 Balance check before ride | **PASSED.** requestRide calls validateRiderBalance(riderId, totalFare) for wallet payment (rideController.js 145–151) before creating ride and holding funds. |
| 2.1 Unprotected sensitive routes | **PASSED.** All booking, driver, payment, wallet, profile, admin routes use protect and/or restrictTo/requireAdmin. Only health, config/public, forgot-password, and Paystack webhook are public by design. |
| 2.2 Role checks | **PASSED.** Driver routes use restrictTo('driver'); admin routes use protect + requireAdmin; rider onboarding enforced with requireRiderComplete. |
| 2.3 JWT secret strength | **PASSED.** backend/src/utils/jwt.js throws if JWT_SECRET or JWT_REFRESH_SECRET is missing (lines 9–11); no weak default. |
| 2.4 Token expiry | **PASSED.** JWT_EXPIRE default 15m, JWT_REFRESH_EXPIRE default 7d (jwt.js 5–7, 17–18, 26–27). |
| 2.5 Sensitive data in JWT | **PASSED.** Payload is { id, role } only (authController.js 26, sessionService.js 129, adminController.js 58). |
| 2.6 Admin endpoint protection | **PASSED.** adminRoutes use router.use(protect); router.use(requireAdmin); (adminRoutes.js 16–17). |
| 3.1 Hardcoded secrets in source | **PASSED.** No API keys, DB URLs, or JWT secrets hardcoded; Paystack base URL is public. .env.example shows placeholders only. |
| 3.2 .env gitignore (backend) | **PASSED.** backend/.gitignore includes .env, .env.local, .env.production, .env.test. |
| 4.1 Rate limiting | **PASSED.** Global apiLimiter on /api; authLimiter, otpLimiter, refreshTokenLimiter, adminLoginLimiter, rideCreationLimiter, walletOpsLimiter, supportTicketsLimiter in use. |
| 4.2 Input validation | **PASSED.** express-validator used on ride, wallet, auth, admin endpoints (validationRules in validation.js). |
| 4.4 CORS | **PASSED.** Production uses CORS_ORIGIN from env; no wildcard in production. |
| 4.5 Body size limit | **PASSED.** express.json({ limit: '10mb' }) set (server.js 84). |
| 5.1 Unhandled rejections | **PASSED.** asyncHandler wraps route handlers; handleUnhandledRejection and handleUncaughtException in server.js. |
| 5.2 Global error handler | **PASSED.** errorHandler (err, req, res, next) in errors.js 62–85; mounted last in server.js. |
| 5.3 Stack traces to client | **PASSED.** sendErrorProd does not send stack; only sendErrorDev does when NODE_ENV === 'development'. |
| 5.6 DB connection handling | **PASSED.** connectDB throws and process.exit(1) on failure; mongoose connection 'error' and 'disconnected' logged (database.js). |
| 6.2 Double ride creation | **PASSED.** requestRide checks Ride.findActiveRideForRider(riderId) and throws ConflictError if active ride exists (rideController.js 98–101). |
| 6.3 Driver accepting multiple rides | **PASSED.** acceptRide checks Ride.findActiveRideForDriver(driver._id) and throws if active (driverController.js 744–747). |
| 6.5 Negative wallet balance | **PASSED.** holdRideFunds uses findOneAndUpdate with availableBalance: { $gte: fareAmount }; debitForPayout checks availableBalance < amount and throws; validateRiderBalance enforces riderTotal. |
| 6.1 Ride state machine | **PARTIAL.** Driver/rider flows validate status (e.g. cancel only if not completed; complete only if in-progress). Admin updateRide (adminController.js 1510–1516) can set any status with no transition check — see H1. |
| 6.6 Orphaned held funds | **PARTIAL.** holdRideFunds is idempotent by rideId; if ride is created and hold succeeds but ride creation fails later, ride is deleted and hold not released (rideController 206–211 deletes ride on hold failure). No cron to release holds for abandoned rides. |
| 7.2 SSL bypass | **PASSED.** No certificate pinning or SSL bypass found in mobile. |
| 7.4 Deep link security | **PASSED.** App uses expo-router; auth flow and protected stacks guard screens; no unguarded deep link to sensitive screens found. |
| 8.1 Database indexes | **PASSED.** Ride, User, Payment, Transaction, PayoutRequest, Message, etc. have indexes on key query fields (rider, driver, status, createdAt, reference, etc.). |
| 8.2 Unbounded queries | **PASSED.** Admin list endpoints use skip/limit; messageController uses limit; scheduledRideService queries bounded by time window. |
| 8.3 Pagination | **PASSED.** listRides, listUsers, listDrivers, getScheduledBookings, messages, payouts, etc. use page/limit. |
| 8.6 Google Maps caching | **PASSED.** mapsCache.js and placeSearchService use Redis/in-memory caching; googleMapsClient has cost tracking. |
| 9.1 Health endpoint | **PARTIAL.** GET /api/health exists but does not check DB (see H4). |
| 9.2 Logging | **PASSED.** Winston logger with file transports; Sentry init when SENTRY_DSN set (server.js 5–10). |
| 9.3 Process manager | **PASSED.** ecosystem.config.js (PM2) and Dockerfile present. |
| 9.4 Graceful shutdown | **PARTIAL.** SIGTERM/SIGINT close server; MongoDB not explicitly closed (see H3). |
| 10.5 Paystack live vs test | **PARTIAL.** Key comes from env; no automatic check that production uses sk_live_. |
| 10.6 Driver verification | **PASSED.** requireDriverKycVerified ensures kycStatus === 'verified' before accepting rides (onboarding.js 47–49). |

---

## SUMMARY SCORECARD

| Metric | Count |
|--------|--------|
| Total checks performed | 58 |
| Critical issues | 7 |
| High issues | 8 |
| Medium issues | 8 |
| Low issues | 8 |
| **Launch recommendation** | **HOLD** |

**Rationale:** Critical issues include env not failing fast, non-atomic wallet operations, payout/balance update ordering, regex injection on admin search, JWT in AsyncStorage, and production API URL fallback. These must be addressed before launch. After criticals are fixed, re-audit and reassess for CONDITIONAL (highs) or CLEAR.

---

*End of report.*
