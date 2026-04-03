/**
 * KEKE — PickupPoint model (optional legacy / admin-defined points)
 * Used by place details when place_id is a Mongo ObjectId.
 */

import mongoose from 'mongoose';

const pickupPointSchema = new mongoose.Schema(
  {
    name: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number], // [lng, lat]
    },
    city: String,
    state: String,
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pickupPointSchema.index({ location: '2dsphere' });

export default mongoose.model('PickupPoint', pickupPointSchema);
