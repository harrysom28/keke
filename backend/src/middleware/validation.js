import { validationResult, body, param, query } from 'express-validator';
import { ValidationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';

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

  // Complete signup
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
      .withMessage('Name is required')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name must contain only letters, spaces, hyphens, and apostrophes'),
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
    body('country').trim().notEmpty().withMessage('Country is required'),
    body('state').trim().notEmpty().withMessage('State is required'),
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
  ],

  // ID parameter validation
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid ID format'),
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
  ],

  // Toggle availability
  toggleAvailability: [
    body('isAvailable')
      .optional()
      .isBoolean()
      .withMessage('isAvailable must be a boolean')
      .toBoolean(),
  ],

  // Accept ride
  acceptRide: [
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

  // Confirm payment
  confirmPayment: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
  ],

  // Change payment method
  changePaymentMethod: [
    body('rideId')
      .notEmpty()
      .withMessage('Ride ID is required')
      .isMongoId()
      .withMessage('Invalid ride ID'),
    body('paymentMethod')
      .notEmpty()
      .withMessage('Payment method is required')
      .isIn(['cash', 'wallet', 'card', 'bank_transfer'])
      .withMessage('Invalid payment method'),
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

  // Confirm payment
  confirmPayment: [
    body('paymentIntentId')
      .notEmpty()
      .withMessage('Payment intent ID is required')
      .trim(),
  ],

  // Create bank account
  createBankAccount: [
    body('accountName')
      .trim()
      .notEmpty()
      .withMessage('Account name is required'),
    body('accountNumber')
      .trim()
      .notEmpty()
      .withMessage('Account number is required'),
    body('bankName')
      .trim()
      .notEmpty()
      .withMessage('Bank name is required'),
    body('bankCode')
      .optional()
      .trim(),
  ],

  // Switch role
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
