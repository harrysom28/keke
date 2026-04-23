import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    rider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Rider is required'],
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      default: null,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: [true, 'Vehicle type is required'],
    },
    pickupLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        required: [true, 'Pickup address is required'],
      },
      name: String,
    },
    dropoffLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
      address: {
        type: String,
        required: [true, 'Dropoff address is required'],
      },
      name: String,
    },
    status: {
      type: String,
      enum: [
        'requested',
        'searching',
        'scheduled',
        'accepted',
        'driver_en_route',
        'arrived',
        'in-progress',
        'issue_flagged',
        'completed',
        'cancelled',
        'no-driver-found',
      ],
      default: 'requested',
    },
    /**
     * Completion metadata (for stuck-trip fail-safes).
     * - completed_by: who finalized the ride lifecycle
     * - completion_reason: why it was completed/flagged (normal vs forced flows)
     */
    completed_by: {
      type: String,
      enum: ['driver', 'rider', 'admin', 'system'],
      default: null,
    },
    completion_reason: {
      type: String,
      enum: ['normal', 'force', 'timeout', 'issue_flagged', 'admin_resolved'],
      default: null,
    },
    adminNote: { type: String, default: null },
    /**
     * Generic operational flag for non-normal flows (e.g. driver_offline_during_trip, driver_not_ended).
     * String (not enum) so ops can evolve flags without schema churn.
     */
    flag: {
      type: String,
      default: null,
    },
    /**
     * Dispatch attempt counter (offer-based dispatch).
     * We keep this minimal and do not implement retry loops here.
     */
    attempts: { type: Number, default: 0 },
    /** Idempotency flag: ensure "no driver found" is emitted only once per ride. */
    noDriverNotified: { type: Boolean, default: false },
    acceptedByDriver: {
      type: Boolean,
      default: false,
    },
    isRideStarted: {
      type: Boolean,
      default: false,
    },
    dropOffCompleted: {
      type: Boolean,
      default: false,
    },
    fare: {
      baseFare: Number,
      distanceFare: Number,
      timeFare: Number,
      surgeMultiplier: {
        type: Number,
        default: 1.0,
      },
      totalFare: {
        type: Number,
        required: true,
      },
      riderServiceCharge: { type: Number, default: null },
      currency: {
        type: String,
        default: 'NGN',
      },
      commissionRate: Number,
      commissionAmount: Number,
      driverNetAmount: Number,
      platformRevenue: Number,
    },
    distance: {
      value: Number, // in kilometers
      unit: {
        type: String,
        default: 'km',
      },
    },
    duration: {
      estimated: Number, // in minutes
      actual: Number, // in minutes (after completion)
      unit: {
        type: String,
        default: 'minutes',
      },
    },
    route: {
      polyline: String, // Encoded polyline string
      overviewPolyline: String,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'wallet', 'card', 'bank_transfer'],
      required: [true, 'Payment method is required'],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'held', 'charged', 'settled', 'partial'],
      default: 'pending',
    },
    promoCode: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Promocode',
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    rating: {
      riderRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },
      driverRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },
      riderReview: String,
      driverReview: String,
      createdAt: Date,
    },
    cancellation: {
      cancelledBy: {
        type: String,
        enum: ['rider', 'driver', 'system'],
      },
      reason: String,
      cancelledAt: Date,
      cancellationFee: {
        type: Number,
        default: 0,
      },
      cancellationScenario: {
        type: String,
        enum: ['beforeAccept', 'afterAccept', 'afterArrival', 'driverCancel'],
        default: undefined,
      },
    },
    // Scheduled ride
    isScheduled: {
      type: Boolean,
      default: false,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    // Status timestamps
    acceptedAt: {
      type: Date,
      default: null,
    },
    arrivedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    statusHistory: [
      {
        status: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        note: String,
      },
    ],
    // Driver arrival
    arrivalDistance: {
      type: Number, // in meters
      default: null,
    },
    arrivalTime: {
      type: Number, // in minutes
      default: null,
    },
    /** Geofence validation audit for "driver arrived at pickup" (dispute resolution). */
    arrival_coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    arrival_distance_from_pickup: { type: Number, default: null }, // meters
    arrival_proximity_status: {
      type: String,
      enum: ['confirmed', 'probable', 'unlikely', 'unverifiable', 'blocked'],
      default: null,
    },
    arrival_flagged: { type: Boolean, default: false },
    arrival_flag_reason: { type: String, default: null },
    arrived_at: { type: Date, default: null },
    // Real-time tracking
    tracking: {
      currentLocation: {
        type: {
          type: String,
          enum: ['Point'],
        },
        coordinates: [Number],
      },
      lastUpdated: Date,
    },
    // Change/refund
    changeAmount: {
      type: Number,
      default: 0,
    },
    refundAmount: {
      type: Number,
      default: 0,
    },
    // Driver movement tracking (abuse guard: rider free cancel if driver not approaching)
    driverLocationHistory: [
      {
        coords: { lat: Number, lng: Number },
        distance: Number,
        timestamp: Date,
      },
    ],
    driverMovementFlag: { type: String, default: null },
    /** Drivers who have already been notified (socket) for this ride — used to rotate to the next match */
    notifiedDriverIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Driver',
        },
      ],
      default: [],
    },
    /** Per-offer ACK tracking (sent → delivered → accept) */
    offerTracking: [
      {
        driver: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Driver',
        },
        sentAt: { type: Date, default: null },
        deliveredAt: { type: Date, default: null },
        acceptedAt: { type: Date, default: null },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
rideSchema.index({ rider: 1, createdAt: -1 });
rideSchema.index({ driver: 1, createdAt: -1 });
rideSchema.index({ rider: 1, status: 1 }); // findActiveRideForRider
rideSchema.index({ driver: 1, status: 1 }); // findActiveRideForDriver
rideSchema.index({ status: 1 });
rideSchema.index({ arrival_flagged: 1, createdAt: -1 });
rideSchema.index({ 'pickupLocation': '2dsphere' });
rideSchema.index({ 'dropoffLocation': '2dsphere' });
rideSchema.index({ paymentStatus: 1 });
rideSchema.index({ scheduledAt: 1 });
rideSchema.index({ createdAt: -1 });

// Virtual for ride ID (for compatibility with mobile app)
rideSchema.virtual('ride_id').get(function () {
  return this._id.toString();
});

// Virtual for cost (alias for fare.totalFare for mobile app compatibility)
rideSchema.virtual('cost').get(function () {
  return this.fare.totalFare;
});

// Update status and add to history
rideSchema.methods.updateStatus = async function (newStatus, note = null) {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    timestamp: new Date(),
    note,
  });
  await this.save();
};

