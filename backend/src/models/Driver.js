import mongoose from 'mongoose';

const driverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Driver must be associated with a user'],
      // One driver profile per user — used as the idempotency key for POST /driver/create
      unique: true,
    },
    referredByAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
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
    // No defaults. A new driver leaves this unset so the 2dsphere index
    // does not store a [0, 0] placeholder. lastRealFixAt is written only
    // when a client sends a valid non-zero fix with capturedAt.
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
      },
      address: {
        type: String,
        default: undefined,
      },
      lastUpdated: {
        type: Date,
      },
      lastRealFixAt: {
        type: Date,
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
    /** Last "location stopped updating" push. At most one per hour. */
    lastGpsNudgeAt: {
      type: Date,
      default: null,
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
    /**
     * An agent can flag a registration they created. Only an admin can approve
     * it, and approval is what actually deletes the records.
     * A rejected flag can be raised again. A pending one cannot be duplicated.
     */
    voidRequest: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
      requestedAt: { type: Date },
      reason: { type: String },
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      adminNote: { type: String, default: null },
      resolvedAt: { type: Date, default: null },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
// Equality on vehicle type + $near on currentLocation (findNearbyAvailable when vehicleTypeId is set).
driverSchema.index({ 'vehicleDetails.vehicleType': 1, currentLocation: '2dsphere' });
driverSchema.index({ isOnline: 1, isAvailable: 1 });
driverSchema.index({ documentsVerified: 1 });
driverSchema.index({ verificationStatus: 1 });
driverSchema.index({ 'vehicleDetails.plateNumber': 1 }, { unique: true });

// Drop a half-built currentLocation so a new driver is stored without the
// field. An explicit [0, 0] is left in place; the one-off migration unsets those.
driverSchema.pre('validate', function (next) {
  const coords = this.currentLocation?.coordinates;
  const valid =
    Array.isArray(coords) &&
    coords.length === 2 &&
    coords.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (this.currentLocation && !valid) {
    this.currentLocation = undefined;
  }
  next();
});

// Virtual for driver ID (for compatibility with mobile app)
driverSchema.virtual('driver_id').get(function () {
  return this._id.toString();
});

// Method to update location. capturedAt, when valid, is the real-fix time.
driverSchema.methods.updateLocation = async function (coordinates, address = null, capturedAt = null) {
  if (!this.currentLocation || !Array.isArray(this.currentLocation.coordinates)) {
    this.currentLocation = { type: 'Point', coordinates };
  } else {
    this.currentLocation.coordinates = coordinates;
  }
  this.currentLocation.type = 'Point';
  if (address) {
    this.currentLocation.address = address;
  }
  this.currentLocation.lastUpdated = new Date();
  if (capturedAt) {
    this.currentLocation.lastRealFixAt = capturedAt instanceof Date ? capturedAt : new Date(capturedAt);
  }
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

/**
 * Nearby approved/online/available drivers within maxDistanceKm of (lat, lng).
 * When vehicleTypeId is set, the geo query itself filters by vehicle type so
 * the .limit(20) returns 20 of the right type — not 20 of any type that a
 * later post-filter then discards.
 */
driverSchema.statics.findNearbyAvailable = async function (
  latitude,
  longitude,
  maxDistanceKm = 15,
  vehicleTypeId = null
) {
  const logger = (await import('../utils/logger.js')).default;
  // Only drivers with a fresh real fix are matchable. The Online toggle itself
  // stays on until they go offline (see driverSearchRadius.js). lastRealFixAt
  // is the source of truth once a client fix has landed; until then a driver
  // saved before that field existed still matches on lastUpdated.
  const { getLocationMaxAgeMs } = await import('../utils/driverSearchRadius.js');
  const { realFixFreshnessClause } = await import('../utils/driverGpsFix.js');
  const locationFreshSince = new Date(Date.now() - (await getLocationMaxAgeMs()));

  try {
    const filter = {
      isOnline: true,
      isAvailable: true,
      documentsVerified: true,
      verificationStatus: 'approved',
      'currentLocation.coordinates.0': { $ne: 0 },
      'currentLocation.coordinates.1': { $ne: 0 },
      ...realFixFreshnessClause(locationFreshSince),
      currentLocation: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          $maxDistance: maxDistanceKm * 1000,
        },
      },
    };

    if (vehicleTypeId) {
      filter['vehicleDetails.vehicleType'] = new mongoose.Types.ObjectId(vehicleTypeId);
    }

    const drivers = await this.find(filter)
      .populate('user', 'name email phone profileImage rating')
      .populate('vehicleDetails.vehicleType')
      // No explicit sort: $near already orders nearest-first, which is what
      // both consumers want when >20 drivers are in radius (the previous
      // .sort({ rating: -1 }) keyed on `rating`, an OBJECT field — the scalar
      // is rating.average — so it scrambled distance order for nothing).
      // Preview re-sorts by distance and dispatch re-scores anyway.
      .limit(20);

    logger.info(
      `Geospatial query found ${drivers.length} fresh drivers within ${maxDistanceKm}km` +
        (vehicleTypeId ? ` (vehicleType=${vehicleTypeId})` : '')
    );
    return drivers;
  } catch (error) {
    logger.warn(`Geospatial query failed for nearby drivers: ${error.message}`);
    return [];
  }
};

const Driver = mongoose.model('Driver', driverSchema);

export default Driver;
