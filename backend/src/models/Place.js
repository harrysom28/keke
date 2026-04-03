/**
 * KEKE — Place model (seeded + learned places)
 * Used by local place search, seeder, and place intelligence pipeline.
 */

import mongoose from 'mongoose';

const placeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: true },
    aliases: [String],
    category: String,
    city: { type: String, required: true, index: true },
    state: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number], // [lng, lat] GeoJSON
    },
    source: { type: String, default: 'seeded' }, // 'seeded' | 'learned' | 'google_cached'
    popularity: { type: Number, default: 5 },
    rideCount: { type: Number, default: 0 },
    verified: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

placeSchema.index({ location: '2dsphere' });
placeSchema.index({ city: 1, name: 1 });
placeSchema.index({ city: 1, popularity: -1 });

export default mongoose.model('Place', placeSchema);
