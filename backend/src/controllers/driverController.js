import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { writeFile } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import Driver from '../models/Driver.js';
import DriverWallet from '../models/DriverWallet.js';
import Transaction from '../models/Transaction.js';
import DriverKyc from '../models/DriverKyc.js';
import DriverVehicle from '../models/DriverVehicle.js';
import User from '../models/User.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import VehicleType from '../models/VehicleType.js';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { calculateDistance } from '../utils/geolocation.js';
import { learnFromRide } from '../services/placeIntelligence.js';
import { getFileUrl, uploadToCloudinary } from '../services/fileUploadService.js';
import { cache } from '../config/redis.js';
import { logRideLifecycle, mapRideStatusForClientApi } from '../utils/rideStatus.js';
import rideMatchingService from '../services/rideMatchingService.js';
import { ensureWalletDayStats, getOrCreateWallet } from '../services/walletService.js';
import { formatOnlineDurationMs } from '../utils/driverOnlineTime.js';
import {
  offerRideToDrivers,
  notifyNoDriverFound,
  cancelUnacceptedRide,
} from '../services/driverNotificationService.js';

/**
 * Map multipart field name from mobile / driver create to upload category.
 */
function categorizeDriverCreateUploadField(fieldname) {
  if (!fieldname || typeof fieldname !== 'string') return null;
  const f = fieldname.toLowerCase();

  if (['selfie', 'selfieimage', 'selfie_image', 'image_name'].includes(f)) return 'selfie';

  const idExact = new Set([
    'licenceimage',
    'licence_image',
    'licence_image_name',
    'idimage',
    'id_image',
    'id_card_image_name',
    'driverlicence',
    'driver_licence',
    'driverlicense',
    'driver_license',
  ]);
  if (idExact.has(f)) return 'id_image';
  if (f.includes('licence') && f.includes('image')) return 'id_image';
  if (f.includes('license') && f.includes('image') && !f.includes('vehicle')) return 'id_image';
  if (f.includes('id_card')) return 'id_image';

  const vehicleImg = new Set(['vehicleimage', 'vehicle_image', 'vehiclephoto', 'vehicle_image_name']);
  if (vehicleImg.has(f)) return 'vehicle_image';
  if (f.includes('vehicle') && f.includes('image') && !f.includes('document')) return 'vehicle_image';

  if (['insurancedocument', 'insurance_document', 'insurance'].includes(f) || f.includes('insurance')) {
    return 'insurance';
  }

  if (['vehicledocument', 'vehicle_document', 'registration'].includes(f)) return 'vehicle_document';

  return null;
}

function mapVehicleDocumentType(fieldname) {
  const f = (fieldname || '').toLowerCase();
  if (f === 'registration') return 'registration';
  if (f.includes('road')) return 'roadworthiness';
  return 'other';
}

/**
 * Resolve public URL for a file from driver /create (multer memory or disk).
 */
async function persistDriverCreateFileAndGetUrl(file) {
  const provider = process.env.UPLOAD_PROVIDER || 'local';

  if (provider === 'cloudinary' && file.buffer) {
    const result = await uploadToCloudinary(file.buffer, 'driver-documents', {
      resource_type: file.mimetype === 'application/pdf' ? 'raw' : 'auto',
    });
    return result.url;
  }

  if (file.path) {
    return getFileUrl(file);
  }

  if (file.buffer) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const uploadsDir = path.join(__dirname, '../../uploads');
    const sub = file.fieldname || 'general';
    const destDir = path.join(uploadsDir, sub);
    if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
    const ext = path.extname(file.originalname || '') || '.bin';
    const uniqueName = `${uuidv4()}${ext}`;
    const fullPath = path.join(destDir, uniqueName);
    await writeFile(fullPath, file.buffer);
    return getFileUrl({ path: fullPath });
  }

  return getFileUrl(file);
}

/**
 * Create driver profile - POST /api/driver/create
 */
