import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import Promocode from '../models/Promocode.js';
import SupportTicket from '../models/SupportTicket.js';
import Notification from '../models/Notification.js';
import Review from '../models/Review.js';
import VehicleType from '../models/VehicleType.js';
import { generateTokenPair, generateAccessToken } from '../utils/jwt.js';
import { AuthenticationError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Admin login - POST /api/admin/login
 */
export const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  logger.info(`Admin login attempt for: ${email}`);

  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Find admin user
  const admin = await User.findOne({ email: email.toLowerCase(), role: 'admin' }).select('+password');
  logger.info(`Admin found: ${!!admin}`);
  if (!admin) {
    throw new AuthenticationError('Invalid credentials');
  }

  // Verify password
  const isPasswordCorrect = await admin.comparePassword(password);
  logger.info(`Password correct: ${isPasswordCorrect}`);
  if (!isPasswordCorrect) {
    throw new AuthenticationError('Invalid credentials');
  }

  if (!admin.isActive) {
    throw new AuthenticationError('Account is deactivated');
  }

  // Generate tokens
  const tokens = generateTokenPair({ id: admin._id, role: admin.role });

  logger.info(`Admin logged in: ${admin.email}`);

  res.json({
    status: 'success',
    message: 'Login successful',
    authorisation: {
      token: tokens.token,
      refresh_token: tokens.refreshToken,
      type: 'bearer',
    },
    data: {
      admin: {
        admin_id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    },
  });
});

/**
 * Admin logout - POST /api/admin/logout
 */
export const adminLogout = asyncHandler(async (req, res) => {
  // In production, implement token blacklist here
  logger.info(`Admin logged out: ${req.user.email}`);

  res.json({
    status: 'success',
    message: 'Logout successful',
  });
});

/**
 * Get admin profile - GET /api/admin/me
 */
export const getAdminProfile = asyncHandler(async (req, res) => {
  const admin = await User.findById(req.user._id);
  if (!admin || admin.role !== 'admin') {
    throw new NotFoundError('Admin');
  }

  res.json({
    status: 'success',
    data: {
      admin: {
        admin_id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        role: admin.role,
        created_at: admin.createdAt,
      },
    },
  });
});

/**
 * Dashboard statistics - GET /api/admin/dashboard/stats
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);
  const thisMonth = new Date(today);
  thisMonth.setMonth(thisMonth.getMonth() - 1);

  // Get statistics
  const [
    totalUsers,
    totalDrivers,
    totalRides,
    totalPayments,
    totalRevenue,
    todayRides,
    todayRevenue,
    weekRides,
    weekRevenue,
    monthRides,
    monthRevenue,
    activeRides,
    pendingDrivers,
    openTickets,
  ] = await Promise.all([
    User.countDocuments({ role: 'passenger' }),
    User.countDocuments({ role: 'driver' }),
    Ride.countDocuments(),
    Payment.countDocuments({ status: 'completed' }),
    Payment.aggregate([
      { $match: { status: 'completed', amount: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Ride.countDocuments({ createdAt: { $gte: today } }),
    Payment.aggregate([
      { $match: { status: 'completed', amount: { $gt: 0 }, createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Ride.countDocuments({ createdAt: { $gte: thisWeek } }),
    Payment.aggregate([
      { $match: { status: 'completed', amount: { $gt: 0 }, createdAt: { $gte: thisWeek } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Ride.countDocuments({ createdAt: { $gte: thisMonth } }),
    Payment.aggregate([
      { $match: { status: 'completed', amount: { $gt: 0 }, createdAt: { $gte: thisMonth } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Ride.countDocuments({ status: { $in: ['requested', 'accepted', 'in-progress'] } }),
    Driver.countDocuments({ verificationStatus: 'pending' }),
    SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }),
  ]);

  res.json({
    status: 'success',
    data: {
      overview: {
        total_users: totalUsers,
        total_drivers: totalDrivers,
        total_rides: totalRides,
        total_payments: totalPayments,
        total_revenue: totalRevenue[0]?.total || 0,
        active_rides: activeRides,
        pending_drivers: pendingDrivers,
        open_tickets: openTickets,
      },
      today: {
        rides: todayRides,
        revenue: todayRevenue[0]?.total || 0,
      },
      this_week: {
        rides: weekRides,
        revenue: weekRevenue[0]?.total || 0,
      },
      this_month: {
        rides: monthRides,
        revenue: monthRevenue[0]?.total || 0,
      },
    },
  });
});

/**
 * Get analytics data - GET /api/admin/analytics
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query; // 7d, 30d, 90d, 1y

  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  // Get ride statistics by status
  const ridesByStatus = await Ride.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  // Get revenue by day
  const revenueByDay = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        amount: { $gt: 0 },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Get user registrations by day
  const usersByDay = await User.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  res.json({
    status: 'success',
    data: {
      period,
      rides_by_status: ridesByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      revenue_by_day: revenueByDay.map((item) => ({
        date: item._id,
        revenue: item.revenue,
        transactions: item.count,
      })),
      users_by_day: usersByDay.map((item) => ({
        date: item._id,
        count: item.count,
      })),
    },
  });
});

/**
 * List users - GET /api/admin/users
 */
