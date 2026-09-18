import mongoose from 'mongoose';

const agentTargetSchema = new mongoose.Schema(
  {
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agent',
      required: true,
      index: true,
    },
    cycleName: {
      type: String,
      trim: true,
      default: 'Recruitment cycle',
    },
    targetCount: {
      type: Number,
      required: true,
      min: 1,
    },
    deadline: {
      type: Date,
      required: true,
    },
    bountyRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
      index: true,
    },
  },
  { timestamps: true }
);

agentTargetSchema.index({ agent: 1, status: 1 });

const AgentTarget = mongoose.model('AgentTarget', agentTargetSchema);
export default AgentTarget;
