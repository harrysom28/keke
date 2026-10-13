import mongoose from 'mongoose';

/**
 * Per-driver bounty ledger for a recruitment cycle.
 * Unique on agent+driver+target so a later cycle does not overwrite an earlier one.
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
      required: true,
      index: true,
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

agentPayoutSchema.index({ agent: 1, driver: 1, target: 1 }, { unique: true });

const AgentPayout = mongoose.model('AgentPayout', agentPayoutSchema);

async function dropLegacyAgentDriverUnique() {
  try {
    await AgentPayout.collection.dropIndex('agent_1_driver_1');
  } catch (err) {
    if (err?.code !== 27 && err?.codeName !== 'IndexNotFound') {
      // Index may never have existed in this environment.
    }
  }
}

if (mongoose.connection.readyState === 1) {
  dropLegacyAgentDriverUnique();
} else {
  mongoose.connection.once('connected', dropLegacyAgentDriverUnique);
}

export default AgentPayout;