export const createDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    licenseNumber,
    licenseExpiry,
    vehicleDetails,
    bankAccount,
    insurance,
  } = req.body;

  // Check if user already has a driver profile
  const existingDriver = await Driver.findOne({ user: userId });
  if (existingDriver) {
    if (existingDriver.verificationStatus === 'approved' || existingDriver.documentsVerified) {
      throw new ConflictError('Driver profile already exists');
    }
    await Driver.deleteOne({ _id: existingDriver._id });
  }

  // Check if user role is driver
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Validate vehicle type
  if (vehicleDetails?.vehicleType) {
    const vehicleType = await VehicleType.findById(vehicleDetails.vehicleType);
    if (!vehicleType || !vehicleType.isActive) {
      throw new NotFoundError('Vehicle type');
    }
  }

  // Create driver profile (coerce year to number for schema)
  const vehicleYear = typeof vehicleDetails.year === 'number'
    ? vehicleDetails.year
    : parseInt(String(vehicleDetails.year), 10) || new Date().getFullYear();

  const driverData = {
    user: userId,
    licenseNumber: String(licenseNumber).trim(),
    licenseExpiry: new Date(licenseExpiry),
    vehicleDetails: {
      make: String(vehicleDetails.make || '').trim(),
      model: String(vehicleDetails.model || '').trim(),
      year: vehicleYear,
      plateNumber: String(vehicleDetails.plateNumber || '').trim().toUpperCase(),
      color: String(vehicleDetails.color || '').trim(),
      vehicleType: vehicleDetails.vehicleType,
    },
    documentsVerified: false,
    verificationStatus: 'pending',
    isOnline: false,
    isAvailable: false,
  };

  if (bankAccount) {
    driverData.bankAccount = bankAccount;
  }

  if (insurance) {
    driverData.insurance = {
      provider: insurance.provider,
      policyNumber: insurance.policyNumber,
      expiryDate: insurance.expiryDate ? new Date(insurance.expiryDate) : null,
      documentUrl: insurance.documentUrl || null,
    };
  }

  let driver;
  try {
    driver = await Driver.create(driverData);
  } catch (createErr) {
    if (createErr.code === 11000) {
      const field = createErr.message?.includes('licenseNumber') ? 'License number' : createErr.message?.includes('plateNumber') ? 'Plate number' : 'Driver';
      throw new ConflictError(`${field} is already registered. Please use different details.`);
    }
    throw createErr;
  }
  await driver.populate('user', 'name email phone profileImage role');
  await driver.populate('vehicleDetails.vehicleType');

  const files = Array.isArray(req.files) ? req.files : [];
  let idImageUrlLicence = null;
  let idImageUrlOther = null;
  let selfieUrl = null;
  const vehicleImagePush = [];
  let insuranceDocumentUrl = null;
  const vehicleDocPush = [];

  for (const file of files) {
    try {
      const url = await persistDriverCreateFileAndGetUrl(file);
      if (!url) {
        logger.warn(`Driver create upload: no URL for field ${file.fieldname}`);
        continue;
      }
      const cat = categorizeDriverCreateUploadField(file.fieldname);
      if (!cat) continue;

      const fn = (file.fieldname || '').toLowerCase();
      if (cat === 'id_image') {
        if (
          fn.includes('licence') ||
          fn.includes('license') ||
          fn.includes('driver')
        ) {
          idImageUrlLicence = url;
        } else {
          idImageUrlOther = url;
        }
      } else if (cat === 'selfie') {
        selfieUrl = url;
      } else if (cat === 'vehicle_image') {
        vehicleImagePush.push({
          type: 'front',
          url,
          createdAt: new Date(),
        });
      } else if (cat === 'insurance') {
        insuranceDocumentUrl = url;
      } else if (cat === 'vehicle_document') {
        vehicleDocPush.push({
          type: mapVehicleDocumentType(file.fieldname),
          url,
          uploadedAt: new Date(),
        });
      }
    } catch (err) {
      logger.error(`Driver create file upload failed (${file.fieldname}): ${err.message}`);
    }
  }

  const idImageUrl = idImageUrlLicence || idImageUrlOther;

  if (vehicleImagePush.length > 0) {
    await Driver.findByIdAndUpdate(driver._id, {
      $push: { vehicleImages: { $each: vehicleImagePush } },
    });
  }

  const kycUserId = driver.user?._id || driver.user;

  if (idImageUrl != null || selfieUrl != null) {
    await DriverKyc.findOneAndUpdate(
      { userId: kycUserId },
      {
        $set: {
          idImageUrl: idImageUrl || 'pending',
          selfieUrl: selfieUrl || 'pending',
          updatedAt: new Date(),
        },
        $setOnInsert: {
          userId: kycUserId,
          idType: 'drivers_license',
          idNumber: String(licenseNumber || '').trim() || 'pending',
          verificationStatus: 'pending',
        },
      },
      { upsert: true, new: true }
    );
  }

  if (insuranceDocumentUrl != null || vehicleDocPush.length > 0) {
    const vd = driver.vehicleDetails;
    const vehicleTypeId = vd.vehicleType?._id || vd.vehicleType;
    const updateOps = {
      $setOnInsert: {
        userId: kycUserId,
        vehicleType: vehicleTypeId,
        plateNumber: String(vd.plateNumber || '').toUpperCase(),
        make: vd.make || null,
        model: vd.model || null,
        year: vd.year || null,
        color: vd.color || null,
        verificationStatus: 'pending',
      },
    };
    if (insuranceDocumentUrl != null) {
      updateOps.$set = { insuranceDocumentUrl: insuranceDocumentUrl };
    }
    if (vehicleDocPush.length > 0) {
      updateOps.$push = { vehicleDocuments: { $each: vehicleDocPush } };
    }
    await DriverVehicle.findOneAndUpdate({ userId: kycUserId }, updateOps, {
      upsert: true,
      new: true,
    });
  }

  driver = await Driver.findById(driver._id)
    .populate('user', 'name email phone profileImage role')
    .populate('vehicleDetails.vehicleType');

  // Update user role to driver
  user.role = 'driver';
  await user.save();

  logger.info(`Driver profile created for user ${userId}`);

  res.status(201).json({
    status: 'success',
    message: 'Driver profile created successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Get driver profile - GET /api/driver/profile
 */
export const getDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const driver = await Driver.findOne({ user: userId })
    .populate('user', 'name email phone profileImage role rating')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  res.json({
    status: 'success',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Update driver profile - PATCH /api/driver/profile
 */
export const updateDriverProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const updateData = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Handle vehicle details update
  if (updateData.vehicleDetails) {
    if (updateData.vehicleDetails.vehicleType) {
      const vehicleType = await VehicleType.findById(updateData.vehicleDetails.vehicleType);
      if (!vehicleType || !vehicleType.isActive) {
        throw new NotFoundError('Vehicle type');
      }
    }

    driver.vehicleDetails = {
      ...driver.vehicleDetails.toObject(),
      ...updateData.vehicleDetails,
    };
  }

  // Handle license update
  if (updateData.licenseNumber) {
    driver.licenseNumber = updateData.licenseNumber;
  }
  if (updateData.licenseExpiry) {
    driver.licenseExpiry = new Date(updateData.licenseExpiry);
  }

  // Handle bank account update
  if (updateData.bankAccount) {
    driver.bankAccount = {
      ...driver.bankAccount?.toObject(),
      ...updateData.bankAccount,
      verified: false, // Reset verification on update
    };
  }

  // Handle insurance update
  if (updateData.insurance) {
    driver.insurance = {
      ...driver.insurance?.toObject(),
      ...updateData.insurance,
      expiryDate: updateData.insurance.expiryDate
        ? new Date(updateData.insurance.expiryDate)
        : driver.insurance?.expiryDate,
    };
  }

  // Handle vehicle images
  if (updateData.vehicleImages && Array.isArray(updateData.vehicleImages)) {
    driver.vehicleImages = updateData.vehicleImages.map((img) => ({
      type: img.type,
      url: img.url,
      createdAt: new Date(),
    }));
  }

  // Handle availability schedule
  if (updateData.availability) {
    driver.availability = {
      ...driver.availability?.toObject(),
      ...updateData.availability,
    };
  }

  await driver.save();
  await driver.populate('user', 'name email phone profileImage role rating');
  await driver.populate('vehicleDetails.vehicleType');

  logger.info(`Driver profile updated for user ${userId}`);

  res.json({
    status: 'success',
    message: 'Driver profile updated successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Update driver/passenger location - PATCH /api/update/locations/drivers-passengers
 */
export const updateLocation = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { latitude, longitude, address, heading } = req.body;

  if (!latitude || !longitude) {
    throw new ValidationError('Latitude and longitude are required');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update driver location if user is a driver
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: userId });
    if (driver) {
      const { updateDriverLocation, persistDriverLocationMongo } = await import('../services/locationService.js');
      await updateDriverLocation(driver._id, longitude, latitude, address || '');
      persistDriverLocationMongo(driver._id, longitude, latitude, address).catch((err) => {
        logger.warn(`Mongo driver location persist failed: ${err.message}`);
      });

      const { updateDriverLocationForAcceptedRide } = await import('../services/rideMovementService.js');
      await updateDriverLocationForAcceptedRide(driver._id, { lat: latitude, lng: longitude });

      const { getSocketService } = await import('../services/socketService.js');
      const socketService = getSocketService();
      if (socketService) {
        const activeRide = await Ride.findActiveRideForDriver(driver._id);
        if (activeRide) {
          await socketService.emitDriverLocationUpdate(activeRide, driver);
        }
      }

      try {
        const { getPusherService } = await import('../services/pusherService.js');
        const pusherSvc = getPusherService();
        const headingNum =
          heading != null && heading !== '' && !Number.isNaN(Number(heading))
            ? Number(heading)
            : null;
        await pusherSvc.emitDriverLiveLocationToRider(
          driver._id,
          Number(latitude),
          Number(longitude),
          headingNum
        );
      } catch (err) {
        logger.warn(`Pusher driver-location-update skipped: ${err.message}`);
      }

      logger.info(`Driver location updated for driver ${driver._id}`);
    }
  }

  // Update user location (for passengers)
  // Always ensure type: 'Point' is set for valid GeoJSON
  user.currentLocation = {
    type: 'Point',
    coordinates: [longitude, latitude],
    address: address || user.currentLocation?.address || null,
    lastUpdated: new Date(),
  };
  await user.save();

  res.json({
    status: 'success',
    message: 'Location updated successfully',
    data: {
      location: {
        latitude,
        longitude,
        address: address || null,
      },
    },
  });
});

/**
 * Get driver/passenger locations - GET /api/locations/drivers-passengers
 */
export const getLocations = asyncHandler(async (req, res) => {
  const { type, rideId } = req.query;

  let locations = [];

  if (type === 'drivers' || !type) {
    const MAX_DRIVERS = 500;
    const drivers = await Driver.find({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
    })
      .limit(MAX_DRIVERS)
      .populate('user', 'name phone profileImage')
      .select('currentLocation user vehicleDetails');

    locations = drivers.map((driver) => ({
      id: driver._id.toString(),
      type: 'driver',
      userId: driver.user._id.toString(),
      name: driver.user.name,
      phone: driver.user.phone,
      image: driver.user.profileImage,
      location: {
        latitude: driver.currentLocation.coordinates[1],
        longitude: driver.currentLocation.coordinates[0],
        address: driver.currentLocation.address,
        lastUpdated: driver.currentLocation.lastUpdated,
      },
      vehicle: driver.vehicleDetails,
    }));
  }

  if (type === 'passengers' && rideId) {
    // Get passenger location for a specific ride
    const ride = await Ride.findById(rideId).populate('rider', 'name phone profileImage currentLocation');
    if (ride && ride.rider) {
      if (ride.rider.currentLocation) {
        locations = [{
          id: ride.rider._id.toString(),
          type: 'passenger',
          name: ride.rider.name,
          phone: ride.rider.phone,
          image: ride.rider.profileImage,
          location: {
            latitude: ride.rider.currentLocation.coordinates[1],
            longitude: ride.rider.currentLocation.coordinates[0],
            address: ride.rider.currentLocation.address,
            lastUpdated: ride.rider.currentLocation.lastUpdated,
          },
        }];
      }
    }
  }

  res.json({
    status: 'success',
    data: {
      locations,
    },
  });
});

/**
 * Nearby driver count - GET /api/drivers/nearby-count?lat=&lng=&radiusKm=3
 */
export const getNearbyDriverCount = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm = 3 } = req.query;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radius = parseFloat(radiusKm) || 3;

  let count = 0;
  try {
    count = await Driver.countDocuments({
      isOnline: true,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: [longitude, latitude] },
          $maxDistance: radius * 1000,
        },
      },
    });
  } catch (err) {
    // Geospatial query can fail if 2dsphere index is missing or data is invalid
    logger.warn(`Nearby count geo query failed, using fallback: ${err.message}`);
    count = await Driver.countDocuments({
      isOnline: true,
      currentLocation: { $exists: true, $ne: null },
    });
  }

  const capped = count > 10 ? '10+' : String(count);
  const label =
    count === 0
      ? 'No drivers nearby'
      : count === 1
        ? '1 driver nearby'
        : `${capped} drivers nearby`;

  return res.json({ count, label });
});

