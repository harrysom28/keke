import SupportTicket from '../models/SupportTicket.js';
import Ride from '../models/Ride.js';
import { asyncHandler } from '../utils/errors.js';
import { NotFoundError } from '../utils/errors.js';

/**
 * Create support ticket - POST /api/support/tickets
 * User-facing endpoint for riders and drivers to submit support requests.
 */
export const createTicket = asyncHandler(async (req, res) => {
  const { subject, message, rideId, category } = req.body;
  const user = req.user;

  // Validate ride if provided
  let ride = null;
  if (rideId) {
    ride = await Ride.findById(rideId);
    if (!ride) {
      throw new NotFoundError('Ride');
    }
    // Ensure user is rider or driver of this ride
    const isRider = ride.rider?.toString() === user._id.toString();
    const isDriver = ride.driver?.toString() === user._id.toString();
    if (!isRider && !isDriver) {
      throw new NotFoundError('Ride');
    }
  }

  const validCategories = [
    'ride_issue',
    'payment_issue',
    'account_issue',
    'driver_complaint',
    'rider_complaint',
    'technical_issue',
    'general',
    'refund_request',
    'other',
  ];
  const resolvedCategory = validCategories.includes(category) ? category : 'general';

  const ticket = await SupportTicket.create({
    user: user._id,
    ride: ride?._id || null,
    category: resolvedCategory,
    subject: subject.trim(),
    description: message.trim(),
    status: 'open',
    priority: 'medium',
  });

  res.status(201).json({
    status: 'success',
    message: 'Support ticket submitted. We will respond shortly.',
    data: {
      ticketId: ticket._id.toString(),
      status: ticket.status,
    },
  });
});
