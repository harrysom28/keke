import mongoose from 'mongoose';

/**
 * Immutable ride lifecycle audit log.
 * Used for non-normal completions and operational interventions.
 */
const rideAuditLogSchema = new mongoose.Schema(
  {
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
      enum: ['force_complete', 'stale_flag', 'admin_force_complete', 'driver_offline', 'driver_reconnected'],
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    initiatedByRole: {
      type: String,
      enum: [null, 'passenger', 'driver', 'admin', 'system'],
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

rideAuditLogSchema.index({ createdAt: -1 });
rideAuditLogSchema.index({ ride: 1, createdAt: -1 });

export default mongoose.model('RideAuditLog', rideAuditLogSchema);

