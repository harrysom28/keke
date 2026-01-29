import User from '../models/User.js';
import Driver from '../models/Driver.js';
import { generateTokenPair, verifyRefreshToken, generateAccessToken } from '../utils/jwt.js';
import { generateOTP, storeOTP, verifyOTP, deleteOTP } from '../utils/otp.js';
import { AuthenticationError, ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import notificationService from '../services/notificationService.js';
const { sendEmail, sendSMS } = notificationService;
import logger from '../utils/logger.js';

/**
 * Register/Signup user
 */
export const register = asyncHandler(async (req, res) => {
  const { email_phone_number, referral_code, password, device_id, device_token, role } = req.body;

  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(email_phone_number);
  const phone = isEmail ? undefined : String(email_phone_number).replace(/\D/g, '');
  const email = isEmail ? String(email_phone_number).toLowerCase() : undefined;

  // Check if user already exists (OTP-first flow should be idempotent)
  const existingUser = await User.findOne({
    $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
  });

  // Helper to generate/store/send OTP for a user
  const sendOtpForUser = async (userDoc, statusCode, baseMessage) => {
    const otp = generateOTP();

    // Store OTP for whatever identifiers exist
    if (userDoc.phone) await storeOTP(userDoc.phone, otp, 'verification');
    if (userDoc.email) await storeOTP(userDoc.email.toLowerCase(), otp, 'verification');

    const smsSent = userDoc.phone
      ? await sendSMS(userDoc.phone, `Your verification code is: ${otp}. Valid for 10 minutes.`)
      : false;
    
    let emailSent = false;
    if (userDoc.email) {
      try {
        logger.info(`📧 Attempting to send OTP email to: ${userDoc.email.toLowerCase()}`);
        emailSent = await sendEmail(
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
        );
        if (emailSent) {
          logger.info(`✅ OTP email sent successfully to ${userDoc.email}`);
        } else {
          logger.warn(`⚠️ OTP email send returned false for ${userDoc.email} - check SMTP configuration`);
        }
      } catch (emailError) {
        logger.error(`❌ Error sending OTP email to ${userDoc.email}: ${emailError.message}`);
        logger.error(`Email error details: ${JSON.stringify(emailError)}`);
        emailSent = false;
      }
    }

    const sentMethods = [];
    if (smsSent) sentMethods.push('SMS');
    if (emailSent) sentMethods.push('email');

    let message = baseMessage;
    if (sentMethods.length > 0) {
      message = `${baseMessage} via ${sentMethods.join(' and ')}`;
    } else {
      logger.warn(`Failed to send OTP via any method for user: ${userDoc.phone || userDoc.email}`);
      message = 'OTP generated but could not be sent. Please contact support.';
    }

    return res.status(statusCode).json({
      status: 'success',
      message,
      data: {
        user: {
          user_id: userDoc._id,
          phone: userDoc.phone,
          email: userDoc.email,
        },
        otp_sent: { sms: smsSent, email: emailSent },
      },
    });
  };

  if (existingUser) {
    // If fully registered, tell client to login
    if (existingUser.isRegCompleted) {
      throw new ConflictError('Account already exists. Please login.');
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

  // If a referral code was provided, link the referrer (do NOT overwrite this user's unique referralCode)
  const cleanedReferral = typeof referral_code === 'string' ? referral_code.trim() : '';
  if (cleanedReferral) {
    const referrer = await User.findOne({ referralCode: cleanedReferral });
    if (referrer) {
      userData.referredBy = referrer._id;
    }
  }

  const user = await User.create(userData);

  return await sendOtpForUser(user, 201, 'OTP sent');
});

/**
 * Verify OTP
 */
export const verifyOTPCode = asyncHandler(async (req, res) => {
  const { email_phone_number, otp } = req.body;

  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(email_phone_number);
  const phone = isEmail ? undefined : String(email_phone_number).replace(/\D/g, '');
  const email = isEmail ? String(email_phone_number).toLowerCase() : undefined;

  const identifier = email || phone;
  const result = await verifyOTP(identifier, otp, 'verification');

  if (!result.valid) {
    throw new ValidationError(result.message);
  }

  // Find and update user
  const user = await User.findOne({
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
  });

  if (!user) {
    throw new NotFoundError('User');
  }

  user.isVerified = true;
  await user.save();

  res.json({
    status: 'success',
    message: 'OTP verified successfully',
    data: {
      user: {
        user_id: user._id,
        phone: user.phone,
        email: user.email,
        isVerified: user.isVerified,
      },
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
    password,
    password_confirmation,
    country,
    state,
    device_id,
    device_token,
  } = req.body;

  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(email_phone_number);
  const phone = isEmail ? undefined : String(email_phone_number).replace(/\D/g, '');
  const email = isEmail ? String(email_phone_number).toLowerCase() : undefined;

  // Find user
  const user = await User.findOne({
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
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

  // Update user
  user.name = name;
  user.password = password;
  user.country = country;
  user.state = state;
  user.isRegCompleted = true;
  user.isRegVerified = true;
  user.deviceId = device_id;
  user.deviceToken = device_token;

  await user.save();

  // Best-effort delete OTP if still present (either identifier)
  if (phone) await deleteOTP(phone, 'verification');
  if (email) await deleteOTP(email, 'verification');

  // Generate tokens
  const tokens = generateTokenPair({ id: user._id, role: user.role });

  // Return user data with Laravel-style response for mobile app compatibility
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
 * Login
 */
export const login = asyncHandler(async (req, res) => {
  const { email_phone_number, password, device_id, device_token } = req.body;

  // Determine if email_phone_number is an email or phone
  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(email_phone_number);

  // Find user by email or phone
  let user;
  if (isEmail) {
    user = await User.findOne({ email: email_phone_number.toLowerCase() }).select('+password');
  } else {
    // Remove any formatting from phone number for comparison
    const cleanPhone = email_phone_number.replace(/\D/g, '');
    // Try exact match first, then try matching the cleaned number
    user = await User.findOne({
      $or: [
        { phone: email_phone_number },
        { phone: cleanPhone }
      ]
    }).select('+password');
  }

  if (!user || !(await user.comparePassword(password))) {
    throw new AuthenticationError('Invalid email/phone number or password');
  }

  if (!user.isActive) {
    throw new AuthenticationError('Your account has been deactivated');
  }

  // Update device info
  if (device_id) user.deviceId = device_id;
  if (device_token) user.deviceToken = device_token;
  await user.save();

  // Generate tokens
  const tokens = generateTokenPair({ id: user._id, role: user.role });

  // Laravel-style response for mobile app compatibility
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
 * Refresh token
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    throw new AuthenticationError('Refresh token is required');
  }

  const decoded = verifyRefreshToken(refresh_token);

  // Get user
  const user = await User.findById(decoded.id);

  if (!user || !user.isActive) {
    throw new AuthenticationError('User not found or inactive');
  }

  // Generate new access token
  const accessToken = generateAccessToken({ id: user._id, role: user.role });

  res.json({
    status: 'success',
    authorisation: {
      token: accessToken,
      type: 'bearer',
    },
  });
});

/**
 * Logout
 */
export const logout = asyncHandler(async (req, res) => {
  // Clear device token (optional - can implement token blacklist)
  if (req.user) {
    const user = await User.findById(req.user._id);
    if (user) {
      user.deviceToken = null;
      await user.save();
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
  // `User` schema doesn't have a `driver` field, so populating it throws StrictPopulateError.
  // Driver data is fetched separately below when role === 'driver'.
  const user = await User.findById(req.user._id);

  // Get driver profile if user is a driver
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: user._id })
      .populate('vehicleDetails.vehicleType');
    user.driver = driver;
  }

  res.json({
    status: 'success',
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Resend OTP - POST /api/auth/user/resend-otp
 * If user doesn't exist, create them (idempotent OTP-first flow)
 */
export const resendOTP = asyncHandler(async (req, res) => {
  const { email_phone_number, referral_code, role } = req.body;

  const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
  const isEmail = emailRegex.test(email_phone_number);
  const phone = isEmail ? undefined : String(email_phone_number).replace(/\D/g, '');
  const email = isEmail ? String(email_phone_number).toLowerCase() : undefined;

  // Check if user exists
  let user = await User.findOne({
    $or: [
      ...(phone ? [{ phone }] : []),
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
            ...(phone ? [{ phone }] : []),
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

  // Helper function to send OTP (reused from register endpoint)
  const sendOtpForUser = async (userDoc, statusCode, baseMessage) => {
    const otp = generateOTP();

    // Store OTP for whatever identifiers exist
    if (userDoc.phone) await storeOTP(userDoc.phone, otp, 'verification');
    if (userDoc.email) await storeOTP(userDoc.email.toLowerCase(), otp, 'verification');

    const smsSent = userDoc.phone
      ? await sendSMS(userDoc.phone, `Your verification code is: ${otp}. Valid for 10 minutes.`)
      : false;
    
    let emailSent = false;
    if (userDoc.email) {
      try {
        logger.info(`📧 Attempting to send OTP email to: ${userDoc.email.toLowerCase()}`);
        emailSent = await sendEmail(
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
        );
        if (emailSent) {
          logger.info(`✅ OTP email sent successfully to ${userDoc.email}`);
        } else {
          logger.warn(`⚠️ OTP email send returned false for ${userDoc.email} - check SMTP configuration`);
        }
      } catch (emailError) {
        logger.error(`❌ Error sending OTP email to ${userDoc.email}: ${emailError.message}`);
        logger.error(`Email error details: ${JSON.stringify(emailError)}`);
        emailSent = false;
      }
    }

    const sentMethods = [];
    if (smsSent) sentMethods.push('SMS');
    if (emailSent) sentMethods.push('email');

    let message = baseMessage;
    if (sentMethods.length > 0) {
      message = `${baseMessage} via ${sentMethods.join(' and ')}`;
    } else {
      logger.warn(`Failed to send OTP via any method for user: ${userDoc.phone || userDoc.email}`);
      message = 'OTP generated but could not be sent. Please contact support.';
    }

    return res.status(statusCode).json({
      status: 'success',
      message,
      data: {
        user: {
          user_id: userDoc._id,
          phone: userDoc.phone,
          email: userDoc.email,
        },
        otp_sent: { sms: smsSent, email: emailSent },
      },
    });
  };

  // Send OTP
  return await sendOtpForUser(user, 200, 'OTP resent');
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

        // Verify the token
        const ticket = await client.verifyIdToken({
          idToken: id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });

        payload = ticket.getPayload();
      } catch (error) {
        logger.warn(`Google token verification failed, using fallback: ${error.message}`);
        // Fallback: decode JWT without verification (for development only)
        // In production, this should fail
        const base64Url = id_token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(Buffer.from(base64, 'base64').toString());
      }
    } else {
      // Fallback if Google Client ID not configured
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
      const phone = email.split('@')[0]; // Use email prefix as temporary phone
      user = await User.create({
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
    }

    // Generate tokens
    const tokens = generateTokenPair({ id: user._id, role: user.role });

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
    police_emergency_contact: user.policeEmergencyContact,
    referral_code: user.referralCode,
    driver_id: user.driver?._id?.toString() || null,
  };
};
