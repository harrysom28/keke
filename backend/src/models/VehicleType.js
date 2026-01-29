import mongoose from 'mongoose';

const vehicleTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vehicle type name is required'],
      unique: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
    },
    description: {
      type: String,
      default: null,
    },
    image: {
      type: String,
      default: null,
    },
    icon: {
      type: String,
      default: null,
    },
    baseFare: {
      type: Number,
      required: [true, 'Base fare is required'],
      min: 0,
      default: 2.50,
    },
    perKmRate: {
      type: Number,
      required: [true, 'Per kilometer rate is required'],
      min: 0,
      default: 1.50,
    },
    perMinuteRate: {
      type: Number,
      required: [true, 'Per minute rate is required'],
      min: 0,
      default: 0.30,
    },
    multiplier: {
      type: Number,
      default: 1.0,
      min: 0.5,
      max: 5.0,
    },
    capacity: {
      type: Number,
      default: 4, // Number of passengers
      min: 1,
      max: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0, // For sorting
    },
    colors: [
      {
        name: String,
        code: String, // Hex color code
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    models: [
      {
        name: String,
        make: String,
        year: Number,
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
    years: [
      {
        value: Number,
        isActive: {
          type: Boolean,
          default: true,
        },
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
vehicleTypeSchema.index({ name: 1 }, { unique: true });
vehicleTypeSchema.index({ isActive: 1 });
vehicleTypeSchema.index({ order: 1 });

// Virtual for vehicle type ID (for compatibility with mobile app)
vehicleTypeSchema.virtual('vehicle_id').get(function () {
  return this._id.toString();
});

// Virtual for vehicle type image (for compatibility with mobile app)
vehicleTypeSchema.virtual('vehicle_type_image').get(function () {
  return this.image;
});

// Method to get active colors
vehicleTypeSchema.methods.getActiveColors = function () {
  return this.colors.filter((color) => color.isActive);
};

// Method to get active models
vehicleTypeSchema.methods.getActiveModels = function () {
  return this.models.filter((model) => model.isActive);
};

// Method to get active years
vehicleTypeSchema.methods.getActiveYears = function () {
  return this.years
    .filter((year) => year.isActive)
    .map((year) => year.value)
    .sort((a, b) => b - a); // Descending order
};

const VehicleType = mongoose.model('VehicleType', vehicleTypeSchema);

export default VehicleType;