const utcDayKey = (d = new Date()) => d.toISOString().slice(0, 10);

function resetDriverDayStatsIfNeeded(driver) {
  const today = utcDayKey();
  if (!driver.statsDate) {
    driver.statsDate = today;
    return true;
  }
  if (driver.statsDate !== today) {
    driver.todayOnlineMs = 0;
    driver.statsDate = today;
    if (driver.onlineSessionStartedAt) {
      driver.onlineSessionStartedAt = new Date();
    }
    return true;
  }
  return false;
}

function startOfUtcWeek() {
  const d = new Date();
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfUtcMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function sumRideEarningsSince(driverId, since) {
  const r = await Transaction.aggregate([
    { $match: { driverId, type: 'ride_earning', createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return Math.round(r[0]?.total || 0);
}

/**
 * Toggle driver availability - PATCH /api/driver/availability
 */
export const toggleAvailability = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { isAvailable } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Check if driver is verified
  if (!driver.documentsVerified || driver.verificationStatus !== 'approved') {
    throw new ValidationError('Driver must be verified to go online');
  }

  // Check if driver has active ride
  const activeRide = await Ride.findActiveRideForDriver(driver._id);
  if (activeRide && isAvailable === false) {
    // Can't go offline if there's an active ride
    throw new ConflictError('Cannot go offline with an active ride');
  }

  const dayRolled = resetDriverDayStatsIfNeeded(driver);

  driver.isAvailable = isAvailable === true || isAvailable === 'true';

  if (driver.isAvailable) {
    driver.isOnline = true;
    driver.lastActiveAt = new Date();
    driver.todayOnlineMs = driver.todayOnlineMs || 0;
    if (!driver.onlineSessionStartedAt) {
      driver.onlineSessionStartedAt = new Date();
    }
  } else {
    if (driver.onlineSessionStartedAt) {
      const started = new Date(driver.onlineSessionStartedAt).getTime();
      driver.todayOnlineMs = (driver.todayOnlineMs || 0) + (Date.now() - started);
      driver.onlineSessionStartedAt = null;
    }
    if (!activeRide) {
      driver.isOnline = false;
    }
  }

  await driver.save();

  if (dayRolled) {
    logger.debug(`Driver ${driver._id} stats rolled to new UTC day`);
  }

  logger.info(`Driver availability toggled: ${driver.isAvailable} for driver ${driver._id}`);

  res.json({
    status: 'success',
    message: `Driver is now ${driver.isAvailable ? 'available' : 'unavailable'}`,
    data: {
      driver: {
        driver_id: driver._id.toString(),
        is_online: driver.isOnline,
        is_available: driver.isAvailable,
      },
    },
  });
});

/**
 * Get driver earnings - GET /api/driver/earnings
 */
export const getDriverEarnings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { period = 'all' } = req.query; // all, today, week, month

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {
        is_online: false,
        is_available: false,
        verification_status: 'pending',
        documents_verified: false,
        earned_today: 0,
        total_earnings: 0,
        time_online: formatOnlineDurationMs(0),
        wallet: {
          todayEarnings: 0,
          totalBalance: 0,
          availableBalance: 0,
          pendingBalance: 0,
          totalEarned: 0,
        },
        in_app_payment: 0,
        total_balance: '0',
        earnings: {
          total: 0,
          today: 0,
          thisWeek: 0,
          thisMonth: 0,
          period: 0,
          totalEarnedLifetime: 0,
          currency: 'NGN',
        },
        statistics: {
          totalRides: 0,
          rating: 0,
          acceptanceRate: 0,
          cancellationRate: 0,
        },
        recentRides: [],
        bank_account: null,
      },
    });
  }

  const rolled = resetDriverDayStatsIfNeeded(driver);
  if (rolled) {
    await driver.save();
  }

  await getOrCreateWallet(driver._id);
  await ensureWalletDayStats(driver._id);
  const walletDoc = await DriverWallet.findOne({ driverId: driver._id }).lean();

  const earnedToday = Math.round(Number(walletDoc?.todayEarnings) || 0);
  const totalWalletBalance = Math.round(
    (Number(walletDoc?.availableBalance) || 0) + (Number(walletDoc?.pendingBalance) || 0)
  );
  const lifetimeEarned = Math.round(Number(walletDoc?.totalEarned) || 0);

  const [earningsWeek, earningsMonth] = await Promise.all([
    sumRideEarningsSince(driver._id, startOfUtcWeek()),
    sumRideEarningsSince(driver._id, startOfUtcMonth()),
  ]);

  let periodEarnings = lifetimeEarned;
  if (period === 'today') {
    periodEarnings = earnedToday;
  } else if (period === 'week') {
    periodEarnings = earningsWeek;
  } else if (period === 'month') {
    periodEarnings = earningsMonth;
  }

  let onlineMs = driver.todayOnlineMs || 0;
  if (driver.onlineSessionStartedAt) {
    onlineMs += Date.now() - new Date(driver.onlineSessionStartedAt).getTime();
  }
  const timeOnlineLabel = formatOnlineDurationMs(onlineMs);

  // Get recent transactions
  const recentRides = await Ride.find({
    driver: driver._id,
    status: 'completed',
    paymentStatus: 'completed',
  })
    .sort({ completedAt: -1 })
    .limit(10)
    .select('fare paymentStatus completedAt');

  res.json({
    status: 'success',
    data: {
      is_online: driver.isOnline,
      is_available: driver.isAvailable,
      verification_status: driver.verificationStatus || 'pending',
      documents_verified: !!driver.documentsVerified,
      earned_today: earnedToday,
      total_earnings: totalWalletBalance,
      time_online: timeOnlineLabel,
      wallet: {
        todayEarnings: earnedToday,
        totalBalance: totalWalletBalance,
        availableBalance: walletDoc?.availableBalance ?? 0,
        pendingBalance: walletDoc?.pendingBalance ?? 0,
        totalEarned: lifetimeEarned,
      },
      in_app_payment: earnedToday,
      total_balance: String(totalWalletBalance),
      earnings: {
        total: totalWalletBalance,
        today: earnedToday,
        thisWeek: earningsWeek,
        thisMonth: earningsMonth,
        period: periodEarnings,
        totalEarnedLifetime: lifetimeEarned,
        currency: 'NGN',
      },
      statistics: {
        totalRides: driver.totalRides,
        rating: driver.rating,
        acceptanceRate: driver.acceptanceRate,
        cancellationRate: driver.cancellationRate,
      },
      recentRides: recentRides.map((ride) => ({
        ride_id: ride._id.toString(),
        fare: ride.fare.totalFare,
        payment_status: ride.paymentStatus,
        completed_at: ride.completedAt,
      })),
      // Bank details for withdrawal UI (mobile expects driver_* keys)
      driver_bank_name: driver.bankAccount?.bankName || null,
      driver_account_number: driver.bankAccount?.accountNumber || null,
      driver_account_name: driver.bankAccount?.accountName || null,
      bank_account: driver.bankAccount || null,
    },
  });
});

