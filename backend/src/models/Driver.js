import mongoose from 'mongoose';
import {
  DRIVER_LOCATION_MAX_AGE_MS,
  DRIVER_STALE_OFFLINE_MS,
} from '../utils/driverSearchRadius.js';

const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Driver must be associated with a user'],
      // One driver profile per user — used as the idempotency key for POST /driver/create
      unique: true,
    },
    licenseNumber: {
      type: String,
      required: [true, 'License number is required'],
      unique: true,
      trim: true,
    },
    licenseExpiry: {
      type: Date,
      required: [true, 'License expiry date is required'],
    },
    vehicleDetails: {
      make: {
        type: String,
        required: [true, 'Vehicle make is required'],
      },
      model: {
        type: String,
        required: [true, 'Vehicle model is required'],
      },
      year: {
        type: Number,
        required: [true, 'Vehicle year is required'],
        min: [1900, 'Invalid vehicle year'],
        max: [new Date().getFullYear() + 1, 'Invalid vehicle year'],
      },
      plateNumber: {
        type: String,
        required: [true, 'Plate number is required'],
        unique: true,
        uppercase: true,
        trim: true,
      },
      color: {
        type: String,
        required: [true, 'Vehicle color is required'],
      },
      vehicleType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VehicleType',
        required: [true, 'Vehicle type is required'],
      },
    },
    vehicleImages: [
      {
        type: {
          type: String,
          enum: ['front', 'back', 'side', 'interior', 'license'],
        },
        url: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    documentsVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      default: null,
    },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0],
      },
      address: {
        type: String,
        default: null,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      default: false,
    },
    earnings: {
      total: {
        type: Number,
        default: 0,
      },
      today: {
        type: Number,
        default: 0,
      },
      thisWeek: {
        type: Number,
        default: 0,
      },
      thisMonth: {
        type: Number,
        default: 0,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },
    totalRides: {
      type: Number,
      default: 0,
    },
    rating: {
      average: {
        type: Number,
        default: 0,
        min: 0,
        max: 5,
      },
      count: {
        type: Number,
        default: 0,
      },
    },
    acceptanceRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    cancellationRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    // Insurance details
    insurance: {
      provider: String,
      policyNumber: String,
      expiryDate: Date,
      documentUrl: String,
    },
    // Bank account for payouts
    bankAccount: {
      accountName: String,
      accountNumber: String,
      bankName: String,
      bankCode: String,
      verified: {
        type: Boolean,
        default: false,
      },
    },
    // Availability schedule
    availability: {
      monday: { start: String, end: String, available: Boolean },
      tuesday: { start: String, end: String, available: Boolean },
      wednesday: { start: String, end: String, available: Boolean },
      thursday: { start: String, end: String, available: Boolean },
      friday: { start: String, end: String, available: Boolean },
      saturday: { start: String, end: String, available: Boolean },
      sunday: { start: String, end: String, available: Boolean },
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    /** When current online session started (null if offline / between sessions). */
    onlineSessionStartedAt: {
      type: Date,
      default: null,
    },
    /** UTC date key (YYYY-MM-DD) for todayOnlineMs rollover. */
    statsDate: {
      type: String,
      default: null,
    },
    /** Milliseconds online today (excludes current open session; add live delta in API). */
    todayOnlineMs: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
driverSchema.index({ user: 1 }, { unique: true });
driverSchema.index({ 'currentLocation': '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1 });
driverSchema.index({ documentsVerified: 1 });
driverSchema.index({ verificationStatus: 1 });
driverSchema.index({ 'vehicleDetails.plateNumber': 1 }, { unique: true });

// Virtual for driver ID (for compatibility with mobile app)
driverSchema.virtual('driver_id').get(function () {
  return this._id.toString();
});

// Method to update location
driverSchema.methods.updateLocation = async function (coordinates, address = null) {
  this.currentLocation.coordinates = coordinates;
  if (address) {
    this.currentLocation.address = address;
  }
  this.currentLocation.lastUpdated = new Date();
  await this.save();
};

// Method to go online
driverSchema.methods.goOnline = async function () {
  this.isOnline = true;
  this.lastActiveAt = new Date();
  await this.save();
};

// Method to go offline
driverSchema.methods.goOffline = async function () {
  this.isOnline = false;
  this.isAvailable = false;
  await this.save();
};

// Method to update earnings
driverSchema.methods.addEarnings = async function (amount) {
  this.earnings.total += amount;
  this.earnings.today += amount;
  this.earnings.thisWeek += amount;
  this.earnings.thisMonth += amount;
  this.earnings.lastUpdated = new Date();
  await this.save();
};

/** Mark drivers with stale location heartbeats as offline (fire-and-forget). */
driverSchema.statics.markStaleDriversOffline = function () {
  const cutoff = new Date(Date.now() - DRIVER_STALE_OFFLINE_MS);
  return this.updateMany(
    {
      isOnline: true,
      $or: [
        { 'currentLocation.lastUpdated': { $lt: cutoff } },
        { 'currentLocation.lastUpdated': { $exists: false } },
      ],
    },
    { $set: { isOnline: false, isAvailable: false } }
  ).exec();
};

// Static method to find nearby available drivers
driverSchema.statics.findNearbyAvailable = async function (latitude, longitude, maxDistanceKm = 15) {
  const logger = (await import('../utils/logger.js')).default;
  // Same window the stale-offline sweeper uses: any driver still counted as
  // online must also be matchable (see driverSearchRadius.js).
  const locationFreshSince = new Date(Date.now() - DRIVER_LOCATION_MAX_AGE_MS);

  try {
    const drivers = await this.find({
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
      'currentLocation.lastUpdated': { $gte: locationFreshSince },
      'currentLocation.coordinates.0': { $ne: 0 },
      'currentLocation.coordinates.1': { $ne: 0 },
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceKm * 1000,
        },
      },
    })
      .populate('user', 'name email phone profileImage rating')
      .populate('vehicleDetails.vehicleType')
      // No explicit sort: $near already orders nearest-first, which is what
      // both consumers want when >20 drivers are in radius (the previous
      // .sort({ rating: -1 }) keyed on `rating`, an OBJECT field — the scalar
      // is rating.average — so it scrambled distance order for nothing).
      // Preview re-sorts by distance and dispatch re-scores anyway.
      .limit(20);

    logger.info(
      `Geospatial query found ${drivers.length} fresh drivers within ${maxDistanceKm}km`
    );
    return drivers;
  } catch (error) {
    logger.warn(`Geospatial query failed for nearby drivers: ${error.message}`);
    return [];
  }
};

const Driver = mongoose.model('Driver', driverSchema);

export default Driver;