export const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, status, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (role) {
    filter.role = role;
  }

  if (status === 'active') {
    filter.isActive = true;
  } else if (status === 'inactive') {
    filter.isActive = false;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }

  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      users: users.map((user) => formatUserResponse(user)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Get user details - GET /api/admin/users/:id
 */
export const getUserDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select('-password');
  if (!user) {
    throw new NotFoundError('User');
  }

  // Get user statistics
  const totalRides = await Ride.countDocuments({ rider: id });
  const completedRides = await Ride.countDocuments({ rider: id, status: 'completed' });
  const totalSpent = await Payment.aggregate([
    { $match: { user: user._id, status: 'completed', amount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  // Get driver info if user is a driver
  let driver = null;
  if (user.role === 'driver') {
    driver = await Driver.findOne({ user: id });
  }

  res.json({
    status: 'success',
    data: {
      user: formatUserResponse(user),
      statistics: {
        total_rides: totalRides,
        completed_rides: completedRides,
        total_spent: totalSpent[0]?.total || 0,
      },
      driver: driver ? formatDriverResponse(driver) : null,
    },
  });
});

/**
 * Update user - PATCH /api/admin/users/:id
 */
export const updateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Update allowed fields
  if (updateData.name) user.name = updateData.name;
  if (updateData.email) {
    // Check if email is already taken
    const existingUser = await User.findOne({ email: updateData.email.toLowerCase(), _id: { $ne: id } });
    if (existingUser) {
      throw new ConflictError('Email is already in use');
    }
    user.email = updateData.email.toLowerCase();
  }
  if (updateData.phone) {
    // Check if phone is already taken
    const existingUser = await User.findOne({ phone: updateData.phone, _id: { $ne: id } });
    if (existingUser) {
      throw new ConflictError('Phone is already in use');
    }
    user.phone = updateData.phone;
  }
  if (updateData.role) user.role = updateData.role;
  if (updateData.isActive !== undefined) user.isActive = updateData.isActive;
  if (updateData.isVerified !== undefined) user.isVerified = updateData.isVerified;
  if (updateData.balance !== undefined) user.balance = updateData.balance;

  await user.save();

  logger.info(`User ${id} updated by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'User updated successfully',
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Activate user - PATCH /api/admin/users/:id/activate
 */
export const activateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User');
  }

  user.isActive = true;
  await user.save();

  logger.info(`User ${id} activated by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'User activated successfully',
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Deactivate user - PATCH /api/admin/users/:id/deactivate
 */
export const deactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User');
  }

  user.isActive = false;
  await user.save();

  logger.info(`User ${id} deactivated by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'User deactivated successfully',
    data: {
      user: formatUserResponse(user),
    },
  });
});

/**
 * Delete user - DELETE /api/admin/users/:id
 */
export const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id);
  if (!user) {
    throw new NotFoundError('User');
  }

  // Soft delete
  await user.softDelete();

  logger.info(`User ${id} deleted by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'User deleted successfully',
  });
});

/**
 * List drivers - GET /api/admin/drivers
 */