/**
 * List my withdrawals - GET /api/driver/withdrawals
 */
export const getMyWithdrawals = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  const filter = {
    user: userId,
    amount: { $lt: 0 },
    'metadata.type': 'withdrawal',
  };

  const [withdrawals, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit, 10)).lean(),
    Payment.countDocuments(filter),
  ]);

  res.json({
    status: 'success',
    data: {
      withdrawals: withdrawals.map((p) => ({
        withdrawal_id: p._id.toString(),
        amount: Math.abs(p.amount),
        status: p.status,
        created_at: p.createdAt,
        completed_at: p.paidAt || null,
        bank_name: (p.metadata && typeof p.metadata.get === 'function' ? p.metadata.get('bankName') : p.metadata?.bankName) || null,
        account_number: (p.metadata && typeof p.metadata.get === 'function' ? p.metadata.get('accountNumber') : p.metadata?.accountNumber) || null,
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1,
      },
    },
  });
});

/**
 * Get driver account setup status - GET /api/driver/setup-status
 * Returns completeness %, verification status, rejection reason, and steps to complete.
 */
export const getDriverSetupStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId })
    .populate('user', 'name phone')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    return res.json({
      status: 'success',
      data: {
        has_driver_profile: false,
        completeness_percent: 0,
        verification_status: 'pending',
        rejection_reason: null,
        steps: [],
        action_message: null,
      },
    });
  }

  const requiredImageTypes = ['front', 'back', 'side', 'interior', 'license'];
  const vehicleImages = driver.vehicleImages || [];
  const hasImageType = (type) => vehicleImages.some((img) => (img.type || '').toLowerCase() === type);
  const licenseOk = !!(driver.licenseNumber && driver.licenseExpiry);
  const vehicleDetailsOk = !!(
    driver.vehicleDetails?.make &&
    driver.vehicleDetails?.model &&
    driver.vehicleDetails?.plateNumber &&
    driver.vehicleDetails?.vehicleType
  );
  const vehicleImagesOk = requiredImageTypes.every((t) => hasImageType(t));
  const bankOk = !!(
    driver.bankAccount?.accountNumber &&
    driver.bankAccount?.bankName
  );

  const steps = [
    {
      id: 'license',
      label: 'Driver license',
      description: 'Valid license number and expiry date',
      completed: licenseOk,
      action_required: licenseOk ? null : 'Add or update your driver license number and expiry in your driver profile.',
    },
    {
      id: 'vehicle_details',
      label: 'Vehicle details',
      description: 'Make, model, plate number, and vehicle type',
      completed: vehicleDetailsOk,
      action_required: vehicleDetailsOk ? null : 'Complete vehicle details (make, model, plate number, vehicle type) in your driver profile.',
    },
    {
      id: 'vehicle_images',
      label: 'Vehicle photos',
      description: 'Front, back, side, interior, and license plate photos',
      completed: vehicleImagesOk,
      action_required: vehicleImagesOk ? null : 'Upload all required vehicle photos (front, back, side, interior, license) in your driver profile.',
    },
    {
      id: 'bank_account',
      label: 'Bank account',
      description: 'For receiving withdrawals',
      completed: bankOk,
      action_required: bankOk ? null : 'Add your bank account (account number and bank name) in your driver profile to receive withdrawals.',
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const completenessPercent = steps.length ? Math.round((completedCount / steps.length) * 100) : 0;

  let actionMessage = null;
  if (driver.verificationStatus === 'rejected' && driver.rejectionReason) {
    actionMessage = 'Your account was not approved. Please address the reason below and update your profile. You may need to re-upload documents or correct details. After updating, contact support or wait for re-review.';
  } else if (completenessPercent < 100) {
    actionMessage = 'Complete all steps below to submit your account for verification.';
  } else if (driver.verificationStatus === 'pending') {
    actionMessage = 'Your profile is complete and under review. You will be notified once approved.';
  }

  res.json({
    status: 'success',
    data: {
      has_driver_profile: true,
      completeness_percent: completenessPercent,
      verification_status: driver.verificationStatus,
      rejection_reason: driver.rejectionReason || null,
      steps,
      action_message: actionMessage,
    },
  });
});

