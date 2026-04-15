import mongoose from 'mongoose';

const rideOfferSchema = new mongoose.Schema(
  {
    ride_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    driver_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'rejected'],
      default: 'pending',
      index: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
    accepted_at: { type: Date, default: null },
    rejected_at: { type: Date, default: null },
    expired_at: { type: Date, default: null },
    notified_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Prevent duplicate offers to same driver for same ride.
rideOfferSchema.index({ ride_id: 1, driver_id: 1 }, { unique: true });

const RideOffer = mongoose.model('RideOffer', rideOfferSchema);

export default RideOffer;

