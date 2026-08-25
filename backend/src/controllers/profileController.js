import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import UserSession from '../models/UserSession.js';
import UserDevice from '../models/UserDevice.js';
import { NotFoundError, ValidationError, ConflictError, AuthenticationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { normalizePhone, phoneVariants } from '../utils/phone.js';

/**
 * Update profile - PATCH /api/user/profile/update-details
 */
export const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { name, email, phone, gender, address, city, state, country, profileImage, policeEmergencyContact } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update fields if provided
  if (name) user.name = name;
  if (email) {
    // Check if email is already taken by another user
    const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
    if (existingUser) {
      throw new ConflictError('Email is already in use');
    }
    user.email = email.toLowerCase();
  }
  if (phone !== undefined && phone !== null && phone !== '') {
    // Normalize to canonical `+234XXXXXXXXXX` (Nigerian numbers) before
    // doing the dup-check, so a user who originally signed up with
    // `09035689338` can't accidentally claim `+2349035689338` here and
    // create a second collision-free record.
    const normalized = normalizePhone(phone);
    if (!normalized) {
      throw new ValidationError('Please provide a valid phone number');
    }
    // Fan out across legacy phone shapes so the dup-check catches users
    // stored under pre-migration formats too.
    const existingUser = await User.findOne({
      phone: { $in: phoneVariants(phone) },
      _id: { $ne: userId },
    });
    if (existingUser) {
      throw new ConflictError('Phone number is already in use');
    }
    user.phone = normalized;
  }
  if (gender) user.gender = gender;
  if (address !== undefined) user.address = address;
  if (city !== undefined) user.city = city;
  if (state !== undefined) user.state = state;
  if (country !== undefined) user.country = country;
  if (profileImage !== undefined) {
    // Schema expects string URL only; ignore object (e.g. mobile sending { uri, type, name } by mistake)
    if (typeof profileImage === 'string' && profileImage.trim()) {
      user.profileImage = profileImage.trim();
    } else if (!profileImage || (typeof profileImage === 'object' && !profileImage.uri)) {
      user.profileImage = null;
    }
    // else: profileImage is object with uri (file reference) — do not set, keep existing
  }
  if (policeEmergencyContact !== undefined) {
    // Schema expects string; accept string or object with phone/number for compatibility
    if (typeof policeEmergencyContact === 'string') {
      user.policeEmergencyContact = policeEmergencyContact.trim() || null;
    } else if (policeEmergencyContact && typeof policeEmergencyContact === 'object' && (policeEmergencyContact.phone || policeEmergencyContact.number)) {
      user.policeEmergencyContact = String(policeEmergencyContact.phone || policeEmergencyContact.number).trim() || null;
    } else {
      user.policeEmergencyContact = null;
    }
  }

  try {
    await user.save();
  } catch (err) {
    if (err.name === 'ValidationError') {
      const msg = Object.values(err.errors || {}).map((e) => e.message).join('; ') || err.message;
      throw new ValidationError(msg);
    }
    if (err.code === 11000) {
      const field = err.message.includes('email') ? 'Email' : err.message.includes('phone') ? 'Phone number' : 'Field';
      throw new ConflictError(`${field} is already in use`);
    }
    throw err;
  }

  logger.info(`Profile updated for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Profile updated successfully',
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Change password - PATCH /api/user/profile/password-change
 */
export const changePassword = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new ValidationError('Current password, new password, and confirmation are required');
  }

  if (newPassword !== confirmPassword) {
    throw new ValidationError('New password and confirmation do not match');
  }

  if (newPassword.length < 6) {
    throw new ValidationError('New password must be at least 6 characters');
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify current password
  const isPasswordCorrect = await user.comparePassword(currentPassword);
  if (!isPasswordCorrect) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info(`Password changed for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Password changed successfully',
  });
});

/**
 * Get profile details - GET /api/user/profile/details
 */
export const getProfileDetails = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get driver profile if user is a driver
  let driver = null;
  if (user.role === 'driver') {
    driver = await Driver.findOne({ user: userId })
      .populate('vehicleDetails.vehicleType');
  }

  res.json({
    status: 'success',
    data: {
      user: formatUserResponse(user),
      driver: driver ? formatDriverResponse(driver) : null,
    },
  });
});

/**
 * Get passenger profile - GET /api/user/profile/passenger
 */
export const getPassengerProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'passenger') {
    throw new ValidationError('User is not a passenger');
  }

  // Get ride statistics
  const totalRides = await Ride.countDocuments({ rider: userId });
  const completedRides = await Ride.countDocuments({ rider: userId, status: 'completed' });
  const cancelledRides = await Ride.countDocuments({ rider: userId, status: 'cancelled' });

  res.json({
    status: 'success',
    data: {
      user: formatUserResponse(user),
      statistics: {
        total_rides: totalRides,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        rating: user.rating || 0,
      },
    },
  });
});

/**
 * Get driver profile - GET /api/user/profile/driver
 */
export const getDriverProfileDetails = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role !== 'driver') {
    throw new ValidationError('User is not a driver');
  }

  const driver = await Driver.findOne({ user: userId })
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  res.json({
    status: 'success',
    data: {
      user: formatUserResponse(user),
      driver: formatDriverResponse(driver),
      statistics: {
        total_rides: driver.totalRides,
        earnings: driver.earnings,
        rating: driver.rating,
        acceptance_rate: driver.acceptanceRate,
        cancellation_rate: driver.cancellationRate,
      },
    },
  });
});

