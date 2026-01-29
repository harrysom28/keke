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
    password: {
      type: String,
      required: function () {
        // OTP-first signup creates a user before password is chosen.
        // Only require password after registration is completed (or for non-OTP flows),
        // and never require for Google auth.
        return this.isRegCompleted === true && !this.googleId;
      },
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default
    },
    profileImage: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ['passenger', 'driver', 'admin'],
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
    // Device info for push notifications
    deviceId: {
      type: String,
      default: null,
    },
    deviceToken: {
      type: String,
      default: null,
    },
    // Soft delete
    deletedAt: {
      type: Date,
      default: null,
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
userSchema.index({ 'currentLocation': '2dsphere' });
userSchema.index({ 'addresses.location': '2dsphere' });

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

  if (this.isRegCompleted && !this.name) {
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

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
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