export const listDrivers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, verificationStatus, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (verificationStatus) {
    filter.verificationStatus = verificationStatus;
  }

  if (status === 'online') {
    filter.isOnline = true;
  } else if (status === 'offline') {
    filter.isOnline = false;
  }

  let driversQuery = Driver.find(filter)
    .populate('user', 'name email phone profileImage isActive')
    .populate('vehicleDetails.vehicleType')
    .sort({ createdAt: -1 });

  if (search) {
    driversQuery = driversQuery.where('user').in(
      await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id')
    );
  }

  const drivers = await driversQuery.skip(skip).limit(parseInt(limit));
  const total = await Driver.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      drivers: drivers.map((driver) => formatDriverResponse(driver)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Get driver details - GET /api/admin/drivers/:id
 */
export const getDriverDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findById(id)
    .populate('user', 'name email phone profileImage rating isActive')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    throw new NotFoundError('Driver');
  }

  // Get driver statistics
  const totalRides = await Ride.countDocuments({ driver: id });
  const completedRides = await Ride.countDocuments({ driver: id, status: 'completed' });
  const cancelledRides = await Ride.countDocuments({ driver: id, status: 'cancelled' });
  const totalEarnings = await Payment.aggregate([
    { $match: { user: driver.user._id, status: 'completed', amount: { $gt: 0 } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json({
    status: 'success',
    data: {
      driver: formatDriverResponse(driver),
      statistics: {
        total_rides: totalRides,
        completed_rides: completedRides,
        cancelled_rides: cancelledRides,
        total_earnings: totalEarnings[0]?.total || 0,
        acceptance_rate: driver.acceptanceRate,
        cancellation_rate: driver.cancellationRate,
        rating: driver.rating,
      },
    },
  });
});

/**
 * Verify driver - PATCH /api/admin/drivers/:id/verify
 */
export const verifyDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findById(id).populate('user');
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  driver.documentsVerified = true;
  driver.verificationStatus = 'approved';
  await driver.save();

  // Update user role if needed
  if (driver.user.role !== 'driver') {
    driver.user.role = 'driver';
    await driver.user.save();
  }

  // Send notification to driver
  try {
    const { createNotification } = await import('../services/notificationService.js');
    await createNotification(
      driver.user,
      'account_verified',
      'Driver Account Verified',
      'Congratulations! Your driver account has been verified and approved. You can now start accepting rides.',
      { driverId: driver._id.toString() }
    );
  } catch (error) {
    logger.error(`Failed to send verification notification to driver ${id}: ${error.message}`);
    // Don't fail verification if notification fails
  }

  logger.info(`Driver ${id} verified by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Driver verified successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Reject driver - PATCH /api/admin/drivers/:id/reject
 */
export const rejectDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Rejection reason is required');
  }

  const driver = await Driver.findById(id).populate('user');
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  driver.documentsVerified = false;
  driver.verificationStatus = 'rejected';
  driver.rejectionReason = reason;
  await driver.save();

  // Send notification to driver
  try {
    const { createNotification } = await import('../services/notificationService.js');
    await createNotification(
      driver.user,
      'account_rejected',
      'Driver Account Verification Rejected',
      `Your driver account verification was rejected. Reason: ${reason}. Please review your documents and resubmit.`,
      { driverId: driver._id.toString(), reason }
    );
  } catch (error) {
    logger.error(`Failed to send rejection notification to driver ${id}: ${error.message}`);
    // Don't fail rejection if notification fails
  }

  logger.info(`Driver ${id} rejected by admin ${req.user._id}. Reason: ${reason}`);

  res.json({
    status: 'success',
    message: 'Driver rejected successfully',
    data: {
      driver: formatDriverResponse(driver),
    },
  });
});

/**
 * Get driver earnings - GET /api/admin/drivers/:id/earnings
 */
export const getDriverEarnings = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { period = 'all' } = req.query;

  const driver = await Driver.findById(id).populate('user');
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  const now = new Date();
  let startDate = null;

  switch (period) {
    case 'today':
      startDate = new Date(now.setHours(0, 0, 0, 0));
      break;
    case 'week':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case 'month':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case 'year':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
  }

  const matchFilter = {
    user: driver.user._id,
    status: 'completed',
    amount: { $gt: 0 },
  };

  if (startDate) {
    matchFilter.createdAt = { $gte: startDate };
  }

  const earnings = await Payment.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    status: 'success',
    data: {
      driver_id: driver._id.toString(),
      period,
      earnings: {
        total: earnings[0]?.total || 0,
        transactions: earnings[0]?.count || 0,
        currency: 'USD',
      },
      driver_earnings: driver.earnings,
    },
  });
});

/**
 * Get driver rides - GET /api/admin/drivers/:id/rides
 */
export const getDriverRides = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  const filter = { driver: id };

  if (status) {
    filter.status = status;
  }

  const rides = await Ride.find(filter)
    .populate('rider', 'name phone profileImage')
    .populate('vehicleType')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Ride.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      rides: rides.map((ride) => formatRideResponse(ride)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * List rides - GET /api/admin/rides
 */
export const listRides = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, dateFrom, dateTo, search } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  let ridesQuery = Ride.find(filter)
    .populate('rider', 'name phone email')
    .populate('driver.user', 'name phone email')
    .populate('vehicleType')
    .sort({ createdAt: -1 });

  if (search) {
    ridesQuery = ridesQuery.where('rider').in(
      await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ],
      }).distinct('_id')
    );
  }

  const rides = await ridesQuery.skip(skip).limit(parseInt(limit));
  const total = await Ride.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      rides: rides.map((ride) => formatRideResponse(ride)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Get ride details - GET /api/admin/rides/:id
 */
export const getRideDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const ride = await Ride.findById(id)
    .populate('rider', 'name email phone profileImage rating')
    .populate('driver.user', 'name email phone profileImage rating')
    .populate('driver', 'licenseNumber vehicleDetails rating')
    .populate('vehicleType');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Get payment info
  const payment = await Payment.findOne({ ride: id });

  // Get review if exists
  const review = await Review.findOne({ ride: id });

  res.json({
    status: 'success',
    data: {
      ride: formatRideResponse(ride),
      payment: payment ? {
        payment_id: payment._id.toString(),
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        transaction_id: payment.transactionId,
        created_at: payment.createdAt,
      } : null,
      review: review ? {
        review_id: review._id.toString(),
        rider_rating: review.riderRating,
        rider_review: review.riderReview,
        driver_rating: review.driverRating,
        driver_review: review.driverReview,
      } : null,
    },
  });
});

/**
 * Update ride - PATCH /api/admin/rides/:id
 */
export const updateRide = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const ride = await Ride.findById(id);
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Update allowed fields
  if (updateData.status) {
    ride.status = updateData.status;
    ride.statusHistory.push({
      status: updateData.status,
      timestamp: new Date(),
      note: `Status updated by admin: ${updateData.reason || 'No reason provided'}`,
    });
  }

  if (updateData.fare?.totalFare) {
    ride.fare.totalFare = updateData.fare.totalFare;
  }

  await ride.save();
  await ride.populate('rider', 'name phone profileImage');
  await ride.populate('driver.user', 'name phone profileImage');
  await ride.populate('vehicleType');

  logger.info(`Ride ${id} updated by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Ride updated successfully',
    data: {
      ride: formatRideResponse(ride),
    },
  });
});

