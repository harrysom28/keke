import mongoose from 'mongoose';

/**
 * Per-driver bounty ledger. Phase 1 stores the schema only —
 * payout automation lands with recruitment cycles.
 */
const agentPayoutSchema = new mongoose.Schema(
  {
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
      required: true,
      index: true,
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentTarget',
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['owed', 'approved', 'paid', 'void'],
      default: 'owed',
      index: true,
    },
    reason: {
      type: String,
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

agentPayoutSchema.index({ agent: 1, driver: 1 }, { unique: true });

const AgentPayout = mongoose.model('AgentPayout', agentPayoutSchema);
export default AgentPayout;