/**
 * Get driver challenges (gamified tasks) - GET /api/driver/challenges
 */
export const getDriverChallenges = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    return res.json({
      status: 'success',
      data: { challenges: [] },
    });
  }
  const { getChallengesForDriver } = await import('../services/driverTaskService.js');
  const challenges = await getChallengesForDriver(driver._id);
  res.json({
    status: 'success',
    data: { challenges },
  });
});

/**
 * Get pending rides for driver - GET /api/driver/rides/pending
 */
export const getPendingRides = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    return res.json({
      status: 'success',
      data: {
        rides: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0,
        },
      },
    });
  }

  const skip = (page - 1) * limit;

  // Find rides that match driver's vehicle type and are not assigned
  const rides = await Ride.find({
    vehicleType: driver.vehicleDetails.vehicleType,
    status: { $in: ['searching', 'requested'] },
    driver: null,
  })
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments({
    vehicleType: driver.vehicleDetails.vehicleType,
    status: { $in: ['searching', 'requested'] },
    driver: null,
  });

  res.json({
    status: 'success',
    data: {
      rides: rides.map((ride) => formatRideForDriver(ride)),
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
 * ACK ride offer received (client confirms socket/push delivery) — POST /api/driver/rides/ack-request
 */
export const ackRideOffer = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;
  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }
  const deliveredAt = new Date();
  const result = await Ride.updateOne(
    {
      _id: rideId,
      offerTracking: { $elemMatch: { driver: driver._id } },
    },
    { $set: { 'offerTracking.$[elem].deliveredAt': deliveredAt } },
    { arrayFilters: [{ 'elem.driver': driver._id }] }
  );
  if (result.matchedCount === 0) {
    return res.json({
      status: 'success',
      data: { acknowledged: false, reason: 'no_matching_offer' },
    });
  }
  logger.info(`Ride offer ACK: ride ${rideId} driver ${driver._id} delivered_at=${deliveredAt.toISOString()}`);
  res.json({
    status: 'success',
    data: { acknowledged: true, delivered_at: deliveredAt.toISOString() },
  });
});

/**
 * Accept ride - POST /api/driver/rides/accept
 */