/**
 * Handle dispute - POST /api/admin/rides/:id/dispute
 */
export const handleDispute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolution, refundAmount, reason } = req.body;

  if (!resolution) {
    throw new ValidationError('Resolution is required');
  }

  const ride = await Ride.findById(id).populate('rider');
  if (!ride) {
    throw new NotFoundError('Ride');
  }

  // Create support ticket for dispute
  const ticket = await SupportTicket.create({
    user: ride.rider._id,
    ride: id,
    category: 'ride_issue',
    subject: `Dispute for Ride ${id}`,
    description: reason || 'Ride dispute',
    status: 'open',
    priority: 'high',
  });

  // If refund requested, process it
  if (refundAmount && refundAmount > 0) {
    const payment = await Payment.findOne({ ride: id, status: 'completed' });
    if (payment) {
      payment.refundAmount = refundAmount;
      payment.status = 'refunded';
      payment.refundReason = reason || 'Admin dispute resolution';
      payment.refundedAt = new Date();
      await payment.save();

      // Refund to user wallet or original payment method
      const user = await User.findById(ride.rider._id);
      if (user && resolution === 'refund_to_wallet') {
        user.balance += refundAmount;
        await user.save();
      }
    }
  }

  logger.info(`Dispute handled for ride ${id} by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Dispute handled successfully',
    data: {
      ticket_id: ticket._id.toString(),
      resolution,
      refund_amount: refundAmount || 0,
    },
  });
});

/**
 * List payments - GET /api/admin/payments
 */
export const listPayments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, method, dateFrom, dateTo } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (method) {
    filter.method = method;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
    if (dateTo) filter.createdAt.$lte = new Date(dateTo);
  }

  const payments = await Payment.find(filter)
    .populate('user', 'name email phone')
    .populate('ride', 'status fare')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Payment.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      payments: payments.map((payment) => ({
        payment_id: payment._id.toString(),
        user: {
          user_id: payment.user._id.toString(),
          name: payment.user.name,
          email: payment.user.email,
        },
        ride_id: payment.ride?._id?.toString() || null,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        transaction_id: payment.transactionId,
        created_at: payment.createdAt,
        paid_at: payment.paidAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Get revenue statistics - GET /api/admin/revenue
 */
export const getRevenueStats = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  const now = new Date();
  let startDate = new Date();

  switch (period) {
    case '7d':
      startDate.setDate(now.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(now.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(now.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(now.getFullYear() - 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
  }

  // Revenue by payment method
  const revenueByMethod = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        amount: { $gt: 0 },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: '$method',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  // Revenue by day
  const revenueByDay = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        amount: { $gt: 0 },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Total revenue
  const totalRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        amount: { $gt: 0 },
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  res.json({
    status: 'success',
    data: {
      period,
      total_revenue: totalRevenue[0]?.total || 0,
      total_transactions: totalRevenue[0]?.count || 0,
      revenue_by_method: revenueByMethod.reduce((acc, item) => {
        acc[item._id] = {
          total: item.total,
          count: item.count,
        };
        return acc;
      }, {}),
      revenue_by_day: revenueByDay.map((item) => ({
        date: item._id,
        revenue: item.revenue,
        transactions: item.count,
      })),
    },
  });
});

/**
 * Process refund - POST /api/admin/payments/:id/refund
 */
export const processRefund = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { amount, reason, method } = req.body;

  if (!amount || amount <= 0) {
    throw new ValidationError('Valid refund amount is required');
  }

  const payment = await Payment.findById(id).populate('user').populate('ride');
  if (!payment) {
    throw new NotFoundError('Payment');
  }

  if (payment.status !== 'completed') {
    throw new ValidationError('Can only refund completed payments');
  }

  if (payment.refundAmount >= payment.amount) {
    throw new ValidationError('Payment has already been fully refunded');
  }

  const refundAmount = Math.min(amount, payment.amount - (payment.refundAmount || 0));

  // Process refund based on method
  if (method === 'wallet' || payment.method === 'wallet') {
    // Refund to wallet
    const user = await User.findById(payment.user._id);
    user.balance += refundAmount;
    await user.save();
  } else if (payment.method === 'stripe' || payment.method === 'card') {
    // Process Stripe refund
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = process.env.STRIPE_SECRET_KEY
        ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
        : null;

      if (!stripe) {
        throw new Error('Stripe is not configured');
      }

      // Use charge ID if available, otherwise use payment intent ID
      const chargeId = payment.stripeChargeId || payment.stripePaymentIntentId;
      if (!chargeId) {
        throw new Error('Stripe charge ID not found');
      }

      // Create refund
      const refund = await stripe.refunds.create({
        charge: chargeId,
        amount: Math.round(refundAmount * 100), // Convert to cents
        reason: 'requested_by_customer',
        metadata: {
          paymentId: payment._id.toString(),
          adminId: req.user._id.toString(),
          reason: reason || 'Admin refund',
        },
      });

      // Update payment record with refund ID
      payment.refundId = refund.id;
      logger.info(`Stripe refund processed: ${refund.id} for payment ${id} (${refundAmount})`);
    } catch (error) {
      logger.error(`Stripe refund failed for payment ${id}: ${error.message}`);
      throw new ValidationError(`Stripe refund failed: ${error.message}`);
    }
  }

  // Update payment record
  await payment.processRefund(refundAmount, reason, `REFUND-${Date.now()}`);

  logger.info(`Refund processed for payment ${id} by admin ${req.user._id}: $${refundAmount}`);

  res.json({
    status: 'success',
    message: 'Refund processed successfully',
    data: {
      payment_id: payment._id.toString(),
      refund_amount: refundAmount,
      total_refunded: payment.refundAmount,
      remaining_amount: payment.amount - payment.refundAmount,
    },
  });
});

/**
 * List withdrawals - GET /api/admin/withdrawals
 */
export const listWithdrawals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (page - 1) * limit;

  const filter = {
    amount: { $lt: 0 }, // Withdrawals are negative amounts
    metadata: { type: 'withdrawal' },
  };

  if (status) {
    filter.status = status;
  }

  const withdrawals = await Payment.find(filter)
    .populate('user', 'name email phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Payment.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      withdrawals: withdrawals.map((payment) => ({
        withdrawal_id: payment._id.toString(),
        user: {
          user_id: payment.user._id.toString(),
          name: payment.user.name,
          email: payment.user.email,
        },
        amount: Math.abs(payment.amount),
        status: payment.status,
        created_at: payment.createdAt,
        metadata: payment.metadata ? Object.fromEntries(payment.metadata) : {},
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Approve withdrawal - PATCH /api/admin/withdrawals/:id/approve
 */
export const approveWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const payment = await Payment.findById(id).populate('user');
  if (!payment) {
    throw new NotFoundError('Withdrawal');
  }

  if (payment.status !== 'pending') {
    throw new ValidationError('Can only approve pending withdrawals');
  }

  // Update payment status
  payment.status = 'completed';
  payment.paidAt = new Date();
  await payment.save();

  // Deduct from driver earnings
  const driver = await Driver.findOne({ user: payment.user._id });
  if (driver) {
    const withdrawalAmount = Math.abs(payment.amount);
    driver.earnings.total -= withdrawalAmount;
    await driver.save();
  }

  logger.info(`Withdrawal ${id} approved by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Withdrawal approved successfully',
    data: {
      withdrawal_id: payment._id.toString(),
      status: payment.status,
    },
  });
});

