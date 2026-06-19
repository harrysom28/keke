import User from '../models/User.js';
import UserWallet from '../models/UserWallet.js';
import Driver from '../models/Driver.js';
import AdminSettings from '../models/AdminSettings.js';
import { generateTokenPair } from '../utils/jwt.js';
import { addToBlacklist } from '../services/tokenBlacklist.js';
import { extractTokenFromRequest } from '../middleware/auth.js';
import { createSession, validateAndRotateSession, revokeSessions } from '../services/sessionService.js';
import crypto from 'crypto';
import { generateOTP, storeOTP, verifyOTP, deleteOTP, wasOtpIssuedRecently } from '../utils/otp.js';
import { cache } from '../config/redis.js';
import { AuthenticationError, ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import notificationService from '../services/notificationService.js';
import { provisionDvaAsync } from '../services/dvaProvisioningService.js';
import { normalizePhone, phoneVariants } from '../utils/phone.js';
import {
  reconcileCancelledScheduledRideEscrows,
  computeRiderWalletApiTotals,
} from '../services/escrowWalletService.js';
const { sendEmail, sendSMS } = notificationService;
import logger from '../utils/logger.js';

/** Termii / telco template — must match approved copy (channel dnd, sender N-Alert). */
const termiiOtpSmsBody = (otp) =>
  `Your Keke App Verification code is: ${otp}. Valid for 10 minutes.`;

/** Log OTP to terminal in development so you can copy it without SMS/email */
function logOtpToTerminal(otp, target, purpose = 'verification') {
  if (process.env.NODE_ENV === 'production') return;
  const line = '════════════════════════════════════════';
  console.log('\n' + line);
  console.log('  🔐 OTP (' + purpose + '):', otp);
  console.log('  For:', target);
  console.log(line + '\n');
}

/**
 * Issue token pair and create device-bound session
 * device_id: required for session; use 'legacy' if not provided (backward compat)
 */
async function issueTokenPairWithSession(user, req) {
  const deviceId = req.body.device_id || req.headers['x-device-id'] || 'legacy';
  const ipAddress = req.ip || req.connection?.remoteAddress;

  const tokens = generateTokenPair({ id: user._id, role: user.role });

  await createSession({
    userId: user._id,
    deviceId,
    refreshToken: tokens.refreshToken,
    ipAddress,
  });

  return tokens;
}

/**
 * Parse the polymorphic `email_phone_number` request field into a
 * normalized email and/or phone, plus the set of historical phone shapes
 * that should be used for any User lookup. Routing every auth handler
 * through this helper guarantees that `09035689338`, `2349035689338`,
 * and `+2349035689338` all resolve to the same user — both for new
 * writes (which converge on the canonical `+234XXXXXXXXXX` form) and
 * for legacy reads (which fan out across every equivalent shape via
 * `phoneQuery`).
 */
function parseLoginIdentifier(emailPhone) {
  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const value = String(emailPhone ?? '').trim();
  const isEmail = emailRegex.test(value);
  return {
    isEmail,
    email: isEmail ? value.toLowerCase() : undefined,
    phone: isEmail ? undefined : (normalizePhone(value) || undefined),
    phoneQuery: isEmail ? [] : phoneVariants(value),
  };
}

/**
 * Register/Signup user
 */
export const register = asyncHandler(async (req, res) => {
  const registerT0 = Date.now();
  const { email_phone_number, referral_code, password, device_id, device_token, role } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  const cleanedReferral = typeof referral_code === 'string' ? referral_code.trim() : '';

  // Look up existing account and optional referrer in parallel (saves one RTT on new signups with a referral code).
  const [existingUser, referrerDoc] = await Promise.all([
    User.findOne({
      $or: [
        ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
        ...(email ? [{ email }] : []),
      ],
    }),
    cleanedReferral ? User.findOne({ referralCode: cleanedReferral }).select('_id') : Promise.resolve(null),
  ]);

  // Helper to generate/store/send OTP for a user
  const sendOtpForUser = async (userDoc, statusCode, baseMessage) => {
    const otp = generateOTP();

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`🔐 [DEV] OTP for ${userDoc.phone || userDoc.email}: ${otp} (use this if SMS/email not received)`);
      logOtpToTerminal(otp, userDoc.phone || userDoc.email, 'signup/verification');
    }

    // Store OTP for whatever identifiers exist (parallel when both phone and email — rare on phone-first signup).
    await Promise.all([
      userDoc.phone ? storeOTP(userDoc.phone, otp, 'verification') : Promise.resolve(),
      userDoc.email ? storeOTP(userDoc.email.toLowerCase(), otp, 'verification') : Promise.resolve(),
    ]);

    logger.info({
      event: 'register_otp_ready',
      ms: Date.now() - registerT0,
      statusCode,
      identifiers: [userDoc.phone && 'phone', userDoc.email && 'email'].filter(Boolean),
    });

    // Respond immediately after OTP is stored (do not block on SMS/email providers)
    const message = baseMessage;
    const response = res.status(statusCode).json({
      status: 'success',
      message,
      data: {
        user: {
          user_id: userDoc._id,
          phone: userDoc.phone,
          email: userDoc.email,
        },
        otp_queued: true,
      },
    });

    // Fire-and-forget delivery after responding
    setImmediate(() => {
      if (userDoc.phone) {
        sendSMS(userDoc.phone, termiiOtpSmsBody(otp)).catch((err) => {
          logger.error(`❌ Error sending OTP SMS to ${userDoc.phone}: ${err.message}`);
        });
      }

      if (userDoc.email) {
        logger.info(`📧 Attempting to send OTP email to: ${userDoc.email.toLowerCase()}`);
        sendEmail(
          userDoc.email.toLowerCase(),
          'Your Verification Code',
          `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #43A048;">Verification Code</h2>
              <p>Your verification code is:</p>
              <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px;">
                ${otp}
              </div>
              <p>This code is valid for 10 minutes.</p>
              <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
            </div>
          `
        )
          .then((emailSent) => {
            if (emailSent) {
              logger.info(`✅ OTP email sent successfully to ${userDoc.email}`);
            } else {
              logger.warn(`⚠️ OTP email send returned false for ${userDoc.email} - check SMTP configuration`);
            }
          })
          .catch((emailError) => {
            logger.error(`❌ Error sending OTP email to ${userDoc.email}: ${emailError.message}`);
            logger.error(`Email error details: ${JSON.stringify(emailError)}`);
          });
      }
    });

    return response;
  };

  if (existingUser) {
    // If fully registered, tell client to login
    if (existingUser.isRegCompleted) {
      throw new ConflictError('Account already exists. Please login.');
    }

    // Avoid a second OTP when the user double-submits signup: same code stays valid
    const throttleId = existingUser.phone || existingUser.email?.toLowerCase();
    if (throttleId && (await wasOtpIssuedRecently(throttleId, 'verification'))) {
      logger.info({
        event: 'register_response',
        path: 'otp_recently_sent',
        ms: Date.now() - registerT0,
      });
      return res.status(200).json({
        status: 'success',
        message: 'Verification code already sent. Please check your messages.',
        data: {
          user: {
            user_id: existingUser._id,
            phone: existingUser.phone,
            email: existingUser.email,
          },
          otp_queued: false,
          otp_recently_sent: true,
        },
      });
    }

    // If not completed, resend OTP instead of failing
    return await sendOtpForUser(existingUser, 200, 'OTP resent');
  }

  // Create user (not verified yet)
  const userData = {
    phone,
    email,
    ...(password ? { password } : {}),
    role: role === 'driver' ? 'driver' : 'passenger', // Set role based on registration type
    isVerified: false,
    isRegCompleted: false,
    deviceId: device_id,
    deviceToken: device_token,
  };

  if (referrerDoc) {
    userData.referredBy = referrerDoc._id;
  }

  const user = await User.create(userData);

  return await sendOtpForUser(user, 201, 'OTP sent');
});