export const acceptRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  // Check if driver is available
  if (!driver.isAvailable || !driver.isOnline) {
    throw new ValidationError('Driver must be online and available to accept rides');
  }

  // Check if driver has active ride
  const activeRide = await Ride.findActiveRideForDriver(driver._id);
  if (activeRide) {
    throw new ConflictError('Driver already has an active ride');
  }

  const acceptedAt = new Date();
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, status: { $in: ['searching', 'requested'] }, driver: null },
    {
      $set: {
        driver: driver._id,
        status: 'accepted',
        acceptedAt,
        acceptedByDriver: true,
      },
      $push: {
        statusHistory: {
          status: 'accepted',
          timestamp: acceptedAt,
          note: `Accepted by driver ${driver._id}`,
        },
      },
    },
    { new: true }
  );

  if (!ride) {
    throw new ConflictError('Ride is no longer available or already assigned');
  }

  await Ride.updateOne(
    { _id: ride._id, 'offerTracking.driver': driver._id },
    { $set: { 'offerTracking.$.acceptedAt': acceptedAt } }
  ).catch(() => {});

  logRideLifecycle(logger, ride, { event: 'driver_accept', driverUserId: userId.toString() });

  await cache.set(`ride_accepted:${rideId}`, driver._id.toString(), 30);

  await ride.populate('rider', 'name phone profileImage rating deviceToken');
  await ride.populate('vehicleType');

  // Rider notifications: driver accepted + locked fare
  try {
    const { sendToUser } = await import('../services/notificationService.js');
    const driverUser = await User.findById(userId).select('name').lean();
    const driverName = driverUser?.name || 'Your driver';
    const fareAmount = Math.round(Number(ride?.fare?.totalFare || 0));
    const fareLabel = fareAmount.toLocaleString();

    await sendToUser(ride.rider._id, 'rider', {
      title: 'Driver on the way! 🛺',
      message: `${driverName} has accepted your ride and is heading to you.`,
      type: 'alert',
      priority: 'high',
      screen: 'ride',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'ActiveRide', rideId: ride._id.toString() },
      event_key: 'ride_accepted',
      data: { subType: 'ride_accepted', rideId: ride._id.toString() },
    });

    await sendToUser(ride.rider._id, 'rider', {
      title: 'Your fare is locked 🔒',
      message: `Your fare of ₦${fareLabel} is fixed in the app. No cash needed at pickup.`,
      type: 'banner',
      priority: 'normal',
      screen: 'ride',
      duration_ms: 8000,
      ride_id: ride._id,
      event_key: 'fare_locked',
      data: { subType: 'fare_locked', rideId: ride._id.toString() },
    });
  } catch (err) {
    logger.error(`Ride accepted notification failed: ${err.message}`);
  }

  // Make driver unavailable temporarily
  driver.isAvailable = false;
  await driver.save();

  await driver.populate('user', 'name phone profileImage rating');
  await ride.populate('driver.user', 'name phone profileImage rating');

  // Send real-time notification to rider via Socket.io
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideAccepted(ride, driver);
    socketService.emitRideStatusUpdate(ride, 'accepted', driver);
  }

  // Update driver acceptance rate
  try {
    const { updateDriverAcceptanceRate } = await import('../services/driverStatisticsService.js');
    await updateDriverAcceptanceRate(driver._id);
  } catch (error) {
    logger.error(`Failed to update driver acceptance rate: ${error.message}`);
    // Don't fail ride acceptance if statistics update fails
  }

  logger.info(`Ride ${rideId} accepted by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride accepted successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Reject/Cancel ride by driver - POST /api/driver/rides/cancel
 */
export const rejectRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, reason } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  // Check if ride can be cancelled
  if (['completed', 'cancelled'].includes(ride.status)) {
    throw new ValidationError('Ride cannot be cancelled');
  }

  // If ride is assigned but trip not started, driver can bail — return ride to matching pool
  if (ride.status === 'accepted' || ride.status === 'driver_en_route') {
    ride.driver = null;
    ride.status = 'searching';
    ride.acceptedByDriver = false;
    ride.acceptedAt = null;
    ride.statusHistory.push({
      status: 'searching',
      timestamp: new Date(),
      note: `Rejected by driver: ${reason || 'No reason provided'}`,
    });

    driver.isAvailable = true;
    await driver.save();
  } else {
    // If ride is in progress, cancel it
    await ride.cancelRide('driver', reason, 0);
    driver.isAvailable = true;
    await driver.save();
  }

  await ride.save();

  if (ride.status === 'searching') {
    setImmediate(() => {
      (async () => {
        try {
          const rideDoc = await Ride.findById(ride._id)
            .populate('rider', 'name phone profileImage rating deviceToken')
            .populate('vehicleType');
          if (!rideDoc) return;
          const matchedDrivers = await rideMatchingService.findAndMatchDrivers(rideDoc, 10, 5);
          if (matchedDrivers.length > 0) {
            const assignedDriverId = await offerRideToDrivers(rideDoc, matchedDrivers);
            if (!assignedDriverId) {
              const fresh = await Ride.findById(ride._id).populate('rider');
              if (fresh && (fresh.status === 'searching' || fresh.status === 'requested') && !fresh.driver) {
                await cancelUnacceptedRide(fresh._id);
                const after = await Ride.findById(ride._id).populate('rider');
                if (after) await notifyNoDriverFound(after);
              }
            }
          } else {
            await cancelUnacceptedRide(rideDoc._id);
            const after = await Ride.findById(ride._id).populate('rider');
            if (after) await notifyNoDriverFound(after);
          }
        } catch (error) {
          logger.error(`Re-offer after driver reject failed: ${error.message}`);
        }
      })();
    });
  }

  try {
    const { sendToUser } = await import('../services/notificationService.js');
    await sendToUser(ride.rider, 'rider', {
      title: 'Driver cancelled',
      message: 'Your driver cancelled the ride. We are finding you a new driver.',
      type: 'alert',
      priority: 'high',
      screen: 'home',
      ride_id: ride._id,
      event_key: 'ride_cancelled_by_driver',
      data: { subType: 'driver_cancelled', rideId: ride._id.toString() },
    });
  } catch (err) {
    logger.error(`Ride rejected notification failed: ${err.message}`);
  }

  // Update driver cancellation rate
  try {
    const { updateDriverCancellationRate } = await import('../services/driverStatisticsService.js');
    await updateDriverCancellationRate(driver._id);
  } catch (error) {
    logger.error(`Failed to update driver cancellation rate: ${error.message}`);
    // Don't fail ride rejection if statistics update fails
  }

  logger.info(`Ride ${rideId} rejected by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride rejected successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Mark arrived at pickup - POST /api/driver/rides/arrived
 * Validates driver is within 150m of pickup; for wallet payments charges ₦100 service fee.
 */
export const markArrived = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, lat, lng } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'accepted' && ride.status !== 'driver_en_route') {
    throw new ValidationError('Ride must be accepted or en route to mark arrived');
  }

  const { getSettings } = await import('../services/settingsService.js');
  const { chargeServiceFee } = await import('../services/escrowWalletService.js');

  const [pickupLng, pickupLat] = ride.pickupLocation?.coordinates ?? [];
  if (lat != null && lng != null && pickupLat != null && pickupLng != null) {
    const s = await getSettings();
    const maxRadius = s.arrival?.maxRadiusMeters ?? 150;
    const distanceKm = calculateDistance(pickupLat, pickupLng, Number(lat), Number(lng));
    const distanceMeters = distanceKm * 1000;
    if (distanceMeters > maxRadius) {
      throw new ValidationError(
        `You must be within ${maxRadius}m of the pickup point (currently ${Math.round(distanceMeters)}m)`
      );
    }
  }

  if (ride.paymentMethod === 'wallet' && ride.paymentStatus === 'held') {
    const riderId = ride.rider?._id ?? ride.rider;
    await chargeServiceFee(riderId, ride._id);
  }

  ride.status = 'arrived';
  ride.arrivedAt = new Date();
  if (ride.paymentMethod === 'wallet' && ride.paymentStatus === 'held') {
    ride.paymentStatus = 'charged';
  }
  ride.statusHistory.push({
    status: 'arrived',
    timestamp: new Date(),
    note: 'Driver arrived at pickup',
  });
  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating deviceToken');
  await ride.populate('vehicleType');

  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideStatusUpdate(ride, 'arrived', driver);
  }

  const driverUserForArrived = await User.findById(userId).select('name').lean();
  const driverName = driverUserForArrived?.name || 'Your driver';

  try {
    const { sendToUser } = await import('../services/notificationService.js');
    await sendToUser(ride.rider._id, 'rider', {
      title: 'Driver arrived! 📍',
      message: `${driverName} is at your pickup point. Please come out now.`,
      type: 'alert',
      priority: 'critical',
      screen: 'ride',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'ActiveRide', rideId: ride._id.toString() },
      event_key: 'driver_arrived',
      data: { subType: 'driver_arrived', rideId: ride._id.toString() },
    });
  } catch (err) {
    logger.error(`Ride arrived notification failed: ${err.message}`);
  }

  try {
    const { getPusherService } = await import('../services/pusherService.js');
    const ps = getPusherService();
    const riderId = ride.rider?._id?.toString?.() ?? ride.rider?.toString?.();
    if (ps?.pusher && riderId) {
      const vd = driver.vehicleDetails;
      const vehicleInfo =
        vd?.color && vd?.make
          ? `${vd.color} ${vd.make}`
          : vd?.make || vd?.model || '';
      await ps.pusher.trigger(`private-user-${riderId}`, 'driver-arrived', {
        rideId: ride._id.toString(),
        driverName,
        vehicleInfo,
        plateNumber: vd?.plateNumber ?? '',
      });
    }
  } catch (err) {
    logger.warn(`Pusher driver-arrived failed: ${err.message}`);
  }

  logger.info(`Ride ${rideId} marked arrived by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Marked as arrived at pickup',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Start ride - POST /api/driver/rides/start
 */
export const startRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (!['accepted', 'driver_en_route', 'arrived'].includes(ride.status)) {
    throw new ValidationError('Ride cannot be started in current status');
  }

  ride.status = 'in-progress';
  ride.isRideStarted = true;
  ride.startedAt = new Date();
  ride.statusHistory.push({
    status: 'in-progress',
    timestamp: new Date(),
    note: 'Ride started',
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating deviceToken');
  await ride.populate('vehicleType');

  // Rider notification: ride started
  try {
    const { sendToUser } = await import('../services/notificationService.js');
    const dropoffName =
      ride.dropoffLocation?.name ||
      ride.dropoffLocation?.address ||
      'your destination';
    await sendToUser(ride.rider._id, 'rider', {
      title: 'Ride started 🚀',
      message: `You are on your way to ${dropoffName}. Enjoy your ride!`,
      type: 'alert',
      priority: 'normal',
      screen: 'ride',
      duration_ms: 4000,
      ride_id: ride._id,
      event_key: 'ride_started',
      data: { subType: 'ride_started', rideId: ride._id.toString() },
    });
  } catch (err) {
    logger.error(`Ride started notification failed: ${err.message}`);
  }

  // Send real-time notification to rider
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    socketService.emitRideStarted(ride, driver);
    socketService.emitRideStatusUpdate(ride, 'in-progress', driver);
  }

  // Start location tracking (driver should update location periodically)
  // Location updates will be emitted via updateLocation endpoint

  logger.info(`Ride ${rideId} started by driver ${driver._id}`);

  res.json({
    status: 'success',
    message: 'Ride started successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Complete ride - POST /api/driver/rides/complete
 */
export const completeRide = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, paymentStatus } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Check if driver is assigned to this ride
  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'in-progress') {
    throw new ValidationError('Ride is not in progress');
  }

  ride.status = 'completed';
  ride.dropOffCompleted = true;
  ride.completedAt = new Date();
  const isEscrowWallet = ride.paymentMethod === 'wallet' && ['held', 'charged'].includes(ride.paymentStatus);
  if (!isEscrowWallet) {
    ride.paymentStatus = paymentStatus || (ride.paymentMethod === 'cash' ? 'pending' : 'completed');
  }

  ride.statusHistory.push({
    status: 'completed',
    timestamp: new Date(),
    note: 'Ride completed',
  });

  await ride.save();
  await ride.populate('rider', 'name phone profileImage rating');
  await ride.populate('vehicleType');

  // Make driver available again
  driver.isAvailable = true;
  await driver.save();

  // Cancel any automation timers for this ride
  if (global.automationTimers && global.automationTimers.has(rideId)) {
    const timers = global.automationTimers.get(rideId);
    timers.forEach(timer => clearTimeout(timer));
    global.automationTimers.delete(rideId);
    logger.info(`🧹 Cancelled automation timers for manually completed ride ${rideId}`);
  }

  // Process payment first
  let payment = null;
  try {
    const { processRidePayment, sendPaymentReceipt } = await import('../services/paymentService.js');
    const paymentResult = await processRidePayment(ride);
    
    // Send receipt if payment was processed
    if (paymentResult.success && paymentResult.payment && paymentResult.payment.status === 'completed') {
      payment = paymentResult.payment;
      await sendPaymentReceipt(ride, payment);
    }
  } catch (error) {
    logger.error(`Payment processing failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if payment processing fails
  }

  // Send real-time notification to rider (after payment processing)
  const { getSocketService } = await import('../services/socketService.js');
  const socketService = getSocketService();
  if (socketService) {
    await socketService.emitRideCompleted(ride);
    await socketService.emitRideStatusUpdate(ride, 'completed', driver);
  }

  try {
    const { sendToUser } = await import('../services/notificationService.js');
    const fareAmount = Math.round(Number(ride?.fare?.totalFare || payment?.amount || 0));
    const driverEarnings = Math.round(
      Number(ride?.fare?.driverNetAmount ?? ride?.fare?.totalFare ?? 0)
    );

    await sendToUser(ride.rider._id, 'rider', {
      title: 'Ride completed ✅',
      message: `₦${fareAmount.toLocaleString()} has been deducted from your wallet. Thanks for riding with Keke!`,
      type: 'alert',
      priority: 'high',
      screen: 'home',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'RideDetails', rideId: ride._id.toString() },
      event_key: 'ride_completed',
      data: { subType: 'ride_completed', rideId: ride._id.toString() },
    });

    const walletDoc = await DriverWallet.findOne({ driverId: driver._id }).lean();
    const pendingBal = Math.round(Number(walletDoc?.pendingBalance ?? 0));
    const availableBal = Math.round(Number(walletDoc?.availableBalance ?? 0));

    await sendToUser(userId, 'driver', {
      title: `₦${driverEarnings.toLocaleString()} earned from completed trip`,
      message: `Driver wallet — Pending: ₦${pendingBal.toLocaleString()} · Available: ₦${availableBal.toLocaleString()}.`,
      type: 'alert',
      priority: 'high',
      screen: 'wallet',
      ride_id: ride._id,
      action_type: 'navigate',
      action_payload: { screen: 'wallet', rideId: ride._id.toString() },
      event_key: 'fare_received',
      data: {
        subType: 'fare_received',
        rideId: ride._id.toString(),
        amountNaira: String(driverEarnings),
        pendingBalance: String(pendingBal),
        availableBalance: String(availableBal),
      },
    });
  } catch (err) {
    logger.error(`Ride completion notification failed: ${err.message}`);
  }

  // Request rating/review from rider
  try {
    const { requestRiderReview } = await import('../services/reviewService.js');
    await requestRiderReview(ride);
  } catch (error) {
    logger.error(`Review request failed for ride ${rideId}: ${error.message}`);
    // Don't fail the ride completion if review request fails
  }

  // Check and award driver challenges (gamified tasks)
  try {
    const { checkAndAwardTasks } = await import('../services/driverTaskService.js');
    await checkAndAwardTasks(driver._id, ride);
  } catch (error) {
    logger.error(`Driver task check failed for ride ${rideId}: ${error.message}`);
  }

  logger.info(`Ride ${rideId} completed by driver ${driver._id}`);

  // Self-learning: teach places from completed ride (fire-and-forget)
  const pickup = ride.pickupLocation;
  const drop = ride.dropoffLocation;
  learnFromRide({
    _id: ride._id.toString(),
    origin: {
      lat: pickup?.coordinates?.[1],
      lng: pickup?.coordinates?.[0],
      label: pickup?.name || pickup?.address,
    },
    destination: {
      lat: drop?.coordinates?.[1],
      lng: drop?.coordinates?.[0],
      label: drop?.name || drop?.address,
    },
  }).catch((err) => logger.warn('[Learn]', err.message));

  res.json({
    status: 'success',
    message: 'Ride completed successfully',
    data: {
      ride: formatRideForDriver(ride),
    },
  });
});