/**
 * List support tickets - GET /api/admin/support-tickets
 */
export const listSupportTickets = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, priority, category } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (priority) {
    filter.priority = priority;
  }

  if (category) {
    filter.category = category;
  }

  const tickets = await SupportTicket.find(filter)
    .populate('user', 'name email phone')
    .populate('ride', 'status fare')
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await SupportTicket.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      tickets: tickets.map((ticket) => ({
        ticket_id: ticket._id.toString(),
        user: {
          user_id: ticket.user._id.toString(),
          name: ticket.user.name,
          email: ticket.user.email,
        },
        ride_id: ticket.ride?._id?.toString() || null,
        category: ticket.category,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        assigned_to: ticket.assignedTo ? {
          admin_id: ticket.assignedTo._id.toString(),
          name: ticket.assignedTo.name,
        } : null,
        responses_count: ticket.responses?.length || 0,
        created_at: ticket.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Get ticket details - GET /api/admin/support-tickets/:id
 */
export const getTicketDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const ticket = await SupportTicket.findById(id)
    .populate('user', 'name email phone')
    .populate('ride', 'status fare pickupLocation dropoffLocation')
    .populate('assignedTo', 'name email')
    .populate('responses.user', 'name email role');

  if (!ticket) {
    throw new NotFoundError('Support ticket');
  }

  res.json({
    status: 'success',
    data: {
      ticket: {
        ticket_id: ticket._id.toString(),
        user: {
          user_id: ticket.user._id.toString(),
          name: ticket.user.name,
          email: ticket.user.email,
        },
        ride: ticket.ride ? {
          ride_id: ticket.ride._id.toString(),
          status: ticket.ride.status,
          fare: ticket.ride.fare?.totalFare || 0,
        } : null,
        category: ticket.category,
        subject: ticket.subject,
        description: ticket.description,
        status: ticket.status,
        priority: ticket.priority,
        assigned_to: ticket.assignedTo ? {
          admin_id: ticket.assignedTo._id.toString(),
          name: ticket.assignedTo.name,
        } : null,
        responses: ticket.responses?.map((response) => ({
          response_id: response._id?.toString(),
          user: {
            user_id: response.user._id.toString(),
            name: response.user.name,
            email: response.user.email,
            role: response.user.role,
          },
          message: response.message,
          attachments: response.attachments || [],
          created_at: response.createdAt,
        })) || [],
        attachments: ticket.attachments || [],
        created_at: ticket.createdAt,
        resolved_at: ticket.resolvedAt,
        closed_at: ticket.closedAt,
      },
    },
  });
});

/**
 * Assign ticket - POST /api/admin/support-tickets/:id/assign
 */
export const assignTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { adminId } = req.body;

  const ticket = await SupportTicket.findById(id);
  if (!ticket) {
    throw new NotFoundError('Support ticket');
  }

  if (adminId) {
    const admin = await User.findOne({ _id: adminId, role: 'admin' });
    if (!admin) {
      throw new NotFoundError('Admin');
    }
    await ticket.assign(admin);
  } else {
    // Assign to current admin
    await ticket.assign(req.user);
  }

  logger.info(`Ticket ${id} assigned by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Ticket assigned successfully',
    data: {
      ticket_id: ticket._id.toString(),
      assigned_to: {
        admin_id: ticket.assignedTo._id.toString(),
        name: ticket.assignedTo.name,
      },
    },
  });
});

/**
 * Resolve ticket - POST /api/admin/support-tickets/:id/resolve
 */
export const resolveTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { resolutionNote } = req.body;

  const ticket = await SupportTicket.findById(id);
  if (!ticket) {
    throw new NotFoundError('Support ticket');
  }

  await ticket.resolve(resolutionNote);

  logger.info(`Ticket ${id} resolved by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Ticket resolved successfully',
    data: {
      ticket_id: ticket._id.toString(),
      status: ticket.status,
      resolved_at: ticket.resolvedAt,
    },
  });
});