// Mark ride as started
rideSchema.methods.startRide = async function () {
  this.status = 'in-progress';
  this.isRideStarted = true;
  this.startedAt = new Date();
  this.statusHistory.push({
    status: 'in-progress',
    timestamp: new Date(),
    note: 'Ride started',
  });
  await this.save();
};

// Complete ride
rideSchema.methods.completeRide = async function () {
  this.status = 'completed';
  this.dropOffCompleted = true;
  this.completedAt = new Date();
  this.paymentStatus = 'completed';
  this.statusHistory.push({
    status: 'completed',
    timestamp: new Date(),
    note: 'Ride completed',
  });
  await this.save();
};

// Cancel ride
rideSchema.methods.cancelRide = async function (cancelledBy, reason = null, fee = 0, cancellationScenario = null) {
  this.status = 'cancelled';
  this.cancellation = {
    cancelledBy,
    reason,
    cancelledAt: new Date(),
    cancellationFee: fee,
    ...(cancellationScenario && { cancellationScenario }),
  };
  if (cancellationScenario) {
    this.paymentStatus =
      cancellationScenario === 'beforeAccept' || cancellationScenario === 'driverCancel' ? 'refunded' : 'partial';
  }
  this.statusHistory.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: `Cancelled by ${cancelledBy}: ${reason || 'No reason provided'}`,
  });
  await this.save();
};

// Static method to find active ride for rider
rideSchema.statics.findActiveRideForRider = async function (riderId) {
  return this.findOne({
    rider: riderId,
    status: {
      $in: ['requested', 'searching', 'accepted', 'driver_en_route', 'arrived', 'in-progress'],
    },
  })
    .populate('driver', 'user vehicleDetails currentLocation')
    .populate('driver.user', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ createdAt: -1 });
};

/**
 * Driver "active" ride: excludes scheduled pickups whose time has not arrived yet,
 * so accepting a future booking does not block the dashboard / map as ongoing.
 */
rideSchema.statics.findActiveRideForDriver = async function (driverId) {
  const now = new Date();
  return this.findOne({
    driver: driverId,
    status: { $in: ['accepted', 'driver_en_route', 'arrived', 'in-progress'] },
    $or: [
      { isScheduled: { $ne: true } },
      {
        isScheduled: true,
        $or: [{ scheduledAt: { $lte: now } }, { scheduledAt: null }, { scheduledAt: { $exists: false } }],
      },
    ],
  })
    .populate('rider', 'name phone profileImage rating')
    .populate('vehicleType')
    .sort({ createdAt: -1 });
};

const Ride = mongoose.model('Ride', rideSchema);

export default Ride;
