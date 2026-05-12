/**
 * Onboarding & KYC Controller
 * Progressive onboarding: rider (minimal), driver (4 stages)
 */
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import DriverKyc from '../models/DriverKyc.js';
import DriverVehicle from '../models/DriverVehicle.js';
import VehicleType from '../models/VehicleType.js';
import AdminSettings from '../models/AdminSettings.js';
import { setupTransactionPin } from '../services/driverSecurityService.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * RIDER: Complete onboarding (low friction)
 * POST /onboarding/rider/complete
 * Body: full_name (required), email (optional), profile_photo (optional)
 * Requires: OTP-verified user, role passenger
 */
export const completeRiderOnboarding = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { full_name, email, profile_photo } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  if (user.role !== 'passenger') {
    throw new ValidationError('Rider onboarding only for passengers');
  }

  if (user.onboardingStage === 'rider_complete') {
    throw new ConflictError('Rider onboarding already complete');
  }

  user.name = full_name?.trim();
  if (email) user.email = String(email).toLowerCase().trim();
  if (profile_photo) user.profileImage = profile_photo;
  user.onboardingStage = 'rider_complete';
  user.isRegCompleted = true;
  user.isRegVerified = true;

  if (!user.walletAccountNumber) {
    user.walletAccountNumber = 'KEKE' + user._id.toString().slice(-8).toUpperCase();
  }

  await user.save();

  logger.info(`Rider onboarding complete: ${userId}`);

  res.json({
    status: 'success',
    message: 'Rider onboarding complete. You can book rides.',
    data: {
      user: formatUserForOnboarding(user),
    },
  });
});

/**
 * DRIVER Stage 1: Basic info
 * POST /onboarding/driver/stage1
 * Body: full_name, date_of_birth, state, city
 */
export const driverStage1 = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { full_name, date_of_birth, state, city } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  if (user.role !== 'driver') {
    user.role = 'driver';
  }

  user.name = full_name?.trim();
  user.dateOfBirth = date_of_birth ? new Date(date_of_birth) : null;
  user.state = state?.trim() || null;
  user.city = city?.trim() || null;
  user.onboardingStage = 'driver_stage1';
  user.kycStatus = 'pending';

  await user.save();

  res.json({
    status: 'success',
    message: 'Stage 1 complete',
    data: {
      onboarding_stage: user.onboardingStage,
      next_stage: 'driver_stage2',
    },
  });
});

/**
 * DRIVER Stage 2: Identity verification
 * POST /onboarding/driver/stage2
 * Body: id_type, id_number, id_image, selfie_image (URLs after upload)
 */
export const driverStage2 = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { id_type, id_number, id_image, selfie_image } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  if (!['driver_stage1', 'driver_stage2'].includes(user.onboardingStage)) {
    throw new ValidationError('Complete stage 1 first');
  }

  let kyc = await DriverKyc.findOne({ userId });
  if (kyc) {
    kyc.idType = id_type;
    kyc.idNumber = id_number?.trim();
    kyc.idImageUrl = id_image;
    kyc.selfieUrl = selfie_image;
    kyc.verificationStatus = 'pending';
    await kyc.save();
  } else {
    kyc = await DriverKyc.create({
      userId,
      idType: id_type,
      idNumber: id_number?.trim(),
      idImageUrl: id_image,
      selfieUrl: selfie_image,
    });
  }

  user.onboardingStage = 'driver_stage2';
  await user.save();

  res.json({
    status: 'success',
    message: 'Stage 2 complete. Identity documents submitted for verification.',
    data: {
      onboarding_stage: user.onboardingStage,
      next_stage: 'driver_stage3',
    },
  });
});

/**
 * DRIVER Stage 3: Vehicle verification
 * POST /onboarding/driver/stage3
 * Body: vehicle_type, plate_number, vehicle_documents[], insurance_document
 */
export const driverStage3 = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { vehicle_type, plate_number, vehicle_documents, insurance_document, make, model, year, color } = req.body;

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  if (!['driver_stage2', 'driver_stage3'].includes(user.onboardingStage)) {
    throw new ValidationError('Complete stage 2 first');
  }

  const vehicleType = await VehicleType.findById(vehicle_type);
  if (!vehicleType || !vehicleType.isActive) {
    throw new NotFoundError('Vehicle type');
  }

  const docArray = Array.isArray(vehicle_documents)
    ? vehicle_documents.map((d) => (typeof d === 'string' ? { type: 'registration', url: d } : d))
    : vehicle_documents
      ? [{ type: 'registration', url: vehicle_documents }]
      : [];

  let vehicle = await DriverVehicle.findOne({ userId });
  if (vehicle) {
    vehicle.vehicleType = vehicle_type;
    vehicle.plateNumber = String(plate_number).toUpperCase().trim();
    vehicle.vehicleDocuments = docArray;
    vehicle.insuranceDocumentUrl = insurance_document || null;
    if (make) vehicle.make = make;
    if (model) vehicle.model = model;
    if (year) vehicle.year = year;
    if (color) vehicle.color = color;
    vehicle.verificationStatus = 'pending';
    await vehicle.save();
  } else {
    vehicle = await DriverVehicle.create({
      userId,
      vehicleType: vehicle_type,
      plateNumber: String(plate_number).toUpperCase().trim(),
      vehicleDocuments: docArray,
      insuranceDocumentUrl: insurance_document || null,
      make: make || null,
      model: model || null,
      year: year || null,
      color: color || null,
    });
  }

  user.onboardingStage = 'driver_stage3';
  await user.save();

  res.json({
    status: 'success',
    message: 'Stage 3 complete. Vehicle documents submitted for verification.',
    data: {
      onboarding_stage: user.onboardingStage,
      next_stage: 'driver_stage4',
    },
  });
});