/**
 * Verify OTP
 */
export const verifyOTPCode = asyncHandler(async (req, res) => {
  const { email_phone_number, otp } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  const identifier = email || phone;
  const result = await verifyOTP(identifier, otp, 'verification');

  if (!result.valid) {
    throw new ValidationError(result.message);
  }

  // Find and update user — fan out across legacy phone shapes so a
  // pre-migration record stored as `09035689338` is still matched when
  // the client sends `+2349035689338` (and vice versa).
  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  await User.findByIdAndUpdate(
    user._id,
    { $set: { isVerified: true } },
    { runValidators: false }
  );

  res.json({
    status: 'success',
    message: 'OTP verified successfully',
    data: {
      user: {
        user_id: user._id,
        phone: user.phone,
        email: user.email,
        isVerified: true,
      },
    },
  });
});

/**
 * OTP-only login: verify OTP and issue tokens if onboarding complete
 * POST /auth/user/login-with-otp
 * Body: email_phone_number, otp, device_id?, device_token?
 */
export const loginWithOtp = asyncHandler(async (req, res) => {
  const { email_phone_number, otp, device_id, device_token } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);
  const identifier = email || phone;

  const result = await verifyOTP(identifier, otp, 'verification');
  if (!result.valid) {
    throw new ValidationError(result.message);
  }

  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  const authUpdateFields = { isVerified: true };
  if (device_id) authUpdateFields.deviceId = device_id;
  if (device_token) authUpdateFields.deviceToken = device_token;
  await User.findByIdAndUpdate(user._id, { $set: authUpdateFields }, { runValidators: false });
  // Re-fetch so formatUserResponse has current data
  const freshUser = await User.findById(user._id);

  if (phone) await deleteOTP(phone, 'verification');
  if (email) await deleteOTP(email, 'verification');

  const tokens = await issueTokenPairWithSession(freshUser, req);

  const canBook =
    freshUser.onboardingStage === 'rider_complete' ||
    freshUser.onboardingStage === 'driver_complete' ||
    freshUser.isRegCompleted;

  res.json({
    status: 'success',
    message: canBook ? 'Login successful' : 'Complete onboarding to continue',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(freshUser),
      needs_onboarding: !canBook,
    },
  });
});

