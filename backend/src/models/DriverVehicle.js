import mongoose from 'mongoose';

/**
 * driver_vehicle - vehicle verification (Stage 3)
 * Stores vehicle details and documents for KYC review
 */
const driverVehicleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    vehicleType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    plateNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    make: {
      type: String,
      default: null,
      trim: true,
    },
    model: {
      type: String,
      default: null,
      trim: true,
    },
    year: {
      type: Number,
      default: null,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
    color: {
      type: String,
      default: null,
      trim: true,
    },
    vehicleDocuments: [
      {
        type: { type: String, enum: ['registration', 'roadworthiness', 'other'] },
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    insuranceDocumentUrl: {
      type: String,
      default: null,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

driverVehicleSchema.index({ userId: 1 }, { unique: true });

const DriverVehicle = mongoose.model('DriverVehicle', driverVehicleSchema);
export default DriverVehicle;