/**
 * Confirm payment - POST /api/driver/ride/confirm-payment
 */
export const confirmPayment = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status !== 'completed') {
    throw new ValidationError('Ride must be completed first');
  }

  if (ride.paymentStatus === 'completed') {
    throw new ConflictError('Payment already confirmed');
  }

  ride.paymentStatus = 'completed';
  await ride.save();

  try {
    const { applyRideEarningToWallet } = await import('../services/paymentService.js');
    await applyRideEarningToWallet(ride);
    driver.totalRides += 1;
    await driver.save();
  } catch (err) {
    logger.error(`applyRideEarningToWallet failed for ride ${rideId}: ${err.message}`);
  }

  // Check and award driver challenges (in case payment was confirmed after ride complete)
  try {
    const { checkAndAwardTasks } = await import('../services/driverTaskService.js');
    await checkAndAwardTasks(driver._id, ride);
  } catch (error) {
    logger.error(`Driver task check failed for ride ${rideId}: ${error.message}`);
  }

  // Process payment transaction (if Stripe)
  if (ride.paymentMethod === 'card' || ride.paymentMethod === 'stripe') {
    try {
      const { confirmStripePayment } = await import('../services/paymentService.js');
      const payment = await Payment.findOne({ ride: rideId });
      if (payment && payment.stripePaymentIntentId) {
        await confirmStripePayment(payment.stripePaymentIntentId);
      }
    } catch (error) {
      logger.error(`Stripe payment confirmation failed: ${error.message}`);
      // Don't fail payment confirmation if Stripe processing fails
    }
  }

  // Send receipt
  try {
    const { sendPaymentReceipt } = await import('../services/paymentService.js');
    const payment = await Payment.findOne({ ride: rideId });
    if (payment) {
      await sendPaymentReceipt(ride, payment);
    }
  } catch (error) {
    logger.error(`Receipt sending failed: ${error.message}`);
    // Don't fail payment confirmation if receipt sending fails
  }

  logger.info(`Payment confirmed for ride ${rideId}`);

  try {
    const method = String(ride.paymentMethod || '').toLowerCase();
    if (method === 'cash') {
      const { getPusherService } = await import('../services/pusherService.js');
      const ps = getPusherService();
      const riderRef = ride.rider;
      const riderId = riderRef?._id?.toString?.() ?? riderRef?.toString?.();
      if (ps?.pusher && riderId) {
        const amount = ride.fare?.totalFare ?? 0;
        await ps.pusher.trigger(`private-user-${riderId}`, 'payment-confirmed', {
          rideId: ride._id.toString(),
          amount,
          method: 'cash',
        });
      }
    }
  } catch (err) {
    logger.warn(`Pusher payment-confirmed failed: ${err.message}`);
  }

  res.json({
    status: 'success',
    message: 'Payment confirmed successfully',
    data: {
      ride: {
        ride_id: ride._id.toString(),
        payment_status: ride.paymentStatus,
        fare: ride.fare.totalFare,
      },
    },
  });
});

