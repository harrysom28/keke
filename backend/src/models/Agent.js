import mongoose from 'mongoose';

/**
 * Field agent who onboards drivers. Linked to an existing User
 * (rider/driver account) — we do not introduce a separate auth system.
 */
const agentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: null,
    },
    zone: {
      type: String,
      trim: true,
      default: null,
    },
    park: {
      type: String,
      trim: true,
      default: null,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'flagged'],
      default: 'active',
      index: true,
    },
    /** Naira bounty per activated driver. Payable ledger is Phase 2. */
    bountyRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    bankAccount: {
      accountName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      bankName: { type: String, default: null },
      bankCode: { type: String, default: null },
    },
    notes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

agentSchema.virtual('agent_id').get(function () {
  return this._id.toString();
});

const Agent = mongoose.model('Agent', agentSchema);
export default Agent;
