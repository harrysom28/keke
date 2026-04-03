/**
 * KEKE — PlaceCandidate model (self-learning pipeline)
 * Candidates are promoted to Place after MIN_RIDES_VISIBLE.
 */

import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema(
  {
    snapKey: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    nameHistory: [String],
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: [Number],
    },
    city: String,
    state: String,
    rideCount: { type: Number, default: 1 },
    firstSeen: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    promoted: { type: Boolean, default: false },
    promotedAt: Date,
  },
  { timestamps: true }
);

candidateSchema.index({ location: '2dsphere' });
candidateSchema.index({ city: 1, rideCount: -1 });
candidateSchema.index({ snapKey: 1 }, { unique: true });

export default mongoose.model('PlaceCandidate', candidateSchema);