/**
 * Change payment method - POST /api/driver/ride/change-payment
 */
export const changePaymentMethod = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { rideId, paymentMethod, amount } = req.body;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    throw new NotFoundError('Driver profile');
  }

  const ride = await Ride.findById(rideId);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  if (ride.driver?.toString() !== driver._id.toString()) {
    throw new ValidationError('You are not assigned to this ride');
  }

  if (ride.status === 'completed' || ride.status === 'cancelled') {
    throw new ValidationError('Cannot change payment method for completed or cancelled rides');
  }

  if (paymentMethod) {
    const validMethods = ['cash', 'wallet', 'card', 'bank_transfer'];
    if (!validMethods.includes(paymentMethod)) {
      throw new ValidationError('Invalid payment method');
    }
    ride.paymentMethod = paymentMethod;
  }
  if (amount != null && amount !== '' && !Number.isNaN(parseFloat(amount))) {
    ride.changeAmount = parseFloat(amount);
  }
  await ride.save();

  logger.info(
    `Ride ${rideId} updated` +
    (paymentMethod ? ` payment method ${paymentMethod}` : '') +
    (amount != null && amount !== '' ? ` change amount ${amount}` : '')
  );

  res.json({
    status: 'success',
    message: 'Payment method changed successfully',
    data: {
      ride: {
        ride_id: ride._id.toString(),
        payment_method: ride.paymentMethod,
      },
    },
  });
});

/**
 * Get daily tasks - GET /api/tasks/daily/
 */
export const getDailyTasks = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const driver = await Driver.findOne({ user: userId });
  if (!driver) {
    // Return empty data instead of error if driver profile doesn't exist
    // This happens when user has driver role but hasn't completed registration
    return res.json({
      status: 'success',
      data: {
        tasks: [],
        completed_tasks: [],
        total_earnings: 0,
        total_distance: 0,
        total_rides: 0,
      },
    });
  }

  // Get today's rides
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRides = await Ride.find({
    driver: driver._id,
    createdAt: { $gte: today, $lt: tomorrow },
  }).sort({ createdAt: -1 });

  // Calculate today's stats
  const completedRides = todayRides.filter((r) => r.status === 'completed').length;
  const cancelledRides = todayRides.filter((r) => r.status === 'cancelled').length;
  const totalEarnings = todayRides
    .filter((r) => r.status === 'completed' && r.paymentStatus === 'completed')
    .reduce((sum, r) => sum + (r.fare?.totalFare || 0), 0);

  res.json({
    status: 'success',
    data: {
      tasks: {
        total_rides: todayRides.length,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        total_earnings: totalEarnings,
        active_ride: await Ride.findActiveRideForDriver(driver._id) ? true : false,
      },
      rides: todayRides.map((ride) => ({
        ride_id: ride._id.toString(),
        status: ride.status,
        fare: ride.fare?.totalFare || 0,
        created_at: ride.createdAt,
      })),
    },
  });
});

/**
 * Format driver response for mobile app compatibility
 */
const formatDriverResponse = (driver) => {
  return {
    driver_id: driver._id.toString(),
    user_id: driver.user._id.toString(),
    user: {
      user_id: driver.user._id.toString(),
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.user.phone,
      image: driver.user.profileImage,
      role: driver.user.role,
      rating: driver.user.rating || 0,
    },
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
    vehicle_images: driver.vehicleImages || [],
    documents_verified: driver.documentsVerified,
    verification_status: driver.verificationStatus,
    is_online: driver.isOnline,
    is_available: driver.isAvailable,
    earnings: driver.earnings,
    total_rides: driver.totalRides,
    rating: driver.rating,
    acceptance_rate: driver.acceptanceRate,
    cancellation_rate: driver.cancellationRate,
    bank_account: driver.bankAccount || null,
    insurance: driver.insurance || null,
    current_location: driver.currentLocation ? {
      latitude: driver.currentLocation.coordinates[1],
      longitude: driver.currentLocation.coordinates[0],
      address: driver.currentLocation.address,
    } : null,
  };
};

/**
 * Format ride response for driver
 */
const formatRideForDriver = (ride) => {
  const clientStatus = mapRideStatusForClientApi(ride.status);
  return {
    ride_id: ride._id.toString(),
    passenger: ride.rider ? {
      user_id: ride.rider._id.toString(),
      name: ride.rider.name,
      phone: ride.rider.phone,
      passenger_phone_number: ride.rider.phone,
      passenger_name: ride.rider.name,
      passenger_image: ride.rider.profileImage,
      passenger_id: ride.rider._id.toString(),
      image: ride.rider.profileImage,
      rating: ride.rider.rating || 0,
    } : null,
    origin: {
      lat: ride.pickupLocation.coordinates[1].toString(),
      long: ride.pickupLocation.coordinates[0].toString(),
      name: ride.pickupLocation.name || ride.pickupLocation.address,
      address: ride.pickupLocation.address,
    },
    destination: {
      lat: ride.dropoffLocation.coordinates[1].toString(),
      long: ride.dropoffLocation.coordinates[0].toString(),
      name: ride.dropoffLocation.name || ride.dropoffLocation.address,
      address: ride.dropoffLocation.address,
    },
    status: clientStatus,
    internal_status: ride.status,
    fare: ride.fare?.totalFare || 0,
    payment_method: ride.paymentMethod,
    payment_status: ride.paymentStatus,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    accepted_by_driver: ride.acceptedByDriver,
    is_ride_started: ride.isRideStarted,
    drop_off_completed: ride.dropOffCompleted,
    created_at: ride.createdAt,
  };
};