/**
 * Respond to ticket - POST /api/admin/support-tickets/:id/respond
 */
export const respondToTicket = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { message, attachments } = req.body;

  if (!message) {
    throw new ValidationError('Message is required');
  }

  const ticket = await SupportTicket.findById(id);
  if (!ticket) {
    throw new NotFoundError('Support ticket');
  }

  await ticket.addResponse(req.user, message, attachments || []);

  logger.info(`Response added to ticket ${id} by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Response added successfully',
    data: {
      ticket_id: ticket._id.toString(),
      response_count: ticket.responses?.length || 0,
    },
  });
});

/**
 * List promocodes - GET /api/admin/promocodes
 */
export const listPromocodes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, isActive } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (isActive !== undefined) {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  const promocodes = await Promocode.find(filter)
    .populate('applicableVehicleTypes', 'name displayName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Promocode.countDocuments(filter);

  res.json({
    status: 'success',
    data: {
      promocodes: promocodes.map((promo) => ({
        promo_id: promo._id.toString(),
        code: promo.code,
        description: promo.description,
        discount_type: promo.discountType,
        discount_value: promo.discountValue,
        max_discount: promo.maxDiscount,
        min_amount: promo.minAmount,
        max_uses: promo.maxUses,
        used_count: promo.usedCount,
        valid_from: promo.validFrom,
        valid_to: promo.validTo,
        is_active: promo.isActive,
        applicable_user_types: promo.applicableUserTypes,
        applicable_vehicle_types: promo.applicableVehicleTypes.map((vt) => ({
          vehicle_id: vt._id.toString(),
          name: vt.name,
        })),
        created_at: promo.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * Create promocode - POST /api/admin/promocodes
 */
export const createPromocode = asyncHandler(async (req, res) => {
  const {
    code,
    description,
    discountType,
    discountValue,
    maxDiscount,
    minAmount,
    maxUses,
    maxUsesPerUser,
    validFrom,
    validTo,
    applicableUserTypes,
    applicableVehicleTypes,
  } = req.body;

  if (!code || !discountType || !discountValue || !validFrom || !validTo) {
    throw new ValidationError('Code, discount type, discount value, valid from, and valid to are required');
  }

  // Check if code already exists
  const existing = await Promocode.findOne({ code: code.toUpperCase() });
  if (existing) {
    throw new ConflictError('Promo code already exists');
  }

  const promocode = await Promocode.create({
    code: code.toUpperCase(),
    description,
    discountType,
    discountValue,
    maxDiscount,
    minAmount: minAmount || 0,
    maxUses,
    maxUsesPerUser: maxUsesPerUser || 1,
    validFrom: new Date(validFrom),
    validTo: new Date(validTo),
    applicableUserTypes: applicableUserTypes || ['all'],
    applicableVehicleTypes: applicableVehicleTypes || [],
    isActive: true,
  });

  await promocode.populate('applicableVehicleTypes', 'name displayName');

  logger.info(`Promocode created by admin ${req.user._id}: ${code}`);

  res.status(201).json({
    status: 'success',
    message: 'Promocode created successfully',
    data: {
      promocode: {
        promo_id: promocode._id.toString(),
        code: promocode.code,
        description: promocode.description,
        discount_type: promocode.discountType,
        discount_value: promocode.discountValue,
      },
    },
  });
});

/**
 * Update promocode - PATCH /api/admin/promocodes/:id
 */
export const updatePromocode = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const promocode = await Promocode.findById(id);
  if (!promocode) {
    throw new NotFoundError('Promocode');
  }

  // Update allowed fields
  if (updateData.description !== undefined) promocode.description = updateData.description;
  if (updateData.discountValue !== undefined) promocode.discountValue = updateData.discountValue;
  if (updateData.maxDiscount !== undefined) promocode.maxDiscount = updateData.maxDiscount;
  if (updateData.minAmount !== undefined) promocode.minAmount = updateData.minAmount;
  if (updateData.maxUses !== undefined) promocode.maxUses = updateData.maxUses;
  if (updateData.maxUsesPerUser !== undefined) promocode.maxUsesPerUser = updateData.maxUsesPerUser;
  if (updateData.validFrom) promocode.validFrom = new Date(updateData.validFrom);
  if (updateData.validTo) promocode.validTo = new Date(updateData.validTo);
  if (updateData.isActive !== undefined) promocode.isActive = updateData.isActive;
  if (updateData.applicableUserTypes) promocode.applicableUserTypes = updateData.applicableUserTypes;
  if (updateData.applicableVehicleTypes) promocode.applicableVehicleTypes = updateData.applicableVehicleTypes;

  await promocode.save();
  await promocode.populate('applicableVehicleTypes', 'name displayName');

  logger.info(`Promocode ${id} updated by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Promocode updated successfully',
    data: {
      promocode: {
        promo_id: promocode._id.toString(),
        code: promocode.code,
        is_active: promocode.isActive,
      },
    },
  });
});

