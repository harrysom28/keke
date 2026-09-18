import Agent from '../models/Agent.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';

/**
 * Requires an authenticated User who is linked to an active Agent record.
 * Does not change User.role — field agents keep their rider/driver accounts.
 */
export const requireAgent = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new AuthenticationError('Please authenticate first');
  }

  const agent = await Agent.findOne({ user: req.user._id });
  if (!agent) {
    throw new AuthorizationError('This account is not registered as an agent.');
  }
  if (agent.status !== 'active') {
    throw new AuthorizationError('This agent account is not active. Contact support.');
  }

  req.agent = agent;
  req.agentId = agent._id;
  next();
});