/** Android applicationId — must match mobile/app.json `expo.android.package`. */
const ANDROID_PACKAGE = process.env.ANDROID_PACKAGE_NAME || 'com.kekeride.app';

function buildReferralUrl(referralCode) {
  if (!referralCode) return null;
  const storeUrl =
    process.env.PLAY_STORE_URL ||
    `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  const referrer = encodeURIComponent(
    `utm_source=invite&utm_medium=share&utm_content=${referralCode}`
  );
  const sep = storeUrl.includes('?') ? '&' : '?';
  return `${storeUrl}${sep}referrer=${referrer}`;
}

/**
 * Get referral code - GET /api/user/profile/referral-code
 */
export const getReferralCode = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Generate referral code if not exists
  if (!user.referralCode && user.role === 'passenger') {
    const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    user.referralCode = randomCode;
    await user.save();
  }

  res.json({
    status: 'success',
    data: {
      referral_code: user.referralCode || null,
      referral_url: buildReferralUrl(user.referralCode),
    },
  });
});

/**
 * Get referral list - GET /api/user/profile/referral-list
 * Includes success status: invited user completed registration AND at least 1 ride
 */
export const getReferralList = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const skip = (page - 1) * limit;

  const referredUsers = await User.find({ referredBy: userId })
    .select('name email phone profileImage createdAt isRegCompleted')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  // For each referred user, check if they've completed at least 1 ride
  const referralsWithStatus = await Promise.all(
    referredUsers.map(async (refUser) => {
      const completedRides = await Ride.countDocuments({ rider: refUser._id, status: 'completed' });
      const isSuccessful = !!(refUser.isRegCompleted && completedRides >= 1);
      return {
        referred_user_id: refUser._id.toString(),
        referred_user_name: refUser.name || '—',
        referred_user_email_phone: refUser.email || refUser.phone || '—',
        referred_user_image: refUser.profileImage || null,
        joined_at: refUser.createdAt,
        total_rides: completedRides,
        verified: isSuccessful,
      };
    })
  );

  const total = await User.countDocuments({ referredBy: userId });

  res.json({
    status: 'success',
    data: {
      referral_code: user.referralCode,
      referrals: referralsWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Switch role - POST /api/auth/user/switch-role
 */
export const switchRole = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { role } = req.body;

  if (!role || !['passenger', 'driver'].includes(role)) {
    throw new ValidationError('Valid role (passenger or driver) is required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  if (user.role === role) {
    throw new ConflictError(`User is already a ${role}`);
  }

  // If switching to driver, check if driver profile exists
  if (role === 'driver') {
    const driver = await Driver.findOne({ user: userId });
    if (!driver) {
      throw new ValidationError('Driver profile must be created before switching to driver role');
    }
    if (driver.verificationStatus !== 'approved') {
      throw new ValidationError('Driver profile must be approved before switching to driver role');
    }
  }

  // If switching from driver to passenger, check for active rides
  if (user.role === 'driver' && role === 'passenger') {
    const driver = await Driver.findOne({ user: userId });
    if (driver) {
      const activeRide = await Ride.findActiveRideForDriver(driver._id);
      if (activeRide) {
        throw new ConflictError('Cannot switch role while you have an active ride');
      }
      
      // Make driver offline
      driver.isOnline = false;
      driver.isAvailable = false;
      await driver.save();
    }
  }

  user.role = role;
  await user.save();

  logger.info(`User ${userId} switched role to ${role}`);

  res.json({
    status: 'success',
    message: `Role switched to ${role} successfully`,
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Delete account - DELETE /api/auth/user/delete/account
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { password, reason } = req.body;

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Verify password
  if (password) {
    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      throw new AuthenticationError('Password is incorrect');
    }
  }

  const driver = await Driver.findOne({ user: userId });
  if (user.role === 'driver' && driver) {
    const activeRide = await Ride.findActiveRideForDriver(driver._id);
    if (activeRide) {
      throw new ConflictError('Cannot delete account while you have an active ride');
    }
  }
  if (driver) {
    await Driver.findByIdAndDelete(driver._id);
  }

  await UserSession.deleteMany({ userId });
  await UserDevice.deleteMany({ userId });

  const deleted = await User.findByIdAndDelete(userId);
  if (!deleted) {
    throw new NotFoundError('User');
  }

  logger.info(`Account hard-deleted for user ${userId}. Reason: ${reason || 'Not provided'}`);

  res.json({
    status: 'success',
    message: 'Account deleted successfully',
  });
});

/**
 * Format user response
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
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
};

/**
 * Format driver response
 */
const formatDriverResponse = (driver) => {
  return {
    driver_id: driver._id.toString(),
    license_number: driver.licenseNumber,
    license_expiry: driver.licenseExpiry,
    vehicle_details: {
      make: driver.vehicleDetails.make,
      model: driver.vehicleDetails.model,
      year: driver.vehicleDetails.year,
      plate_number: driver.vehicleDetails.plateNumber,
      color: driver.vehicleDetails.color,
      vehicle_type: driver.vehicleDetails.vehicleType?._id?.toString(),
      vehicle_type_name: driver.vehicleDetails.vehicleType?.name,
    },
    documents_verified: driver.documentsVerified,
    verification_status: driver.verificationStatus,
    is_online: driver.isOnline,
    is_available: driver.isAvailable,
    earnings: driver.earnings,
    total_rides: driver.totalRides,
    rating: driver.rating,
    acceptance_rate: driver.acceptanceRate,
    cancellation_rate: driver.cancellationRate,
  };
};
