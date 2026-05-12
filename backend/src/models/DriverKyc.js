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
    // Photo of the government-issued ID document the driver chose under
    // `idType` (e.g. national ID card, voter's card, passport). This is the
    // "national/government ID" image collected as `id_card_image_name` on
    // the mobile registration form.
    idImageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    // Photo of the driver's license document, collected as
    // `licence_image_name` on the mobile registration form. Stored
    // separately from `idImageUrl` because we collect BOTH on registration
    // and admins need to review them side-by-side. Optional in the schema
    // (defaults to null) so existing records created before this field
    // existed continue to load cleanly. The controller persistence layer
    // stamps 'pending' as a sentinel when the upload hasn't completed yet,
    // matching the existing convention used for idImageUrl/selfieUrl.
    licenseImageUrl: {
      type: String,
      default: null,
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
