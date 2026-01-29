import mongoose from 'mongoose';

const promocodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Promo code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9]+$/, 'Promo code must contain only uppercase letters and numbers'],
    },
    description: {
      type: String,
      default: null,
    },
    discountType: {
      type: String,
      enum: ['percentage', 'fixed'],
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: 0,
    },
    maxDiscount: {
      type: Number,
      default: null, // Maximum discount for percentage type
    },
    minAmount: {
      type: Number,
      default: 0, // Minimum ride amount to use this code
    },
    maxUses: {
      type: Number,
      default: null, // Null means unlimited
      min: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxUsesPerUser: {
      type: Number,
      default: 1,
      min: 1,
    },
    validFrom: {
      type: Date,
      required: [true, 'Valid from date is required'],
    },
    validTo: {
      type: Date,
      required: [true, 'Valid to date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableUserTypes: [
      {
        type: String,
        enum: ['passenger', 'driver', 'all'],
        default: 'all',
      },
    ],
    applicableVehicleTypes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VehicleType',
      },
    ],
    // Usage tracking
    usedBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        ride: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Ride',
        },
        usedAt: {
          type: Date,
          default: Date.now,
        },
        discountAmount: Number,
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
promocodeSchema.index({ code: 1 }, { unique: true });
promocodeSchema.index({ isActive: 1 });
promocodeSchema.index({ validFrom: 1, validTo: 1 });

// Method to check if code is valid
promocodeSchema.methods.isValid = function (user, rideAmount = 0, vehicleType = null) {
  const now = new Date();

  // Check if code is active
  if (!this.isActive) {
    return { valid: false, message: 'Promo code is not active' };
  }

  // Check date validity
  if (now < this.validFrom) {
    return { valid: false, message: 'Promo code is not yet valid' };
  }

  if (now > this.validTo) {
    return { valid: false, message: 'Promo code has expired' };
  }

  // Check max uses
  if (this.maxUses !== null && this.usedCount >= this.maxUses) {
    return { valid: false, message: 'Promo code has reached maximum uses' };
  }

  // Check minimum amount
  if (rideAmount < this.minAmount) {
    return {
      valid: false,
      message: `Minimum ride amount of ${this.minAmount} required to use this code`,
    };
  }

  // Check user type applicability
  if (
    !this.applicableUserTypes.includes('all') &&
    !this.applicableUserTypes.includes(user.role)
  ) {
    return { valid: false, message: 'Promo code is not applicable to your account type' };
  }

  // Check vehicle type applicability (if specified)
  if (
    this.applicableVehicleTypes.length > 0 &&
    vehicleType &&
    !this.applicableVehicleTypes.includes(vehicleType.toString())
  ) {
    return { valid: false, message: 'Promo code is not applicable to this vehicle type' };
  }

  // Check per-user usage limit
  const userUsageCount = this.usedBy.filter(
    (usage) => usage.user.toString() === user._id.toString()
  ).length;
  if (userUsageCount >= this.maxUsesPerUser) {
    return { valid: false, message: 'You have already used this promo code maximum times' };
  }

  return { valid: true, message: 'Promo code is valid' };
};

// Method to calculate discount
promocodeSchema.methods.calculateDiscount = function (rideAmount) {
  let discount = 0;

  if (this.discountType === 'percentage') {
    discount = (rideAmount * this.discountValue) / 100;
    if (this.maxDiscount && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else {
    discount = this.discountValue;
  }

  // Discount cannot exceed ride amount
  discount = Math.min(discount, rideAmount);

  return Math.round(discount * 100) / 100; // Round to 2 decimal places
};

// Method to apply code
promocodeSchema.methods.applyCode = async function (user, ride, discountAmount) {
  this.usedCount += 1;
  this.usedBy.push({
    user: user._id,
    ride: ride._id,
    usedAt: new Date(),
    discountAmount,
  });
  await this.save();
};

const Promocode = mongoose.model('Promocode', promocodeSchema);

export default Promocode;
