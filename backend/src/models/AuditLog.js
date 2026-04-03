import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminEmail: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'user_activate',
        'user_deactivate',
        'user_delete',
        'driver_approve',
        'driver_reject',
        'refund',
        'dispute_resolve',
        'withdrawal_approve',
        'withdrawal_reject',
        'vehicle_type_delete',
        'settings_update',
        'promocode_create',
        'promocode_update',
      ],
      index: true,
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['user', 'driver', 'payment', 'ride', 'withdrawal', 'vehicle_type', 'promocode', 'settings'],
    },
    resourceId: {
      type: String,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ adminId: 1, createdAt: -1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

export default mongoose.model('AuditLog', auditLogSchema);