/**
 * Complete signup
 */
export const completeSignup = asyncHandler(async (req, res) => {
  const {
    email_phone_number,
    otp,
    name,
    email: optionalEmail,
    device_id,
    device_token,
    profile_photo,
  } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  // Find user (legacy-shape tolerant)
  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  // OTP may already have been consumed by /confirm-otp (verifyOTP deletes it).
  // If the user isn't verified yet, require a valid OTP here.
  if (!user.isVerified) {
    const identifier = email || phone;
    const otpResult = await verifyOTP(identifier, otp, 'verification');
    if (!otpResult.valid) {
      throw new ValidationError(otpResult.message);
    }
    user.isVerified = true;
  }

  user.name = name;
  if (optionalEmail?.trim()) user.email = String(optionalEmail).toLowerCase().trim();
  if (profile_photo) user.profileImage = profile_photo;
  user.isRegCompleted = true;
  user.isRegVerified = true;
  user.deviceId = device_id;
  user.deviceToken = device_token;

  if (user.role === 'passenger') {
    user.onboardingStage = 'rider_complete';
  }

  // Fallback wallet reference (used when Paystack DVA is not available)
  if (!user.walletAccountNumber) {
    user.walletAccountNumber = 'KEKE' + user._id.toString().slice(-8).toUpperCase();
  }

  await user.save();

  provisionDvaAsync(user._id);

  // Best-effort delete OTP if still present (either identifier)
  if (phone) await deleteOTP(phone, 'verification');
  if (email) await deleteOTP(email, 'verification');

  const tokens = await issueTokenPairWithSession(user, req);

  res.json({
    status: 'success',
    message: 'Registration completed successfully',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Validate referral code - GET /api/auth/referral-code/validate?code=XXX
 * Public endpoint to check if a referral code exists
 */
export const validateReferralCode = asyncHandler(async (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) {
    return res.json({ valid: false, message: 'Referral code is required' });
  }
  const referrer = await User.findOne({ referralCode: code }).select('_id');
  res.json({
    valid: !!referrer,
    message: referrer ? 'Referral code is valid' : 'Referral code not found',
  });
});

/**
 * Login
 */
export const login = asyncHandler(async (req, res) => {
  const { email_phone_number, password, device_id, device_token } = req.body;

  const { isEmail, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  // Find user by email or phone — phone lookup fans out across legacy
  // formats so users created before the normalizer (stored as digits
  // only) still log in when typing `+234…` and vice versa.
  let user;
  if (isEmail) {
    user = await User.findOne({ email }).select('+password');
  } else {
    user = await User.findOne({ phone: { $in: phoneQuery } }).select('+password');
  }

  if (!user || !(await user.comparePassword(password))) {
    throw new AuthenticationError('Invalid email/phone number or password');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  if (device_id) user.deviceId = device_id;
  if (device_token) user.deviceToken = device_token;
  await user.save();

  const tokens = await issueTokenPairWithSession(user, req);

  res.json({
    status: 'success',
    message: 'Login successful',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Email/password registration (testing / secondary auth — skips OTP)
 * POST /api/auth/email/register
 * Body: name, email, password, phone, device_id?, device_token?
 */
export const emailRegister = asyncHandler(async (req, res) => {
  const { name, email, password, phone, device_id, device_token, role, referral_code } = req.body;
  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedName = String(name).trim();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new ValidationError('Please provide a valid Nigerian phone number');
  }
  const phoneQuery = phoneVariants(phone);
  const userRole = role === 'driver' ? 'driver' : 'passenger';
  const cleanedReferral = typeof referral_code === 'string' ? referral_code.trim() : '';
  let referrerDoc = null;
  if (cleanedReferral) {
    referrerDoc = await User.findOne({ referralCode: cleanedReferral }).select('_id');
    if (!referrerDoc) {
      throw new ValidationError('Referral code not found. Please check and try again.');
    }
  }

  const [existingUser, existingPhoneUser] = await Promise.all([
    User.findOne({ email: normalizedEmail }),
    phoneQuery.length
      ? User.findOne({ phone: { $in: phoneQuery } })
      : Promise.resolve(null),
  ]);
  if (existingUser) {
    throw new ConflictError('An account with this email already exists');
  }
  if (existingPhoneUser) {
    throw new ConflictError('An account with this phone number already exists');
  }

  const userData = {
    name: trimmedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    role: userRole,
    isVerified: true,
    isRegCompleted: true,
    isRegVerified: true,
    deviceId: device_id,
    deviceToken: device_token,
  };

  if (userRole === 'passenger') {
    userData.onboardingStage = 'rider_complete';
  }

  if (referrerDoc) {
    userData.referredBy = referrerDoc._id;
  }

  const user = await User.create(userData);

  if (!user.walletAccountNumber) {
    user.walletAccountNumber = 'KEKE' + user._id.toString().slice(-8).toUpperCase();
    await user.save({ validateBeforeSave: false });
  }

  if (userRole === 'passenger') {
    provisionDvaAsync(user._id);
  }

  const tokens = await issueTokenPairWithSession(user, req);
  const needsOnboarding = userRole === 'driver';

  res.status(201).json({
    status: 'success',
    message: needsOnboarding ? 'Account created — complete driver setup to continue' : 'Registration successful',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(user),
      needs_onboarding: needsOnboarding,
    },
  });
});

/**
 * Email/password login
 * POST /api/auth/email/login
 * Body: email, password, device_id?, device_token?
 */
export const emailLogin = asyncHandler(async (req, res) => {
  const { email, password, device_id, device_token } = req.body;
  const normalizedEmail = String(email).toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  if (device_id) user.deviceId = device_id;
  if (device_token) user.deviceToken = device_token;
  await user.save();

  const tokens = await issueTokenPairWithSession(user, req);

  res.json({
    status: 'success',
    message: 'Login successful',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Refresh token - device-bound, rotates refresh token on use
 * Requires: refresh_token, device_id (or x-device-id header)
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const refreshTokenRaw = req.body.refresh_token;
  const deviceId = req.body.device_id || req.headers['x-device-id'];
  const ipAddress = req.ip || req.connection?.remoteAddress;

  const { user, accessToken, refreshToken: newRefreshToken } = await validateAndRotateSession(
    refreshTokenRaw,
    deviceId || 'legacy',
    ipAddress
  );

  res.json({
    status: 'success',
    authorisation: {
      token: accessToken,
      refresh_token: newRefreshToken,
      type: 'bearer',
    },
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Logout - blacklist access token and revoke session(s)
 * Optional: device_id in body to revoke only that device; else revokes all sessions
 */
export const logout = asyncHandler(async (req, res) => {
  const token = extractTokenFromRequest(req);
  if (token) {
    await addToBlacklist(token);
  }

  if (req.user) {
    const user = await User.findById(req.user._id);
    if (user) {
      user.deviceToken = null;
      await user.save();

      const deviceId = req.body.device_id || req.headers['x-device-id'];
      await revokeSessions(user._id, deviceId || undefined);
    }
  }

  res.json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

/**
 * Get current user
 */
export const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: user._id })
      .populate('vehicleDetails.vehicleType');
    user.driver = driver;
  }

  let formatted = formatUserResponse(user);

  if (user.role === 'driver' && user.driver?._id) {
    const { getOrCreateWallet, ensureWalletDayStats, getWithdrawableBalance } = await import(
      '../services/walletService.js'
    );
    const DriverWallet = (await import('../models/DriverWallet.js')).default;
    await getOrCreateWallet(user.driver._id);
    await ensureWalletDayStats(user.driver._id);
    const w = await DriverWallet.findOne({ driverId: user.driver._id }).lean();
    const walletTotal =
      Math.round((Number(w?.availableBalance) || 0) + (Number(w?.pendingBalance) || 0)) || 0;
    formatted = {
      ...formatted,
      balance: String(walletTotal),
      commission_owed: Math.round(Number(w?.commissionOwed) || 0),
      withdrawable_balance: Math.round(getWithdrawableBalance(w)),
    };
  }

  // Passengers: mirror GET /api/wallet so profile/header balance matches hero (User + escrow UserWallet).
  if (user.role === 'passenger') {
    try {
      await reconcileCancelledScheduledRideEscrows(user._id);
    } catch (_) {
      /* best-effort */
    }
    const escrowWallet = await UserWallet.findOne({
      userId: user._id,
      userType: 'rider',
    }).lean();
    const fresh = await User.findById(user._id).select('balance').lean();
    const totals = computeRiderWalletApiTotals(fresh?.balance, escrowWallet);
    formatted = {
      ...formatted,
      balance: String(Math.round(totals.balance)),
    };
  }

  const uid = user._id.toString();
  const topupRef = user.walletAccountNumber || ('KEKE' + uid.slice(-8).toUpperCase());
  if (!user.walletAccountNumber) {
    user.walletAccountNumber = topupRef;
    User.findByIdAndUpdate(user._id, { walletAccountNumber: topupRef }).catch(() => {});
  }
  formatted.wallet_account_number = topupRef;
  formatted.topup_reference = topupRef;

  // Single AdminSettings fetch for DVA and platform top-up
  let settings = await cache.get('admin_settings:default');
  if (!settings) {
    settings = await AdminSettings.findOne({ key: 'default' }).lean();
    if (settings) {
      await cache.set('admin_settings:default', settings, 300);
    }
  }

  if (!user.topupAccountNumber && process.env.PAYSTACK_SECRET_KEY && user.isRegCompleted) {
    provisionDvaAsync(user._id);
  }

  if (!formatted.topup_account_number || !formatted.topup_bank_name) {
    const platform = settings?.topup;
    if (platform?.accountNumber && platform?.bankName) {
      formatted.topup_bank_name = formatted.topup_bank_name || platform.bankName;
      formatted.topup_account_name = formatted.topup_account_name || platform.accountName;
      formatted.topup_account_number = formatted.topup_account_number || platform.accountNumber;
    }
  }

  res.json({
    status: 'success',
    data: {
      user: formatted,
    },
  });
});

/**
 * Save push token for the authenticated user
 * POST /api/auth/push-token
 */
export const savePushToken = asyncHandler(async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const type = typeof req.body?.type === 'string' ? req.body.type.trim() : null;

  if (!token) {
    throw new ValidationError('Token is required');
  }

  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        expoPushToken: token,
        pushTokenType: type || 'expo',
        // Keep legacy fields populated so existing notification code paths still work.
        deviceToken: token,
        fcm_token: token,
      },
    },
    { runValidators: false }
  );

  res.json({
    status: 'success',
    data: { success: true },
  });
});

/**
 * Resend OTP - POST /api/auth/user/resend-otp
 * If user doesn't exist, create them (idempotent OTP-first flow)
 */
export const resendOTP = asyncHandler(async (req, res) => {
  const { email_phone_number, referral_code, role } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  // Check if user exists (legacy-shape tolerant)
  let user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  // If user doesn't exist, create them (idempotent OTP-first flow)
  if (!user) {
    logger.info(`User not found for resend OTP, creating new user: ${email_phone_number}`);
    
    // Create user (not verified yet)
    const userData = {
      phone,
      email,
      role: role === 'driver' ? 'driver' : 'passenger',
      isVerified: false,
      isRegCompleted: false,
    };

    // If a referral code was provided, link the referrer
    const cleanedReferral = typeof referral_code === 'string' ? referral_code.trim() : '';
    if (cleanedReferral) {
      const referrer = await User.findOne({ referralCode: cleanedReferral });
      if (referrer) {
        userData.referredBy = referrer._id;
      }
    }

    try {
      user = await User.create(userData);
      logger.info(`Created new user for resend OTP: ${user._id}`);
    } catch (error) {
      // If creation fails (e.g., duplicate), try to find the user again
      if (error.code === 11000) {
        logger.warn(`Duplicate key error during user creation, attempting to find existing user`);
        user = await User.findOne({
          $or: [
            ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
            ...(email ? [{ email }] : []),
          ],
        });
        if (!user) {
          throw new ValidationError('Unable to create or find user. Please try registering again.');
        }
      } else {
        throw error;
      }
    }
  }

  // If user is already fully registered, provide helpful message
  if (user.isRegCompleted) {
    throw new ConflictError('Account already exists. Please login instead.');
  }

  const throttleId = user.phone || user.email?.toLowerCase();
  if (throttleId && (await wasOtpIssuedRecently(throttleId, 'verification'))) {
    throw new ValidationError(
      'A verification code was just sent. Please wait about a minute before requesting a new one.'
    );
  }

  return await sendOtpForUser(res, user, 200, 'OTP resent');
});

/**
 * Request OTP for login - POST /api/auth/user/request-login-otp
 * For existing users (including fully registered). Sends OTP to phone/email.
 */
export const requestLoginOtp = asyncHandler(async (req, res) => {
  const { email_phone_number } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('No account found with this phone or email. Please sign up first.');
  }

  const identifier = email || phone;
  if (identifier && (await wasOtpIssuedRecently(identifier, 'verification'))) {
    throw new ValidationError(
      'A login code was just sent. Please wait about a minute before requesting another.'
    );
  }

  const otp = generateOTP();
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`🔐 [DEV] Login OTP for ${identifier}: ${otp} (use this if SMS/email not received)`);
    logOtpToTerminal(otp, identifier, 'login');
  }
  await storeOTP(identifier, otp, 'verification');

  const queuedMethods = [];
  if (user.phone) queuedMethods.push('SMS');
  if (user.email) queuedMethods.push('email');
  const message =
    queuedMethods.length > 0
      ? `Login code queued via ${queuedMethods.join(' and ')}`
      : 'Code generated. Check your phone or email.';

  res.json({
    status: 'success',
    message,
    data: { otp_queued: true },
  });

  setImmediate(() => {
    if (user.phone) {
      sendSMS(user.phone, termiiOtpSmsBody(otp)).catch((err) => {
        logger.error(`❌ Error sending login OTP SMS to ${user.phone}: ${err.message}`);
      });
    }

    if (user.email) {
      sendEmail(
        user.email,
        'Your Login Code',
        `<p>Your login code is: <strong>${otp}</strong>. Valid for 10 minutes.</p>`
      ).catch((e) => {
        logger.error(`Login OTP email error: ${e.message}`);
      });
    }
  });
});

/**
 * Helper to send OTP (used by resendOTP)
 */
async function sendOtpForUser(res, userDoc, statusCode, baseMessage) {
    const otp = generateOTP();

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`🔐 [DEV] OTP for ${userDoc.phone || userDoc.email}: ${otp} (use this if SMS/email not received)`);
      logOtpToTerminal(otp, userDoc.phone || userDoc.email, 'resend');
    }

    if (userDoc.phone) await storeOTP(userDoc.phone, otp, 'verification');
    if (userDoc.email) await storeOTP(userDoc.email.toLowerCase(), otp, 'verification');

  const message = baseMessage;
  const response = res.status(statusCode).json({
    status: 'success',
    message,
    data: {
      user: {
        user_id: userDoc._id,
        phone: userDoc.phone,
        email: userDoc.email,
      },
      otp_queued: true,
    },
  });

  setImmediate(() => {
    if (userDoc.phone) {
      sendSMS(userDoc.phone, termiiOtpSmsBody(otp)).catch((err) => {
        logger.error(`❌ Error sending OTP SMS to ${userDoc.phone}: ${err.message}`);
      });
    }

    if (userDoc.email) {
      logger.info(`📧 Attempting to send OTP email to: ${userDoc.email.toLowerCase()}`);
      sendEmail(
        userDoc.email.toLowerCase(),
        'Your Verification Code',
        `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #43A048;">Verification Code</h2>
              <p>Your verification code is:</p>
              <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px;">
                ${otp}
              </div>
              <p>This code is valid for 10 minutes.</p>
              <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
            </div>
          `
      )
        .then((emailSent) => {
          if (emailSent) {
            logger.info(`✅ OTP email sent successfully to ${userDoc.email}`);
          } else {
            logger.warn(`⚠️ OTP email send returned false for ${userDoc.email} - check SMTP configuration`);
          }
        })
        .catch((emailError) => {
          logger.error(`❌ Error sending OTP email to ${userDoc.email}: ${emailError.message}`);
          logger.error(`Email error details: ${JSON.stringify(emailError)}`);
        });
    }
  });

  return response;
}

const PASSWORD_RESET_TOKEN_EXPIRE_SECONDS = 5 * 60; // 5 minutes

/**
 * Forgot password init - POST /api/forgot/password (public)
 * Sends OTP to email/phone for password reset. User must already be registered.
 */
export const forgotPasswordInit = asyncHandler(async (req, res) => {
  const { email_phone_number } = req.body;

  const { phone, email, phoneQuery } = parseLoginIdentifier(email_phone_number);

  const user = await User.findOne({
    $or: [
      ...(phoneQuery.length ? [{ phone: { $in: phoneQuery } }] : []),
      ...(email ? [{ email }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('No account found with this email or phone number.');
  }

  if (!user.isRegCompleted) {
    throw new ValidationError('Please complete registration first, then use login.');
  }

  const otp = generateOTP();
  const identifier = email || phone;
  if (process.env.NODE_ENV !== 'production') {
    logger.info(`🔐 [DEV] Password reset OTP for ${identifier}: ${otp} (use this if SMS/email not received)`);
    logOtpToTerminal(otp, identifier, 'password_reset');
  }
  await storeOTP(identifier, otp, 'password_reset');

  const queuedMethods = [];
  if (user.phone) queuedMethods.push('SMS');
  if (user.email) queuedMethods.push('email');
  const message =
    queuedMethods.length > 0
      ? `Password reset code queued via ${queuedMethods.join(' and ')}`
      : 'Code generated but could not be sent. Please contact support.';

  res.json({
    status: 'success',
    message,
    data: {
      otp_queued: true,
    },
  });

  setImmediate(() => {
    if (user.phone) {
      sendSMS(user.phone, termiiOtpSmsBody(otp)).catch((err) => {
        logger.error(`❌ Error sending password reset OTP SMS to ${user.phone}: ${err.message}`);
      });
    }

    if (user.email) {
      sendEmail(
        user.email,
        'Password Reset Code',
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #43A048;">Password Reset</h2>
            <p>Your password reset code is:</p>
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px; letter-spacing: 5px;">
              ${otp}
            </div>
            <p>This code is valid for 10 minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this, please ignore this email.</p>
          </div>
        `
      ).catch((e) => {
        logger.error(`Forgot password email error: ${e.message}`);
      });
    }
  });
});

/**
 * Forgot password confirm OTP - POST /api/forgot/password/confirm-otp (public)
 * Verifies OTP and returns a short-lived reset_token for the reset step.
 */
export const forgotPasswordConfirmOtp = asyncHandler(async (req, res) => {
  const { email_phone_number, otp } = req.body;

  const { phone, email } = parseLoginIdentifier(email_phone_number);
  const identifier = email || phone;

  const result = await verifyOTP(identifier, otp, 'password_reset');
  if (!result.valid) {
    throw new ValidationError(result.message);
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  await cache.set(`reset_token:${resetToken}`, identifier, PASSWORD_RESET_TOKEN_EXPIRE_SECONDS);

  res.json({
    status: 'success',
    message: 'OTP verified. You can now set a new password.',
    data: {
      reset_token: resetToken,
    },
  });
});

/**
 * Forgot password reset - POST /api/forgot/password/reset (public)
 * Accepts reset_token from confirm-otp and new password.
 */
export const forgotPasswordReset = asyncHandler(async (req, res) => {
  const { reset_token, password, password_confirmation } = req.body;

  const identifier = await cache.get(`reset_token:${reset_token}`);
  if (!identifier) {
    throw new ValidationError('Invalid or expired reset link. Please request a new password reset.');
  }

  await cache.del(`reset_token:${reset_token}`);

  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(identifier);
  // The cached identifier was normalized when confirm-otp ran, but the
  // stored user record may pre-date normalization, so still fan out.
  const user = await User.findOne({
    $or: [
      ...(isEmail ? [{ email: identifier }] : []),
      ...(!isEmail ? [{ phone: { $in: phoneVariants(identifier) } }] : []),
    ],
  });

  if (!user) {
    throw new NotFoundError('User not found.');
  }

  user.password = password;
  await user.save();

  res.json({
    status: 'success',
    message: 'Password updated successfully. You can now log in.',
  });
});

/**
 * Google OAuth callback - POST /api/auth/google/callbacks
 */
export const googleAuthCallback = asyncHandler(async (req, res) => {
  const { id_token, device_id, device_token } = req.body;

  if (!id_token) {
    throw new ValidationError('Google ID token is required');
  }

  try {
    // Verify Google ID token using google-auth-library
    let payload;
    
    if (process.env.GOOGLE_CLIENT_ID) {
      try {
        const { OAuth2Client } = await import('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

        const ticket = await client.verifyIdToken({
          idToken: id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });

        payload = ticket.getPayload();
      } catch (error) {
        if (process.env.NODE_ENV === 'production') {
          logger.warn(`Google token verification failed in production: ${error.message}`);
          throw new ValidationError('Google authentication failed');
        }
        logger.warn(`Google token verification failed, using fallback: ${error.message}`);
        const base64Url = id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      }
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('GOOGLE_CLIENT_ID not configured in production');
        throw new ValidationError('Google authentication is not configured');
      }
      logger.warn('GOOGLE_CLIENT_ID not configured, using fallback JWT decode');
      const base64Url = id_token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(base64, 'base64').toString());
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists by Google ID or email
    let user = await User.findOne({
      $or: [{ googleId }, { email: email?.toLowerCase() }],
    });

    if (user) {
      // Update user info
      if (!user.googleId) {
        user.googleId = googleId;
      }
      if (!user.profileImage && picture) {
        user.profileImage = picture;
      }
      if (device_id) user.deviceId = device_id;
      if (device_token) user.deviceToken = device_token;
      await user.save();
    } else {
      // Create new user
      const newUser = await User.create({
        name: name || 'User',
        email: email.toLowerCase(),
        phone: `+${Date.now()}`, // Temporary phone number
        googleId,
        profileImage: picture || null,
        isVerified: true,
        isRegCompleted: true,
        isRegVerified: true,
        deviceId: device_id,
        deviceToken: device_token,
      });
      newUser.walletAccountNumber = 'KEKE' + newUser._id.toString().slice(-8).toUpperCase();
      await newUser.save({ validateBeforeSave: false });
      user = newUser;

      // Create Paystack DVA for wallet top-ups (best-effort). Drivers get DVA only when admin approves.
      if (user.role !== 'driver') {
        try {
          const settings = await AdminSettings.findOne({ key: 'default' });
          const preferredBank = settings?.dvaPreferredBank || 'wema-bank';
          const dva = await createDVAForUser(user, preferredBank);
          if (dva) {
            user.topupAccountNumber = dva.account_number;
            user.topupBankName = dva.bank_name;
            user.topupAccountName = dva.account_name;
            user.paystackCustomerCode = dva.paystackCustomerCode;
            await user.save({ validateBeforeSave: false });
          }
        } catch (err) {
          logger.warn(`Paystack DVA creation failed for Google user ${user._id}: ${err.message}`);
        }
      }
    }

    const tokens = await issueTokenPairWithSession(user, req);

    logger.info(`Google authentication successful for user ${user._id}`);

    res.json({
      status: 'success',
      message: 'Google authentication successful',
      authorisation: {
        token: tokens.token,
        refresh_token: tokens.refreshToken,
        type: 'bearer',
      },
      data: {
        user: formatUserResponse(user),
      },
    });
  } catch (error) {
    logger.error(`Google authentication error: ${error.message}`);
    throw new ValidationError('Google authentication failed');
  }
});

/**
 * Format user response for mobile app compatibility
 */
const formatUserResponse = (user) => {
  return {
    user_id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    image: user.profileImage,
    role: user.role,
    is_reg_completed: user.isRegCompleted,
    is_reg_verified: user.isRegVerified,
    balance: user.balance?.toString() || '0',
    rating: user.rating || 0,
    gender: user.gender,
    address: user.address,
    city: user.city,
    state: user.state,
    country: user.country,
    topup_account_name: user.topupAccountName,
    topup_account_number: user.topupAccountNumber,
    topup_bank_name: user.topupBankName,
    wallet_account_number: user.walletAccountNumber || ('KEKE' + user._id.toString().slice(-8).toUpperCase()),
    police_emergency_contact: user.policeEmergencyContact,
    referral_code: user.referralCode,
    driver_id: user.driver?._id?.toString() || null,
  };
};
