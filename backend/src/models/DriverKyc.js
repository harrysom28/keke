import mongoose from 'mongoose';

/**
 * driver_kyc - identity verification (Stage 2)
 * Stores ID document and selfie for KYC review
 */
const driverKycSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    idType: {
      type: String,
      enum: ['national_id', 'voters_card', 'drivers_license', 'passport'],
      required: true,
    },
    idNumber: {
      type: String,
      required: true,
      trim: true,
    },
    idImageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    selfieUrl: {
      type: String,
      required: true,
      trim: true,
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

driverKycSchema.index({ userId: 1 }, { unique: true });

const DriverKyc = mongoose.model('DriverKyc', driverKycSchema);
export default DriverKyc;
