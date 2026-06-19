import { validationResult, body, param, query } from 'express-validator';
import { ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';

/**
 * Check validation results
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = {};

    errors.array().forEach((error) => {
      // express-validator v7 uses `path` instead of `param`
      const field = error.path || error.param || 'unknown';
      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(error.msg);
    });


    throw new ValidationError('Validation failed', formattedErrors);
  }

  next();
};

/**
 * Validation rules
 */
export const validationRules = {
  // User registration
  register: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required')
      .custom((value) => {
        const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
        if (emailRegex.test(value)) return true;
        const phoneRegex = /^[\d\s\+\-()]+$/;
        if (phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10) return true;
        throw new Error('Please provide a valid email or phone number');
      }),
    body('referral_code')
      .optional()
      .trim()
      .isLength({ max: 64 })
      .withMessage('Referral code is too long'),
  ],

  // Validate referral code (public check)
  validateReferralCode: [
    query('code')
      .trim()
      .notEmpty()
      .withMessage('Referral code is required')
      .isLength({ min: 4, max: 64 })
      .withMessage('Referral code must be 4–64 characters')
      .matches(/^[A-Za-z0-9]+$/)
      .withMessage('Referral code must contain only letters and numbers'),
  ],

  // Complete signup (rider: minimal OTP-only - full_name, optional email)
  completeSignup: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 4, max: 6 })
      .withMessage('OTP must be between 4 and 6 digits')
      .isNumeric()
      .withMessage('OTP must be numeric'),
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email format'),
    body('profile_photo').optional().trim(),
  ],

  // Rider onboarding (minimal, OTP-only)
  riderOnboardingComplete: [
    body('full_name')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
    body('email').optional().trim().isEmail().withMessage('Invalid email'),
    body('profile_photo').optional().trim(),
  ],

  // Driver stage 1
  driverStage1: [
    body('full_name')
      .trim()
      .notEmpty()
      .withMessage('Full name is required')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
    body('date_of_birth').trim().notEmpty().withMessage('Date of birth is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
    body('city').trim().notEmpty().withMessage('City is required'),
  ],

  // Driver stage 2
  driverStage2: [
    body('id_type')
      .isIn(['national_id', 'voters_card', 'drivers_license', 'passport'])
      .withMessage('Invalid ID type'),
    body('id_number').trim().notEmpty().withMessage('ID number is required'),
    body('id_image').trim().notEmpty().withMessage('ID image URL is required'),
    body('selfie_image').trim().notEmpty().withMessage('Selfie image URL is required'),
  ],

  // Driver stage 3
  driverStage3: [
    body('vehicle_type').notEmpty().withMessage('Vehicle type is required'),
    body('plate_number').trim().notEmpty().withMessage('Plate number is required'),
    body('vehicle_documents').optional(),
    body('insurance_document').optional().trim(),
  ],

  emailRegister: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .custom((value) => {
        const normalized = normalizePhone(value);
        if (!normalized || !normalized.startsWith('+234') || normalized.length !== 14) {
          throw new Error(
            'Please provide a valid Nigerian phone number (e.g. 08012345678 or +2348012345678)'
          );
        }
        return true;
      }),
    body('role')
      .optional()
      .isIn(['passenger', 'driver'])
      .withMessage('Role must be passenger or driver'),
    body('referral_code')
      .optional()
      .trim()
      .isLength({ min: 4, max: 64 })
      .withMessage('Referral code must be 4–64 characters'),
  ],

  emailLogin: [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  // Login
  login: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required')
      .custom((value) => {
        // Check if it's an email
        const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
        if (emailRegex.test(value)) {
          return true;
        }
        // Check if it's a phone number (basic validation)
        const phoneRegex = /^[\d\s\+\-()]+$/;
        if (phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10) {
          return true;
        }
        throw new Error('Please provide a valid email or phone number');
      }),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  requestLoginOtp: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
  ],

  // OTP-only login
  loginWithOtp: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 4, max: 6 })
      .withMessage('OTP must be between 4 and 6 digits')
      .isNumeric()
      .withMessage('OTP must be numeric'),
  ],

  // OTP verification
  verifyOTP: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 4, max: 6 })
      .withMessage('OTP must be between 4 and 6 digits')
      .isNumeric()
      .withMessage('OTP must be numeric'),
  ],

  // Forgot password init
  forgotPasswordInit: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required')
      .custom((value) => {
        const emailRegex = /^[\w.-]+@[a-zA-Z\d.-]+\.[a-zA-Z]{2,}$/;
        if (emailRegex.test(value)) return true;
        const phoneRegex = /^[\d\s\+\-()]+$/;
        if (phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10) return true;
        throw new Error('Please provide a valid email or phone number');
      }),
  ],

  // Forgot password confirm OTP
  forgotPasswordConfirmOtp: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 4, max: 6 })
      .withMessage('OTP must be between 4 and 6 digits')
      .isNumeric()
      .withMessage('OTP must be numeric'),
  ],

  // Forgot password reset
  forgotPasswordReset: [
    body('reset_token').trim().notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    body('password_confirmation')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Password confirmation does not match password');
        }
        return true;
      }),
  ],

  // Update profile
  updateProfile: [
    body('name')
      .optional()
      .trim()
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('phone')
      .optional()
      .trim()
      .custom((value) => {
        if (!value || value === '') return true; // Allow empty phone
        // Basic phone validation - allows international format
        const phoneRegex = /^[\d\s\+\-()]+$/;
        const digitsOnly = value.replace(/\D/g, '');
        if (phoneRegex.test(value) && digitsOnly.length >= 10) {
          return true;
        }
        throw new Error('Please provide a valid phone number (minimum 10 digits)');
      }),
    body('gender')
      .optional()
      .isIn(['male', 'female', 'other'])
      .withMessage('Gender must be male, female, or other'),
  ],

  // Change password
  changePassword: [
    body('currentPassword')
      .notEmpty()
      .withMessage('Current password is required'),
    body('newPassword')
      .isLength({ min: 6 })
      .withMessage('New password must be at least 6 characters'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.newPassword) {
          throw new Error('Password confirmation does not match');
        }
        return true;
      }),
  ],

  // Request ride
  requestRide: [
    body('pickupLocation.lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid pickup latitude is required'),
    body('pickupLocation.lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid pickup longitude is required'),
    body('pickupLocation.address')
      .trim()
      .notEmpty()
      .withMessage('Pickup address is required'),
    body('dropoffLocation.lat')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid dropoff latitude is required'),
    body('dropoffLocation.lng')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid dropoff longitude is required'),
    body('dropoffLocation.address')
      .trim()
      .notEmpty()
      .withMessage('Dropoff address is required'),
    body('vehicleTypeId')
      .notEmpty()
      .withMessage('Vehicle type is required')
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
    body('paymentMethod')
      .isIn(['cash', 'wallet', 'card', 'bank_transfer'])
      .withMessage('Invalid payment method'),
    // Rider may pre-select a specific driver from the picker. When present we
    // try them exclusively in round 1 before falling back to broadcast.
    body('driverId')
      .optional({ nullable: true })
      .isMongoId()
      .withMessage('Invalid driver ID'),
  ],

  // ID parameter validation
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid ID format'),
  ],
  mongoUserId: [
    param('userId')
      .isMongoId()
      .withMessage('Invalid user ID format'),
  ],

  // Ride ID parameter validation (for routes using :rideId)
  rideIdParam: [
    param('rideId')
      .isMongoId()
      .withMessage('Invalid ride ID format'),
  ],

  // Create driver profile
  createDriver: [
    body('licenseNumber')
      .trim()
      .notEmpty()
      .withMessage('License number is required'),
    body('licenseExpiry')
      .notEmpty()
      .withMessage('License expiry date is required')
      .isISO8601()
      .withMessage('Invalid license expiry date'),
    body('vehicleDetails.make')
      .trim()
      .notEmpty()
      .withMessage('Vehicle make is required'),
    body('vehicleDetails.model')
      .trim()
      .notEmpty()
      .withMessage('Vehicle model is required'),
    body('vehicleDetails.year')
      .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
      .withMessage('Valid vehicle year is required'),
    body('vehicleDetails.plateNumber')
      .trim()
      .notEmpty()
      .withMessage('Plate number is required'),
    body('vehicleDetails.color')
      .trim()
      .notEmpty()
      .withMessage('Vehicle color is required'),
    body('vehicleDetails.vehicleType')
      .notEmpty()
      .withMessage('Vehicle type is required')
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
  ],

  // Update driver profile
  updateDriver: [
    body('licenseNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('License number cannot be empty'),
    body('licenseExpiry')
      .optional()
      .isISO8601()
      .withMessage('Invalid license expiry date'),
    body('vehicleDetails.make')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Vehicle make cannot be empty'),
    body('vehicleDetails.model')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Vehicle model cannot be empty'),
    body('vehicleDetails.year')
      .optional()
      .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
      .withMessage('Valid vehicle year is required'),
    body('vehicleDetails.plateNumber')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Plate number cannot be empty'),
    body('vehicleDetails.color')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Vehicle color cannot be empty'),
    body('vehicleDetails.vehicleType')
      .optional()
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
  ],

  // Update location
  updateLocation: [
    body('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('address')
      .optional()
      .trim(),
    body('heading')
      .optional()
      .isFloat({ min: 0, max: 360 })
      .withMessage('heading must be between 0 and 360'),
  ],

  cancelRidePreviewQuery: [
    query('rideId')
      .notEmpty()
      .isMongoId()
      .withMessage('Valid rideId is required'),
  ],

  // Toggle availability
  toggleAvailability: [
    body('isAvailable')
      .optional()
      .isBoolean()
      .withMessage('isAvailable must be a boolean')
      .toBoolean(),
  ],

  // Accept ride — offerId preferred; rideId accepted as fallback when offer_id is unavailable client-side
  acceptRide: [
    body('offerId')
      .optional({ checkFalsy: true })
      .isMongoId()
      .withMessage('Invalid offerId'),
    body('rideId')
      .optional({ checkFalsy: true })
      .isMongoId()
      .withMessage('Invalid rideId'),
  ],

  ackRideOffer: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Reject ride
  rejectRide: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('reason')
      .optional()
      .trim(),
  ],

  // Start ride
  markArrived: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude'),
  ],

  startRide: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Complete ride
  completeRide: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('paymentStatus')
      .optional()
      .isIn(['pending', 'completed', 'failed'])
      .withMessage('Invalid payment status'),
  ],

  // Confirm payment (driver: rideId)
  confirmDriverPayment: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Change payment method and/or record change amount
  changePaymentMethod: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('paymentMethod')
      .optional()
      .isIn(['cash', 'wallet', 'card', 'bank_transfer'])
      .withMessage('Invalid payment method'),
    body('amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Change amount must be a non-negative number'),
  ],

  // Initialize payment
  initializePayment: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('amount')
      .isFloat({ min: 0 })
      .withMessage('Valid amount is required'),
    body('method')
      .notEmpty()
      .withMessage('Payment method is required')
      .isIn(['cash', 'wallet', 'card', 'stripe', 'bank_transfer'])
      .withMessage('Invalid payment method'),
  ],

  // Initialize wallet top-up (returns payment URL for card)
  initializeWalletTopup: [
    body('amount')
      .isFloat({ min: 1 })
      .withMessage('Valid amount is required (minimum ₦1)'),
    body('type')
      .optional()
      .isIn(['topup'])
      .withMessage('Invalid type'),
  ],

  verifyWalletTopup: [
    body('reference')
      .notEmpty()
      .withMessage('Transaction reference is required')
      .isString()
      .trim(),
  ],

  walletFund: [
    body('amount')
      .isFloat({ min: 100 })
      .withMessage('Valid amount is required (minimum ₦100)'),
  ],

  walletVerify: [
    query('reference')
      .notEmpty()
      .withMessage('Reference is required')
      .isString()
      .trim(),
  ],

  // Pay for ride with wallet
  payForRide: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Top-up wallet
  topUpWallet: [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Valid amount is required (minimum 0.01)'),
    body('method')
      .notEmpty()
      .withMessage('Payment method is required')
      .isIn(['card', 'stripe', 'bank_transfer'])
      .withMessage('Invalid payment method'),
    body('paymentIntentId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Payment intent ID is required for card payments'),
  ],

  // Withdraw balance
  withdrawBalance: [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Valid amount is required (minimum 0.01)'),
    body('bankAccountId')
      .optional()
      .trim(),
  ],

  setupTransactionPin: [
    body('transaction_pin')
      .trim()
      .notEmpty()
      .withMessage('Transaction PIN is required')
      .isLength({ min: 4, max: 4 })
      .withMessage('PIN must be 4 digits')
      .isNumeric()
      .withMessage('PIN must be numeric'),
  ],

  requestPayout: [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Valid amount is required (minimum 0.01)'),
    body('transaction_pin')
      .optional()
      .isLength({ min: 4, max: 4 })
      .isNumeric()
      .withMessage('Transaction PIN must be 4 digits'),
    body('transactionPin')
      .optional()
      .isLength({ min: 4, max: 4 })
      .isNumeric()
      .withMessage('Transaction PIN must be 4 digits'),
  ],

  // Confirm payment (Stripe: paymentIntentId)
  confirmStripePayment: [
    body('paymentIntentId')
      .notEmpty()
      .withMessage('Payment intent ID is required')
      .trim(),
  ],

  // Create bank account
  createBankAccount: [
    body('accountName').optional().trim(),
    body('accountNumber').trim().notEmpty().withMessage('Account number is required'),
    body('bankName').trim().notEmpty().withMessage('Bank name is required'),
    body('bankCode').optional().trim(),
  ],

  resolveBankAccount: [
    body('accountNumber')
      .customSanitizer((v) => (v == null ? '' : String(v)))
      .trim()
      .notEmpty()
      .withMessage('Account number is required')
      .custom((value) => /^\d{10}$/.test(String(value).replace(/\D/g, '')))
      .withMessage('Account number must be 10 digits'),
    body('bankCode')
      .customSanitizer((v) => (v == null ? '' : String(v)))
      .trim()
      .notEmpty()
      .withMessage('Bank code is required')
      .matches(/^\d{2,12}$/)
      .withMessage('Invalid bank code'),
  ],

  /** Same rules as resolveBankAccount for GET ?accountNumber=&bankCode= (proxies that block POST body) */
  resolveBankAccountQuery: [
    query('accountNumber')
      .customSanitizer((v) => (v == null ? '' : String(v)))
      .trim()
      .notEmpty()
      .withMessage('Account number is required')
      .custom((value) => /^\d{10}$/.test(String(value).replace(/\D/g, '')))
      .withMessage('Account number must be 10 digits'),
    query('bankCode')
      .customSanitizer((v) => (v == null ? '' : String(v)))
      .trim()
      .notEmpty()
      .withMessage('Bank code is required')
      .matches(/^\d{2,12}$/)
      .withMessage('Invalid bank code'),
  ],
  switchRole: [
    body('role')
      .notEmpty()
      .withMessage('Role is required')
      .isIn(['passenger', 'driver'])
      .withMessage('Role must be passenger or driver'),
  ],

  // Delete account
  deleteAccount: [
    body('password')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Password is required for account deletion'),
    body('reason')
      .optional()
      .trim(),
  ],

  // Create emergency contact
  createEmergencyContact: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required'),
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone is required')
      .isMobilePhone()
      .withMessage('Valid phone number is required'),
    body('relationship')
      .optional()
      .trim(),
  ],

  // Update emergency contact
  updateEmergencyContact: [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Name cannot be empty'),
    body('phone')
      .optional()
      .trim()
      .isMobilePhone()
      .withMessage('Valid phone number is required'),
    body('relationship')
      .optional()
      .trim(),
  ],

  // Send emergency message
  sendEmergencyMessage: [
    body('message')
      .optional()
      .trim(),
    body('rideId')
      .optional()
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Save recent place
  saveRecentPlace: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required'),
    body('address')
      .trim()
      .notEmpty()
      .withMessage('Address is required'),
    body('latitude')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    body('longitude')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    body('isDefault')
      .optional()
      .isBoolean()
      .withMessage('isDefault must be a boolean'),
  ],

  // Validate promocode
  validatePromocode: [
    body('code')
      .trim()
      .notEmpty()
      .withMessage('Promo code is required'),
    body('rideAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Valid ride amount is required'),
    body('vehicleTypeId')
      .optional()
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
  ],

  // Rebook ride
  rebookRide: [
    body('previousRideId')
      .notEmpty()
      .withMessage('Previous ride ID is required')
      .isMongoId()
      .withMessage('Invalid previous ride ID'),
    body('pickupLocation')
      .optional()
      .isObject()
      .withMessage('Pickup location must be an object'),
    body('dropoffLocation')
      .optional()
      .isObject()
      .withMessage('Dropoff location must be an object'),
    body('vehicleTypeId')
      .optional()
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
    body('paymentMethod')
      .optional()
      .isIn(['cash', 'wallet', 'card', 'bank_transfer'])
      .withMessage('Invalid payment method'),
    body('promoCode')
      .optional()
      .trim(),
  ],

  // Create review
  createReview: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('rating')
      .notEmpty()
      .withMessage('Rating is required')
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be between 1 and 5'),
    body('review')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Review cannot exceed 1000 characters'),
    body('tags')
      .optional()
      .isArray()
      .withMessage('Tags must be an array'),
  ],

  // Accept scheduled booking
  acceptScheduledBooking: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Send message
  sendMessage: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 1, max: 1000 })
      .withMessage('Message must be between 1 and 1000 characters'),
    body('messageType')
      .optional()
      .isIn(['text', 'image', 'location', 'system'])
      .withMessage('Invalid message type'),
    body('attachments')
      .optional()
      .isArray()
      .withMessage('Attachments must be an array'),
  ],

  // Assign new driver
  assignNewDriver: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('reason')
      .optional()
      .trim(),
  ],

  // Resend OTP
  resendOTP: [
    body('email_phone_number')
      .trim()
      .notEmpty()
      .withMessage('Email or phone number is required'),
  ],

  // Google OAuth
  googleAuth: [
    body('id_token')
      .notEmpty()
      .withMessage('Google ID token is required'),
    body('device_id')
      .optional()
      .trim(),
    body('device_token')
      .optional()
      .trim(),
  ],

  // Pusher authentication - simplified to avoid conflicts
  pusherAuth: [
    body('socket_id').exists().withMessage('Socket ID is required'),
    body('channel_name').exists().withMessage('Channel name is required'),
  ],

  // Admin login
  adminLogin: [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
  ],

  // Update user (admin)
  updateUser: [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Name cannot be empty'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Please provide a valid email'),
    body('phone')
      .optional()
      .trim()
      .isMobilePhone()
      .withMessage('Please provide a valid phone number'),
    body('role')
      .optional()
      .isIn(['passenger', 'driver', 'admin'])
      .withMessage('Invalid role'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('isVerified')
      .optional()
      .isBoolean()
      .withMessage('isVerified must be a boolean'),
    body('balance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Balance must be a non-negative number'),
  ],

  // Reject driver
  rejectDriver: [
    body('reason')
      .trim()
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ min: 10, max: 500 })
      .withMessage('Reason must be between 10 and 500 characters'),
  ],

  // Update ride (admin)
  updateRide: [
    body('status')
      .optional()
      .isIn(['requested', 'accepted', 'in-progress', 'completed', 'cancelled'])
      .withMessage('Invalid status'),
    body('fare')
      .optional()
      .isObject()
      .withMessage('Fare must be an object'),
    body('fare.totalFare')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Total fare must be a non-negative number'),
    body('reason')
      .optional()
      .trim(),
  ],

  // Assign driver to ride (admin)
  assignRideDriver: [
    body('driverId')
      .notEmpty()
      .withMessage('Driver is required')
      .isMongoId()
      .withMessage('Invalid driver ID'),
  ],

  // Handle dispute
  handleDispute: [
    body('resolution')
      .notEmpty()
      .withMessage('Resolution is required')
      .isIn(['refund', 'partial_refund', 'refund_to_wallet', 'no_action'])
      .withMessage('Invalid resolution type'),
    body('refundAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Refund amount must be a non-negative number'),
    body('reason')
      .optional()
      .trim(),
  ],

  // Process refund
  processRefund: [
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Valid refund amount is required (minimum 0.01)'),
    body('reason')
      .optional()
      .trim(),
    body('method')
      .optional()
      .isIn(['wallet', 'original', 'manual'])
      .withMessage('Invalid refund method'),
  ],

  // Create support ticket (user-facing)
  createSupportTicket: [
    body('subject')
      .trim()
      .notEmpty()
      .withMessage('Subject is required')
      .isLength({ max: 200 })
      .withMessage('Subject cannot exceed 200 characters'),
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Message must be between 10 and 2000 characters'),
    body('rideId')
      .optional()
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('category')
      .optional()
      .trim()
      .isIn([
        'ride_issue',
        'payment_issue',
        'account_issue',
        'driver_complaint',
        'rider_complaint',
        'technical_issue',
        'general',
        'refund_request',
        'other',
      ])
      .withMessage('Invalid category'),
  ],

  // Assign ticket
  assignTicket: [
    body('adminId')
      .optional()
      .isMongoId()
      .withMessage('Invalid admin ID'),
  ],

  // Resolve ticket
  resolveTicket: [
    body('resolutionNote')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Resolution note cannot exceed 1000 characters'),
  ],

  // Respond to ticket
  respondToTicket: [
    body('message')
      .trim()
      .notEmpty()
      .withMessage('Message is required')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Message must be between 10 and 2000 characters'),
    body('attachments')
      .optional()
      .isArray()
      .withMessage('Attachments must be an array'),
  ],

  // Create promocode
  createPromocode: [
    body('code')
      .trim()
      .notEmpty()
      .withMessage('Promo code is required')
      .matches(/^[A-Z0-9]+$/)
      .withMessage('Promo code must contain only uppercase letters and numbers')
      .isLength({ min: 4, max: 20 })
      .withMessage('Promo code must be between 4 and 20 characters'),
    body('description')
      .optional()
      .trim(),
    body('discountType')
      .notEmpty()
      .withMessage('Discount type is required')
      .isIn(['percentage', 'fixed'])
      .withMessage('Discount type must be percentage or fixed'),
    body('discountValue')
      .isFloat({ min: 0 })
      .withMessage('Valid discount value is required'),
    body('maxDiscount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max discount must be a non-negative number'),
    body('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min amount must be a non-negative number'),
    body('maxUses')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max uses must be a positive integer'),
    body('maxUsesPerUser')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max uses per user must be a positive integer'),
    body('validFrom')
      .notEmpty()
      .withMessage('Valid from date is required')
      .isISO8601()
      .withMessage('Invalid valid from date'),
    body('validTo')
      .notEmpty()
      .withMessage('Valid to date is required')
      .isISO8601()
      .withMessage('Invalid valid to date'),
    body('applicableUserTypes')
      .optional()
      .isArray()
      .withMessage('Applicable user types must be an array'),
    body('applicableVehicleTypes')
      .optional()
      .isArray()
      .withMessage('Applicable vehicle types must be an array'),
  ],

  // Audit logs query
  auditLogsQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    query('action')
      .optional()
      .isIn([
        'user_activate', 'user_deactivate', 'user_delete',
        'driver_approve', 'driver_reject', 'refund', 'dispute_resolve',
        'withdrawal_approve', 'withdrawal_reject',
        'driver_kyc_approve', 'driver_kyc_reject', 'driver_vehicle_approve', 'driver_vehicle_reject',
        'payout_approve', 'payout_reject',
        'vehicle_type_delete', 'settings_update',
        'promocode_create', 'promocode_update',
      ])
      .withMessage('Invalid action filter'),
    query('resourceType')
      .optional()
      .isIn(['user', 'driver', 'payment', 'ride', 'withdrawal', 'payout_request', 'driver_kyc', 'driver_vehicle', 'vehicle_type', 'promocode', 'settings'])
      .withMessage('Invalid resource type filter'),
    query('adminId')
      .optional()
      .isMongoId()
      .withMessage('Invalid admin ID'),
  ],

  updatePaymentMethods: [
    body('paymentMethods')
      .notEmpty()
      .withMessage('paymentMethods is required')
      .isObject()
      .withMessage('paymentMethods must be an object'),
    body('paymentMethods.wallet.enabled')
      .optional()
      .isBoolean()
      .withMessage('wallet.enabled must be a boolean'),
    body('paymentMethods.wallet.default')
      .optional()
      .isBoolean()
      .withMessage('wallet.default must be a boolean'),
    body('paymentMethods.cash.enabled')
      .optional()
      .isBoolean()
      .withMessage('cash.enabled must be a boolean'),
    body('paymentMethods.cash.default')
      .optional()
      .isBoolean()
      .withMessage('cash.default must be a boolean'),
    body('paymentMethods.card.enabled')
      .optional()
      .isBoolean()
      .withMessage('card.enabled must be a boolean'),
    body('paymentMethods.card.default')
      .optional()
      .isBoolean()
      .withMessage('card.default must be a boolean'),
    body('paymentMethods.transfer.enabled')
      .optional()
      .isBoolean()
      .withMessage('transfer.enabled must be a boolean'),
    body('paymentMethods.transfer.default')
      .optional()
      .isBoolean()
      .withMessage('transfer.default must be a boolean'),
  ],

  // Update admin settings
  updateSettings: [
    body('alerts')
      .optional()
      .isObject()
      .withMessage('Alerts must be an object'),
    body('alerts.rideWaitingThresholdMinutes')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Ride waiting threshold must be a non-negative integer'),
    body('alerts.emailOnRideWaiting')
      .optional()
      .isBoolean()
      .withMessage('Must be a boolean'),
    body('alerts.emailOnNewDriverSignup')
      .optional()
      .isBoolean()
      .withMessage('Must be a boolean'),
    body('alerts.emailOnNewTicket')
      .optional()
      .isBoolean()
      .withMessage('Must be a boolean'),
    body('alerts.smsOnRideWaiting')
      .optional()
      .isBoolean()
      .withMessage('Must be a boolean'),
    body('referral')
      .optional()
      .isObject()
      .withMessage('Referral must be an object'),
    body('referral.enabled')
      .optional()
      .isBoolean()
      .withMessage('Must be a boolean'),
    body('referral.rewardType')
      .optional()
      .isIn(['cash', 'free_ride'])
      .withMessage('Reward type must be cash or free_ride'),
    body('referral.successfulInvitesRequired')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Must be at least 1'),
    body('referral.cashAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('referral.freeRideAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('topup')
      .optional()
      .isObject()
      .withMessage('Topup must be an object'),
    body('topup.bankName')
      .optional()
      .trim(),
    body('topup.accountName')
      .optional()
      .trim(),
    body('topup.accountNumber')
      .optional()
      .trim(),
    body('driverTasks')
      .optional()
      .isObject()
      .withMessage('Driver tasks must be an object'),
    body('driverTasks.first_ride_today')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.rides_3_today')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.rides_5_today')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.rides_10_today')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.early_bird')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.night_owl')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
    body('driverTasks.weekend_warrior')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Must be non-negative'),
  ],

  // Create vehicle type (admin)
  createVehicleType: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ max: 64 })
      .withMessage('Name is too long'),
    body('displayName')
      .trim()
      .notEmpty()
      .withMessage('Display name is required')
      .isLength({ max: 128 })
      .withMessage('Display name is too long'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Description is too long'),
    body('baseFare')
      .isFloat({ min: 0 })
      .withMessage('Base fare must be a non-negative number'),
    body('perKmRate')
      .isFloat({ min: 0 })
      .withMessage('Per km rate must be a non-negative number'),
    body('perMinuteRate')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Per minute rate must be a non-negative number'),
    body('capacity')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Capacity must be between 1 and 20'),
    body('order')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Order must be a non-negative integer'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
  ],

  // Cancel ride (body)
  cancelRide: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason is too long'),
  ],

  // Cancel scheduled booking
  cancelScheduledBooking: [
    body('booking_id')
      .optional()
      .isMongoId()
      .withMessage('Invalid booking ID'),
    body('rideId')
      .optional()
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('reason')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Reason is too long'),
    body()
      .custom((_, { req }) => {
        if (!req.body.booking_id && !req.body.rideId) {
          throw new Error('Booking ID or ride ID is required');
        }
        return true;
      }),
  ],

  // Fare estimate query
  fareEstimateQuery: [
    query('pickupLocation')
      .notEmpty()
      .withMessage('Pickup location is required')
      .custom((val) => {
        try {
          const parsed = JSON.parse(val);
          if (!parsed || typeof parsed !== 'object') throw new Error('Invalid pickup location');
          if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') throw new Error('Pickup must have lat and lng numbers');
          if (parsed.lat < -90 || parsed.lat > 90 || parsed.lng < -180 || parsed.lng > 180) throw new Error('Invalid coordinates');
          return true;
        } catch (e) {
          throw new Error('Pickup location must be valid JSON with lat/lng');
        }
      }),
    query('dropoffLocation')
      .notEmpty()
      .withMessage('Dropoff location is required')
      .custom((val) => {
        try {
          const parsed = JSON.parse(val);
          if (!parsed || typeof parsed !== 'object') throw new Error('Invalid dropoff location');
          if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number') throw new Error('Dropoff must have lat and lng numbers');
          if (parsed.lat < -90 || parsed.lat > 90 || parsed.lng < -180 || parsed.lng > 180) throw new Error('Invalid coordinates');
          return true;
        } catch (e) {
          throw new Error('Dropoff location must be valid JSON with lat/lng');
        }
      }),
    query('vehicleTypeId')
      .notEmpty()
      .withMessage('Vehicle type is required')
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
  ],

  // Find nearby drivers query
  findNearbyDriversQuery: [
    query('loc_lat')
      .notEmpty()
      .withMessage('Latitude is required')
      .isFloat({ min: -90, max: 90 })
      .withMessage('Valid latitude is required'),
    query('loc_long')
      .notEmpty()
      .withMessage('Longitude is required')
      .isFloat({ min: -180, max: 180 })
      .withMessage('Valid longitude is required'),
    query('vehicleTypeId')
      .optional()
      .isMongoId()
      .withMessage('Invalid vehicle type ID'),
  ],

  // Maps: places autocomplete
  placesAutocompleteQuery: [
    query('input')
      .trim()
      .notEmpty()
      .withMessage('Input query is required')
      .isLength({ max: 256 })
      .withMessage('Input is too long'),
  ],

  // Maps: Place search (q required; lat/lng optional for proximity ranking)
  placeSearchQuery: [
    query('q')
      .trim()
      .notEmpty()
      .withMessage('Search query (q) is required')
      .isLength({ max: 256 })
      .withMessage('Query is too long'),
    query('lat')
      .optional()
      .isFloat()
      .withMessage('lat must be a number'),
    query('lng')
      .optional()
      .isFloat()
      .withMessage('lng must be a number'),
  ],

  // Maps: place details
  placeDetailsQuery: [
    query('place_id')
      .trim()
      .notEmpty()
      .withMessage('Place ID is required')
      .isLength({ max: 256 })
      .withMessage('Place ID is too long'),
  ],

  // Maps: places nearby (for map POI markers)
  placesNearbyQuery: [
    query('lat').notEmpty().withMessage('lat is required').toFloat().withMessage('lat must be a number'),
    query('lng').notEmpty().withMessage('lng is required').toFloat().withMessage('lng must be a number'),
    query('radius')
      .optional()
      .isInt({ min: 500, max: 5000 })
      .withMessage('radius must be between 500 and 5000 meters')
      .toInt(),
  ],

  // Maps: pickup label resolver (for current location display)
  pickupLabelQuery: [
    query('lat').notEmpty().withMessage('lat is required').toFloat().withMessage('lat must be a number'),
    query('lng').notEmpty().withMessage('lng is required').toFloat().withMessage('lng must be a number'),
  ],

  // Drivers: nearby driver count
  nearbyDriverCountQuery: [
    query('lat').notEmpty().withMessage('lat is required').toFloat().withMessage('lat must be a number'),
    query('lng').notEmpty().withMessage('lng is required').toFloat().withMessage('lng must be a number'),
    query('radiusKm')
      .optional()
      .isFloat({ min: 0.5, max: 30 })
      .withMessage('radiusKm must be between 0.5 and 30')
      .toFloat(),
  ],

  // Rides: fare estimate preview (booking sheet)
  fareEstimatePreviewQuery: [
    query('originLat').notEmpty().withMessage('originLat is required').toFloat().withMessage('originLat must be a number'),
    query('originLng').notEmpty().withMessage('originLng is required').toFloat().withMessage('originLng must be a number'),
    query('destLat').notEmpty().withMessage('destLat is required').toFloat().withMessage('destLat must be a number'),
    query('destLng').notEmpty().withMessage('destLng is required').toFloat().withMessage('destLng must be a number'),
  ],

  // Ride history query
  rideHistoryQuery: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage('Limit must be between 1 and 500')
      .toInt(),
    query('status')
      .optional()
      .isIn(['requested', 'accepted', 'in-progress', 'completed', 'cancelled'])
      .withMessage('Invalid status filter'),
  ],

  // Update promocode
  updatePromocode: [
    body('description')
      .optional()
      .trim(),
    body('discountValue')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Valid discount value is required'),
    body('maxDiscount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max discount must be a non-negative number'),
    body('minAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min amount must be a non-negative number'),
    body('maxUses')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max uses must be a positive integer'),
    body('maxUsesPerUser')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Max uses per user must be a positive integer'),
    body('validFrom')
      .optional()
      .isISO8601()
      .withMessage('Invalid valid from date'),
    body('validTo')
      .optional()
      .isISO8601()
      .withMessage('Invalid valid to date'),
    body('isActive')
      .optional()
      .isBoolean()
      .withMessage('isActive must be a boolean'),
    body('applicableUserTypes')
      .optional()
      .isArray()
      .withMessage('Applicable user types must be an array'),
    body('applicableVehicleTypes')
      .optional()
      .isArray()
      .withMessage('Applicable vehicle types must be an array'),
  ],
};
