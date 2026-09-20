import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
      trim: true,
    },
    email: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
    },
    // OTP-only: password never required. Optional for legacy/email recovery.
    password: {
      type: String,
      required: false,
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    profileImage: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['passenger', 'driver', 'admin', 'agents_manager'],
      default: 'passenger',
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isRegVerified: {
      type: Boolean,
      default: false,
    },
    isRegCompleted: {
      type: Boolean,
      default: false,
    },
    // Progressive onboarding: rider_complete | driver_stage1..4 | driver_complete (null/undefined until set)
    onboardingStage: {
      type: String,
      enum: [null, 'rider_complete', 'driver_stage1', 'driver_stage2', 'driver_stage3', 'driver_stage4', 'driver_complete'],
      default: null,
    },
    // KYC status for drivers: pending | verified | rejected (null/undefined until set)
    kycStatus: {
      type: String,
      enum: [null, 'pending', 'verified', 'rejected'],
      default: null,
    },
    dateOfBirth: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRides: {
      type: Number,
      default: 0,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      default: undefined,
      set: (v) => (v == null ? undefined : v),
    },
    address: {
      type: String,
      default: null,
    },
    city: {
      type: String,
      default: null,
    },
    state: {
      type: String,
      default: null,
    },
    country: {
      type: String,
      default: 'Nigeria',
    },
    // Current location (for passengers)
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: undefined,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: undefined,
      },
      address: {
        type: String,
        default: null,
      },
      lastUpdated: {
        type: Date,
        default: undefined,
      },
    },
    // Saved addresses/locations
    addresses: [
      {
        name: String,
        normalisedLabel: {
          type: String,
          default: null,
        },
        address: String,
        location: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point',
          },
          coordinates: {
            type: [Number],
            required: true,
          },
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        lastUsed: {
          type: Date,
          default: Date.now,
        },
        useCount: {
          type: Number,
          default: 1,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // Wallet/Balance
    balance: {
      type: Number,
      default: 0,
    },
    // Top-up bank account details
    topupAccountName: {
      type: String,
      default: null,
    },
    topupAccountNumber: {
      type: String,
      default: null,
    },
    topupBankName: {
      type: String,
      default: null,
    },
    // Paystack customer code (CUS_xxx) - links user to Paystack for DVA
    paystackCustomerCode: {
      type: String,
      default: null,
      sparse: true,
    },
    // Dedicated Virtual Account (DVA) - displayed on Wallet screen for bank transfer top-up
    dvaAccountNumber: {
      type: String,
      default: null,
    },
    dvaBankName: {
      type: String,
      default: null,
    },
    dvaAccountName: {
      type: String,
      default: null,
    },
    // Wallet account number (KEKE + last 8 of user ID) - fallback when Paystack DVA not available
    walletAccountNumber: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    // Google OAuth
    googleId: {
      type: String,
      default: null,
      sparse: true,
    },
    // Emergency contacts
    emergencyContacts: [
      {
        name: {
          type: String,
          required: true,
        },
        phone: {
          type: String,
          required: true,
        },
        relationship: {
          type: String,
          default: 'emergency',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    policeEmergencyContact: {
      type: String,
      default: null,
    },
    // Referral
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    referredByAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      default: null,
      index: true,
    },
    // Device info for push notifications
    deviceId: {
      type: String,
      default: null,
    },
    deviceToken: {
      type: String,
      default: null,
    },
    fcm_token: {
      type: String,
      default: null,
    },
    expoPushToken: {
      type: String,
      default: null,
    },
    pushTokenType: {
      type: String,
      default: null,
    },
    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
    },
    // Milestone rewards (e.g. free ride after 10 completed rides)
    tenRideFreeClaimed: {
      type: Boolean,
      default: false,
    },
    // Referral rewards - how many times user has claimed (each claim = 1 tier)
    referralRewardsClaimedCount: {
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
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 }, { unique: true, sparse: true }); // Sparse index allows multiple null values
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ referralCode: 1 });
userSchema.index({ onboardingStage: 1 });
userSchema.index({ kycStatus: 1 });
userSchema.index({ 'currentLocation': '2dsphere' });
userSchema.index({ 'addresses.location': '2dsphere' });
userSchema.index({ _id: 1, 'addresses.normalisedLabel': 1 });

// Virtual for user ID (for compatibility with mobile app)
userSchema.virtual('user_id').get(function () {
  return this._id.toString();
});

// Ensure at least one identifier exists (phone or email).
// Allow name to be empty until registration is completed.
userSchema.pre('validate', function (next) {
  if (!this.phone && !this.email) {
    this.invalidate('email_phone_number', 'Email or phone number is required');
  }

  if (this.isRegCompleted && !this.name && !this.onboardingStage) {
    this.invalidate('name', 'Name is required');
  }

  // Prevent invalid GeoJSON from being written (breaks 2dsphere indexes).
  // If currentLocation has no valid coordinates, drop it entirely.
  if (
    this.currentLocation &&
    (!Array.isArray(this.currentLocation.coordinates) ||
      this.currentLocation.coordinates.length !== 2 ||
      this.currentLocation.coordinates.some((n) => typeof n !== 'number'))
  ) {
    this.currentLocation = undefined;
  }

  next();
});

// Coerce legacy/invalid role values so saves don't fail enum validation
userSchema.pre('save', function (next) {
  const validRoles = ['passenger', 'driver', 'admin', 'agents_manager'];
  if (this.role && !validRoles.includes(this.role)) {
    this.role = 'passenger';
  }
  next();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Set walletAccountNumber before first save to avoid unique index conflict on null
userSchema.pre('save', function (next) {
  if (!this.walletAccountNumber && this._id) {
    this.walletAccountNumber = 'KEKE' + this._id.toString().slice(-8).toUpperCase();
  }
  next();
});

// Generate referral code before saving
userSchema.pre('save', async function (next) {
  if (!this.referralCode && this.role === 'passenger') {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const existingUser = await mongoose.model('User').findOne({ referralCode: randomCode });
    
    if (!existingUser) {
      this.referralCode = randomCode;
    } else {
      // Regenerate if collision (unlikely but handle it)
      this.referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    }
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if user is deleted
userSchema.methods.isDeleted = function () {
  return this.deletedAt !== null;
};

// Method to soft delete
userSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  this.isActive = false;
  await this.save();
};

// Exclude deleted users from queries by default
userSchema.pre(/^find/, function (next) {
  if (this.getOptions().includeDeleted !== true) {
    this.find({ deletedAt: null });
  }
  next();
});

const User = mongoose.model('User', userSchema);

export default User;