/**
 * Format user response for admin
 */
const formatUserResponse = (user) => {
  return {
    user_id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    is_active: user.isActive,
    is_verified: user.isVerified,
    balance: user.balance || 0,
    rating: user.rating || 0,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
};

/**
 * Format driver response for admin
 */
const formatDriverResponse = (driver) => {
  return {
    driver_id: driver._id.toString(),
    user: driver.user ? {
      user_id: driver.user._id?.toString() || driver.user.toString(),
      name: driver.user.name,
      email: driver.user.email,
      phone: driver.user.phone,
      image: driver.user.profileImage,
      is_active: driver.user.isActive,
    } : null,
    license_number: driver.licenseNumber,
    vehicle_details: driver.vehicleDetails ? {
      make: driver.vehicleDetails.make,
      model: driver.vehicleDetails.model,
      year: driver.vehicleDetails.year,
      plate_number: driver.vehicleDetails.plateNumber,
      color: driver.vehicleDetails.color,
      vehicle_type: driver.vehicleDetails.vehicleType?._id?.toString() || driver.vehicleDetails.vehicleType?.toString(),
    } : null,
    documents_verified: driver.documentsVerified,
    verification_status: driver.verificationStatus,
    is_online: driver.isOnline,
    is_available: driver.isAvailable,
    earnings: driver.earnings,
    rating: driver.rating,
    created_at: driver.createdAt,
  };
};

/**
 * Format ride response for admin
 */
const formatRideResponse = (ride) => {
  return {
    ride_id: ride._id.toString(),
    rider: ride.rider ? {
      user_id: ride.rider._id?.toString() || ride.rider.toString(),
      name: ride.rider.name || null,
      phone: ride.rider.phone || null,
      email: ride.rider.email || null,
    } : null,
    driver: ride.driver ? {
      driver_id: ride.driver._id?.toString() || ride.driver.toString(),
      user_id: ride.driver.user?._id?.toString() || ride.driver.user?.toString() || null,
      name: ride.driver.user?.name || null,
      phone: ride.driver.user?.phone || null,
    } : null,
    status: ride.status,
    fare: ride.fare?.totalFare || 0,
    payment_method: ride.paymentMethod,
    payment_status: ride.paymentStatus,
    distance: ride.distance?.value || 0,
    duration: ride.duration?.estimated || 0,
    created_at: ride.createdAt,
    completed_at: ride.completedAt,
    cancelled_at: ride.cancellation?.cancelledAt || null,
  };
};

/**
 * List vehicle types - GET /api/admin/vehicle-types
 */
export const listVehicleTypes = asyncHandler(async (req, res) => {
  const vehicleTypes = await VehicleType.find()
    .sort({ order: 1, name: 1 });

  res.json({
    status: 'success',
    data: {
      vehicle_types: vehicleTypes.map((type) => ({
        vehicle_id: type._id.toString(),
        name: type.name,
        display_name: type.displayName,
        description: type.description,
        base_fare: type.baseFare,
        per_km_rate: type.perKmRate,
        per_minute_rate: type.perMinuteRate,
        capacity: type.capacity,
        is_active: type.isActive,
        order: type.order,
        created_at: type.createdAt,
        updated_at: type.updatedAt,
      })),
    },
  });
});

/**
 * Create vehicle type - POST /api/admin/vehicle-types
 */
export const createVehicleType = asyncHandler(async (req, res) => {
  const {
    name,
    displayName,
    description,
    baseFare,
    perKmRate,
    perMinuteRate,
    capacity,
    order,
    isActive,
  } = req.body;

  if (!name || !displayName || baseFare === undefined || perKmRate === undefined || perMinuteRate === undefined) {
    throw new ValidationError('Name, display name, base fare, per km rate, and per minute rate are required');
  }

  // Check if vehicle type already exists
  const existing = await VehicleType.findOne({ name: name.toLowerCase() });
  if (existing) {
    throw new ConflictError('Vehicle type already exists');
  }

  const vehicleType = await VehicleType.create({
    name: name.toLowerCase(),
    displayName,
    description,
    baseFare: parseFloat(baseFare),
    perKmRate: parseFloat(perKmRate),
    perMinuteRate: parseFloat(perMinuteRate),
    capacity: capacity || 4,
    order: order || 0,
    isActive: isActive !== undefined ? isActive : true,
  });

  logger.info(`Vehicle type created by admin ${req.user._id}: ${name}`);

  res.status(201).json({
    status: 'success',
    message: 'Vehicle type created successfully',
    data: {
      vehicle_type: {
        vehicle_id: vehicleType._id.toString(),
        name: vehicleType.name,
        display_name: vehicleType.displayName,
        description: vehicleType.description,
        base_fare: vehicleType.baseFare,
        per_km_rate: vehicleType.perKmRate,
        per_minute_rate: vehicleType.perMinuteRate,
        capacity: vehicleType.capacity,
        is_active: vehicleType.isActive,
        order: vehicleType.order,
      },
    },
  });
});

/**
 * Update vehicle type - PATCH /api/admin/vehicle-types/:id
 */
export const updateVehicleType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const vehicleType = await VehicleType.findById(id);
  if (!vehicleType) {
    throw new NotFoundError('Vehicle type');
  }

  // If name is being updated, check for conflicts
  if (updateData.name && updateData.name.toLowerCase() !== vehicleType.name) {
    const existing = await VehicleType.findOne({ name: updateData.name.toLowerCase() });
    if (existing) {
      throw new ConflictError('Vehicle type with this name already exists');
    }
    updateData.name = updateData.name.toLowerCase();
  }

  // Update numeric fields
  if (updateData.baseFare !== undefined) updateData.baseFare = parseFloat(updateData.baseFare);
  if (updateData.perKmRate !== undefined) updateData.perKmRate = parseFloat(updateData.perKmRate);
  if (updateData.perMinuteRate !== undefined) updateData.perMinuteRate = parseFloat(updateData.perMinuteRate);
  if (updateData.capacity !== undefined) updateData.capacity = parseInt(updateData.capacity);
  if (updateData.order !== undefined) updateData.order = parseInt(updateData.order);

  Object.assign(vehicleType, updateData);
  await vehicleType.save();

  logger.info(`Vehicle type updated by admin ${req.user._id}: ${vehicleType.name}`);

  res.json({
    status: 'success',
    message: 'Vehicle type updated successfully',
    data: {
      vehicle_type: {
        vehicle_id: vehicleType._id.toString(),
        name: vehicleType.name,
        display_name: vehicleType.displayName,
        description: vehicleType.description,
        base_fare: vehicleType.baseFare,
        per_km_rate: vehicleType.perKmRate,
        per_minute_rate: vehicleType.perMinuteRate,
        capacity: vehicleType.capacity,
        is_active: vehicleType.isActive,
        order: vehicleType.order,
      },
    },
  });
});

/**
 * Delete vehicle type - DELETE /api/admin/vehicle-types/:id
 */
export const deleteVehicleType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const vehicleType = await VehicleType.findById(id);
  if (!vehicleType) {
    throw new NotFoundError('Vehicle type');
  }

  // Check if any drivers are using this vehicle type
  const driversUsingType = await Driver.countDocuments({
    'vehicleDetails.vehicleType': id,
  });

  if (driversUsingType > 0) {
    throw new ValidationError(`Cannot delete vehicle type. ${driversUsingType} driver(s) are using this vehicle type.`);
  }

  await VehicleType.findByIdAndDelete(id);

  logger.info(`Vehicle type deleted by admin ${req.user._id}: ${vehicleType.name}`);

  res.json({
    status: 'success',
    message: 'Vehicle type deleted successfully',
  });
});
