# Auth & Wallet Architecture

> Production-grade authentication and wallet system for a Nigerian ride-hailing platform (Uber/Bolt scale).

---

## Scope

| Scope | Applies to |
|-------|------------|
| **OTP-first, no password** | Both riders (passengers) and drivers |
| **Transaction PIN, device trust, withdrawal freeze, risk engine** | Drivers only |

---

## Current vs Target State (Gap Analysis)

| Area | Current | Target |
|------|---------|--------|
| Auth | Password + OTP hybrid, JWT only | OTP-first, no password (both riders and drivers) |
| Access token | 15 min ✓ | 15 min ✓ |
| Refresh token | Stateless JWT, 7d, no rotation | Stored hashed in DB, 7–30d, rotate on use |
| Device binding | device_id in User, not validated | user_sessions + user_devices, required |
| Wallet | In User model, DriverWallet for drivers | Separate Wallet Service, wallets collection |
| Withdrawal | protect only | protect → requireTransactionPin → checkDeviceTrust → riskEngine |
| Transaction PIN | None | driver_security collection, 3 fails = 30 min lock |
| New device | No freeze | 12-hour withdrawal freeze |
| DVA | Sync in signup/me (blocks flow) | Async after driver approval |

---

## 1. Auth Service

### Responsibilities
- Request OTP
- Verify OTP
- Issue access + refresh tokens
- Rotate refresh tokens
- Manage device sessions
- Manage driver transaction PIN setup

### Implementation
- **Access Token**: JWT, 15 min expiry
- **Refresh Token**: 7–30 days, stored **hashed** in DB
- **Refresh token rotation**: Invalidate old on use
- **Device-bound sessions**: device_id required

### Collections

**users**
```
_id, phone (unique, normalized), role (passenger|driver|admin), isActive, createdAt
```

**user_sessions**
```
_id, user_id, device_id, refresh_token_hash, expires_at, created_at, last_used_at, revoked
```

**user_devices**
```
_id, user_id, device_id, is_trusted, first_login_at, last_login_at, ip_address
```

**driver_security** (drivers only)
```
user_id, transaction_pin_hash, failed_attempts, lock_until, last_pin_change_at
```

---

## 2. Wallet Service (Separate Module)

Wallet must **not** trust access token alone. Must validate:
- JWT
- Device trust
- Transaction PIN
- Risk checks
- Withdrawal cooldown rules

### Collections
- **wallets**: _id, user_id, balance, currency, dva_status
- **withdrawals**: _id, user_id, amount, status, risk_score, created_at
- **virtual_accounts**: _id, user_id, account_number, bank_name, provider, provider_reference, status

---

## 3. Withdrawal Security Flow

```
protect → requireTransactionPin → checkDeviceTrust → riskEngine → executeWithdrawal
```

### Rules
- **New device** → 12-hour withdrawal freeze
- **3 failed PIN attempts** → 30 min lock
- **Large withdrawal** → require OTP step-up
- **Recent login (<10 min)** → require OTP step-up

---

## 4. Reduce OTP Frequency

### Token Strategy
- Access token: 15 min
- Refresh token: 30 days (device-bound)

### On App Open
1. Access token valid → continue
2. Access expired → call `POST /auth/refresh` with refresh_token + device_id
3. Backend: validate refresh hash, check device, rotate token, issue new access
4. User sees nothing. **No OTP.**

### When OTP Is Required Again
- Refresh token expired
- User logs out
- Device revoked
- Suspicious activity
- Manual admin revocation

---

## 5. DVA Generation

- After driver approval: emit DriverApprovedEvent
- Queue async job
- Call Paystack DVA API
- Store virtual account
- **Must not block login**

---

## 6. Sequence Diagrams (Text)

### Refresh Token Flow
```
App                    Auth API
  |                        |
  |--POST /auth/refresh--->|
  |   {refresh_token,      |
  |    device_id}          |
  |                        |--validate hash, device
  |                        |--rotate refresh token
  |                        |--invalidate old
  |<--200 {access_token}---|
```

### Withdrawal Flow
```
App                    Wallet API
  |                        |
  |--POST /withdraw------->|
  |   {amount, pin,        |
  |    device_id}          |
  |                        |--protect (JWT)
  |                        |--requireTransactionPin
  |                        |--checkDeviceTrust
  |                        |--riskEngine
  |                        |--executeWithdrawal
  |<--200 {reference}------|
```

---

## Deliverables Checklist

- [ ] Folder structure
- [ ] Middleware: protect, requireTransactionPin, checkDeviceTrust, riskEngine
- [x] Token rotation logic (refresh) — Phase 1 done
- [ ] Withdrawal protection logic
- [ ] Risk engine function
- [ ] Example controllers
- [x] user_sessions, user_devices models — Phase 1 done
- [ ] driver_security model
