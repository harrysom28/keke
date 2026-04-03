# Onboarding & KYC Architecture

> Nigerian ride-hailing + wallet platform – OTP-only auth, progressive onboarding.

---

## Scope

| Flow | Applies to | Blocks |
|------|------------|--------|
| OTP-only auth | Riders + Drivers | Login |
| Rider onboarding (minimal) | Riders | Booking |
| Driver onboarding (4 stages) | Drivers | Ride acceptance only |
| Profile update rules | All | Sensitive field changes |

---

## Rider Onboarding (Low Friction)

After OTP verify:
- **full_name** (required)
- **email** (optional)
- **profile_photo** (optional)

→ `onboarding_stage = 'rider_complete'`  
→ User can book immediately.

---

## Driver Onboarding (4 Stages)

| Stage | Fields | Result |
|-------|--------|--------|
| 1 – Basic | full_name, date_of_birth, state, city | `driver_stage1` |
| 2 – Identity | id_type, id_number, id_image, selfie | `driver_stage2` |
| 3 – Vehicle | vehicle_type, plate_number, docs, insurance | `driver_stage3` |
| 4 – Financial | Wallet, DVA (async), transaction PIN | `driver_complete` |

**Block ride acceptance** until KYC verified. Login never blocked.

---

## Profile Update Rules

| Field | Verification | Freeze |
|-------|--------------|--------|
| Name | Allowed | - |
| Email | OTP to new email | - |
| Phone | OTP old + PIN | 24h withdrawal |
| Bank | PIN + OTP | 12h withdrawal |

---

## State Transitions

```
rider:  null → rider_complete
driver: null → driver_stage1 → driver_stage2 → driver_stage3 → driver_stage4 → driver_complete
kyc_status: pending | verified | rejected
```

---

## Folder Structure

```
backend/src/
├── controllers/
│   ├── authController.js      # OTP verify, loginWithOtp, completeSignup
│   ├── onboardingController.js # rider complete, driver stages 1-4
│   └── adminController.js     # approveDriverKyc, approveDriverVehicle
├── models/
│   ├── User.js                # + onboardingStage, kycStatus, dateOfBirth
│   ├── DriverKyc.js           # id_type, id_number, id_image, selfie
│   ├── DriverVehicle.js       # vehicle_type, plate_number, documents
│   └── Driver.js              # operational record
├── middleware/
│   ├── onboarding.js          # requireRiderComplete, requireDriverKycVerified
│   └── validation.js          # riderOnboardingComplete, driverStage1-3
└── routes/
    ├── onboardingRoutes.js    # /onboarding/*
    └── adminRoutes.js         # /admin/drivers/kyc|vehicle/*
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/user/login-with-otp | OTP-only login (phone, otp) |
| POST | /auth/user/complete-signup | Rider complete (name, optional password) |
| GET | /onboarding/status | Get onboarding status |
| POST | /onboarding/rider/complete | Rider: full_name, email?, profile_photo? |
| POST | /onboarding/driver/stage1 | full_name, date_of_birth, state, city |
| POST | /onboarding/driver/stage2 | id_type, id_number, id_image, selfie_image |
| POST | /onboarding/driver/stage3 | vehicle_type, plate_number, docs, insurance |
| POST | /onboarding/driver/stage4 | Financial activation |
| PATCH | /admin/drivers/kyc/:userId/approve | Admin: approve identity |
| PATCH | /admin/drivers/kyc/:userId/reject | Admin: reject identity |
| PATCH | /admin/drivers/vehicle/:userId/approve | Admin: approve vehicle |
| PATCH | /admin/drivers/vehicle/:userId/reject | Admin: reject vehicle |

---

## Profile Update Rules (Phase 3)

- **Name**: Allowed
- **Email**: Verify new email OTP
- **Phone**: OTP old phone + PIN + 24h withdrawal freeze
- **Bank**: PIN + OTP + 12h freeze

Requires `driver_security` (transaction PIN) – implement in Phase 3.