/**
 * DRIVER Stage 4: Financial activation
 * - Create/ensure wallet
 * - Trigger DVA async (best-effort)
 * - Require transaction PIN setup
 * POST /onboarding/driver/stage4
 * Body: transaction_pin (4 digits, required)
 */
export const driverStage4 = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { transaction_pin } = req.body;

  if (!transaction_pin || String(transaction_pin).length !== 4) {
    throw new ValidationError('Transaction PIN (4 digits) is required');
  }

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError('User');

  if (!['driver_stage3', 'driver_stage4'].includes(user.onboardingStage)) {
    throw new ValidationError('Complete stage 3 first');
  }

  const driverKyc = await DriverKyc.findOne({ userId });
  const driverVehicle = await DriverVehicle.findOne({ userId }).populate('vehicleType');

  if (!driverKyc) throw new ValidationError('Complete Stage 2 (identity) first');
  if (!driverVehicle) throw new ValidationError('Complete Stage 3 (vehicle) first');

  let driver = await Driver.findOne({ user: userId });
  if (!driver) {
    driver = await Driver.create({
      user: userId,
      licenseNumber: driverKyc.idType === 'drivers_license' ? driverKyc.idNumber : `KYC-${userId}`,
      licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      vehicleDetails: {
        make: driverVehicle.make || 'N/A',
        model: driverVehicle.model || 'N/A',
        year: driverVehicle.year || new Date().getFullYear(),
        plateNumber: driverVehicle.plateNumber,
        color: driverVehicle.color || 'N/A',
        vehicleType: driverVehicle.vehicleType._id,
      },
      documentsVerified: driverKyc.verificationStatus === 'verified' && driverVehicle.verificationStatus === 'verified',
      verificationStatus: driverKyc.verificationStatus === 'verified' && driverVehicle.verificationStatus === 'verified' ? 'approved' : 'pending',
    });
  }

  // Wallet and DVA for drivers are provisioned only when admin approves
  // (see adminController.verifyDriver / updateUser). Creating the wallet here
  // produced ghost DriverWallet documents for applicants who were later
  // rejected, so wallet provisioning is now gated on approval.

  await setupTransactionPin(userId, transaction_pin);

  if (!user.walletAccountNumber) {
    user.walletAccountNumber = 'KEKE' + user._id.toString().slice(-8).toUpperCase();
  }

  user.onboardingStage = 'driver_complete';
  user.kycStatus = driverKyc.verificationStatus === 'verified' && driverVehicle.verificationStatus === 'verified' ? 'verified' : 'pending';
  await user.save();

  res.json({
    status: 'success',
    message: 'Stage 4 complete. You can now accept rides.',
    data: {
      onboarding_stage: user.onboardingStage,
      kyc_status: user.kycStatus,
    },
  });
});

/**
 * Get onboarding status
 * GET /onboarding/status
 */
export const getOnboardingStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select('role onboardingStage kycStatus name email profileImage')
    .lean();

  if (!user) throw new NotFoundError('User');

  let driverKyc = null;
  let driverVehicle = null;
  if (user.role === 'driver') {
    driverKyc = await DriverKyc.findOne({ userId: user._id }).lean();
    driverVehicle = await DriverVehicle.findOne({ userId: user._id }).populate('vehicleType').lean();
  }

  res.json({
    status: 'success',
    data: {
      role: user.role,
      onboarding_stage: user.onboardingStage,
      kyc_status: user.kycStatus,
      profile: {
        name: user.name,
        email: user.email,
        profile_image: user.profileImage,
      },
      driver_kyc: driverKyc
        ? {
            id_type: driverKyc.idType,
            verification_status: driverKyc.verificationStatus,
          }
        : null,
      driver_vehicle: driverVehicle
        ? {
            plate_number: driverVehicle.plateNumber,
            verification_status: driverVehicle.verificationStatus,
          }
        : null,
    },
  });
});

function formatUserForOnboarding(user) {
  return {
    user_id: user._id.toString(),
    name: user.name,
    email: user.email,
    profile_image: user.profileImage,
    onboarding_stage: user.onboardingStage,
    role: user.role,
  };
}
