import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import Payment from '../models/Payment.js';
import Promocode from '../models/Promocode.js';
import SupportTicket from '../models/SupportTicket.js';
import Notification from '../models/Notification.js';
import Review from '../models/Review.js';
import VehicleType from '../models/VehicleType.js';
import AdminSettings from '../models/AdminSettings.js';
import AuditLog from '../models/AuditLog.js';
import Transaction from '../models/Transaction.js';
import DriverWallet from '../models/DriverWallet.js';
import PayoutRequest from '../models/PayoutRequest.js';
import DriverKyc from '../models/DriverKyc.js';
import DriverVehicle from '../models/DriverVehicle.js';
import { provisionDvaAsync } from '../services/dvaProvisioningService.js';
import WalletFundingTransaction from '../models/WalletFundingTransaction.js';
import { generateTokenPair, generateAccessToken } from '../utils/jwt.js';
import { addToBlacklist } from '../services/tokenBlacklist.js';
import { extractTokenFromRequest } from '../middleware/auth.js';
import { logAdminAction } from '../services/auditLogService.js';
import { AuthenticationError, NotFoundError, ValidationError, ConflictError } from '../utils/errors.js';
import { asyncHandler } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { invalidateAdminSettingsCache } from '../utils/adminSettingsCache.js';

/** Escape user input for safe use in MongoDB $regex (prevents ReDoS and injection). */
function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').slice(0, 200);
}

/** Allowed admin ride status transitions. Prevents invalid state (e.g. completed -> accepted). */
const RIDE_STATUS_TRANSITIONS = {
  requested: ['accepted', 'cancelled', 'no-driver-found'],
  searching: ['accepted', 'cancelled', 'no-driver-found'],
  scheduled: ['requested', 'searching', 'cancelled'],
  accepted: ['arrived', 'cancelled', 'driver_en_route'],
  driver_en_route: ['arrived', 'cancelled'],
  arrived: ['in-progress', 'cancelled'],
  'in-progress': ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  'no-driver-found': ['requested', 'searching'],
};
function canTransitionRideStatus(fromStatus, toStatus) {
  const allowed = RIDE_STATUS_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

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
  const token = extractTokenFromRequest(req);
  if (token) {
    await addToBlacklist(token);
  }

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
 * Get audit logs - GET /api/admin/audit-logs
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, resourceType, adminId } = req.query;
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const filter = {};

  if (action) filter.action = action;
  if (resourceType) filter.resourceType = resourceType;
  if (adminId) filter.adminId = adminId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  res.json({
    status: 'success',
    data: {
      audit_logs: logs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)),
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
    Ride.countDocuments({
      status: { $in: ['requested', 'searching', 'accepted', 'driver_en_route', 'in-progress'] },
    }),
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
 * Dashboard live data - GET /api/admin/dashboard/live
 * Pending rides (requested), active rides for map, recent activity.
 */
export const getDashboardLive = asyncHandler(async (req, res) => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [pendingRides, activeRides, recentRides, newUsers, newDrivers, newTickets] = await Promise.all([
    Ride.find({ status: { $in: ['requested', 'searching'] } })
      .populate('rider', 'name phone')
      .populate('vehicleType', 'displayName')
      .sort({ createdAt: 1 })
      .limit(50)
      .lean(),
    Ride.find({ status: { $in: ['accepted', 'driver_en_route', 'arrived', 'in-progress'] } })
      .populate('rider', 'name phone')
      .populate({ path: 'driver', select: 'currentLocation', populate: { path: 'user', select: 'name phone' } })
      .populate('vehicleType', 'displayName')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Ride.find({ status: 'completed' })
      .populate('rider', 'name')
      .populate('driver.user', 'name')
      .sort({ completedAt: -1 })
      .limit(10)
      .lean(),
    User.find({ role: 'passenger' }).sort({ createdAt: -1 }).limit(5).select('name createdAt').lean(),
    Driver.find().populate('user', 'name').sort({ createdAt: -1 }).limit(5).lean(),
    SupportTicket.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name').lean(),
  ]);

  const pendingWithWait = pendingRides.map((r) => ({
    ride_id: r._id.toString(),
    rider_name: r.rider?.name,
    rider_phone: r.rider?.phone,
    pickup_address: r.pickupLocation?.address,
    vehicle_type: r.vehicleType?.displayName || r.vehicleType?.name,
    created_at: r.createdAt,
    waiting_mins: Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 60000),
  }));

  const activeForMap = activeRides.map((r) => ({
    ride_id: r._id.toString(),
    status: r.status,
    pickup: r.pickupLocation?.coordinates ? { lng: r.pickupLocation.coordinates[0], lat: r.pickupLocation.coordinates[1], address: r.pickupLocation?.address } : null,
    dropoff: r.dropoffLocation?.coordinates ? { lng: r.dropoffLocation.coordinates[0], lat: r.dropoffLocation.coordinates[1], address: r.dropoffLocation?.address } : null,
    driver_location: r.driver?.currentLocation?.coordinates ? { lng: r.driver.currentLocation.coordinates[0], lat: r.driver.currentLocation.coordinates[1] } : null,
    rider_name: r.rider?.name,
    driver_name: r.driver?.user?.name,
  }));

  const activity = [];
  recentRides.forEach((r) => {
    if (r.completedAt)
      activity.push({
        type: 'ride_completed',
        id: r._id.toString(),
        message: `Driver ${r.driver?.user?.name || 'Unknown'} completed ride`,
        sub: r.fare?.totalFare ? `NGN ${Number(r.fare.totalFare).toFixed(2)}` : '',
        at: r.completedAt,
      });
  });
  newUsers.forEach((u) => {
    activity.push({ type: 'user_signup', id: u._id.toString(), message: 'New user signup', sub: u.name, at: u.createdAt });
  });
  newDrivers.forEach((d) => {
    activity.push({ type: 'driver_signup', id: d._id.toString(), message: 'New driver signup', sub: d.user?.name, at: d.createdAt });
  });
  newTickets.forEach((t) => {
    activity.push({ type: 'ticket_opened', id: t._id.toString(), message: 'Support ticket opened', sub: t.subject, at: t.createdAt });
  });
  activity.sort((a, b) => new Date(b.at) - new Date(a.at));
  const recent_activity = activity.slice(0, 20);

  res.json({
    status: 'success',
    data: {
      pending_rides: pendingWithWait,
      active_rides: activeForMap,
      rides_waiting_over_5min: pendingWithWait.filter((r) => r.waiting_mins >= 5).length,
      recent_activity: recent_activity.map((a) => ({ ...a, at: a.at })),
    },
  });
});

/**
 * Get admin settings (alerts etc.) - GET /api/admin/settings
 */
export const getSettings = asyncHandler(async (req, res) => {
  let doc = await AdminSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AdminSettings.create({ key: 'default' });
  }
  const defaultReferral = {
    enabled: true,
    rewardType: 'free_ride',
    successfulInvitesRequired: 3,
    cashAmount: 500,
    freeRideAmount: 1000,
    description: "Invite friends! When they complete signup and their first ride, you both get a reward.",
  };
  const defaultDriverTasks = {
    first_ride_today: 200,
    rides_3_today: 500,
    rides_5_today: 1000,
    rides_10_today: 2500,
    early_bird: 300,
    night_owl: 300,
    weekend_warrior: 1500,
  };
  const defaultPricing = {
    baseFare: 500,
    perKmRate: 150,
    minimumFare: 800,
    currency: 'NGN',
  };
  const defaultFees = {
    riderServiceCharge: 100,
    driverPlatformRate: 0.08,
  };
  const defaultCancellation = {
    afterAcceptPenalty: 200,
    afterAcceptPayout: 200,
    afterArrivalPayout: 150,
    gracePeriodSeconds: 60,
    maxDriverPayoutsPerDay: 3,
  };
  const defaultArrival = { maxRadiusMeters: 150 };
  const defaultWallet = {
    minTopupAmount: 500,
    minWithdrawAmount: 1000,
    maxDailyWithdrawal: 500000,
  };
  res.json({
    status: 'success',
    data: {
      pricing: doc.pricing ? { ...defaultPricing, ...doc.pricing.toObject?.() || doc.pricing } : defaultPricing,
      fees: doc.fees ? { ...defaultFees, ...doc.fees.toObject?.() || doc.fees } : defaultFees,
      cancellation: doc.cancellation ? { ...defaultCancellation, ...doc.cancellation.toObject?.() || doc.cancellation } : defaultCancellation,
      arrival: doc.arrival ? { ...defaultArrival, ...doc.arrival.toObject?.() || doc.arrival } : defaultArrival,
      wallet: doc.wallet ? { ...defaultWallet, ...doc.wallet.toObject?.() || doc.wallet } : defaultWallet,
      feesLastUpdatedAt: doc.feesLastUpdatedAt || null,
      alerts: doc.alerts || {
        rideWaitingThresholdMinutes: 5,
        emailOnRideWaiting: false,
        emailOnNewDriverSignup: false,
        emailOnNewTicket: false,
        smsOnRideWaiting: false,
      },
      referral: doc.referral || defaultReferral,
      topup: doc.topup || { bankName: null, accountName: null, accountNumber: null },
      dvaPreferredBank: doc.dvaPreferredBank || 'wema-bank',
      driverTasks: doc.driverTasks ? { ...defaultDriverTasks, ...doc.driverTasks.toObject?.() || doc.driverTasks } : defaultDriverTasks,
    },
  });
});

/**
 * Update admin settings - PATCH /api/admin/settings
 */
export const updateSettings = asyncHandler(async (req, res) => {
  const { alerts, referral, topup, dvaPreferredBank, driverTasks, pricing, fees, cancellation, arrival, wallet } = req.body;
  let doc = await AdminSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AdminSettings.create({ key: 'default' });
  }
  const adminId = req.user?._id || null;
  if (alerts) {
    if (!doc.alerts) doc.alerts = {};
    if (alerts.rideWaitingThresholdMinutes !== undefined) doc.alerts.rideWaitingThresholdMinutes = alerts.rideWaitingThresholdMinutes;
    if (alerts.emailOnRideWaiting !== undefined) doc.alerts.emailOnRideWaiting = alerts.emailOnRideWaiting;
    if (alerts.emailOnNewDriverSignup !== undefined) doc.alerts.emailOnNewDriverSignup = alerts.emailOnNewDriverSignup;
    if (alerts.emailOnNewTicket !== undefined) doc.alerts.emailOnNewTicket = alerts.emailOnNewTicket;
    if (alerts.smsOnRideWaiting !== undefined) doc.alerts.smsOnRideWaiting = alerts.smsOnRideWaiting;
    doc.markModified('alerts');
  }
  if (referral) {
    if (!doc.referral) doc.referral = {};
    if (referral.enabled !== undefined) doc.referral.enabled = !!referral.enabled;
    if (referral.rewardType && ['cash', 'free_ride'].includes(referral.rewardType)) doc.referral.rewardType = referral.rewardType;
    if (referral.successfulInvitesRequired != null) doc.referral.successfulInvitesRequired = Math.max(1, parseInt(referral.successfulInvitesRequired, 10) || 1);
    if (referral.cashAmount != null) doc.referral.cashAmount = Math.max(0, parseFloat(referral.cashAmount) || 0);
    if (referral.freeRideAmount != null) doc.referral.freeRideAmount = Math.max(0, parseFloat(referral.freeRideAmount) || 0);
    if (referral.description != null) doc.referral.description = String(referral.description).trim() || doc.referral.description;
    doc.markModified('referral');
  }
  if (topup) {
    if (!doc.topup) doc.topup = {};
    if (topup.bankName !== undefined) doc.topup.bankName = topup.bankName ? String(topup.bankName).trim() : null;
    if (topup.accountName !== undefined) doc.topup.accountName = topup.accountName ? String(topup.accountName).trim() : null;
    if (topup.accountNumber !== undefined) doc.topup.accountNumber = topup.accountNumber ? String(topup.accountNumber).trim() : null;
    doc.markModified('topup');
  }
  if (dvaPreferredBank !== undefined) {
    doc.dvaPreferredBank = dvaPreferredBank ? String(dvaPreferredBank).trim() : 'wema-bank';
  }
  if (driverTasks && typeof driverTasks === 'object') {
    if (!doc.driverTasks) doc.driverTasks = {};
    const taskKeys = ['first_ride_today', 'rides_3_today', 'rides_5_today', 'rides_10_today', 'early_bird', 'night_owl', 'weekend_warrior'];
    for (const key of taskKeys) {
      if (driverTasks[key] !== undefined) {
        const val = parseFloat(driverTasks[key]);
        if (!Number.isNaN(val) && val >= 0) doc.driverTasks[key] = val;
      }
    }
    doc.markModified('driverTasks');
  }
  if (pricing && typeof pricing === 'object') {
    if (!doc.pricing) doc.pricing = {};
    if (pricing.baseFare !== undefined) {
      const val = parseFloat(pricing.baseFare);
      if (!Number.isNaN(val) && val >= 0) doc.pricing.baseFare = val;
    }
    if (pricing.perKmRate !== undefined) {
      const val = parseFloat(pricing.perKmRate);
      if (!Number.isNaN(val) && val >= 0) doc.pricing.perKmRate = val;
    }
    if (pricing.minimumFare !== undefined) {
      const val = parseFloat(pricing.minimumFare);
      if (!Number.isNaN(val) && val >= 0) doc.pricing.minimumFare = val;
    }
    if (pricing.currency !== undefined) doc.pricing.currency = String(pricing.currency).trim() || 'NGN';
    doc.markModified('pricing');
  }
  if (fees && typeof fees === 'object') {
    if (!doc.fees) doc.fees = {};
    if (fees.riderServiceCharge !== undefined) {
      const val = parseFloat(fees.riderServiceCharge);
      if (!Number.isNaN(val) && val >= 0 && val <= 500) doc.fees.riderServiceCharge = val;
    }
    if (fees.driverPlatformRate !== undefined) {
      const val = parseFloat(fees.driverPlatformRate);
      if (!Number.isNaN(val) && val >= 0.01 && val <= 0.25) doc.fees.driverPlatformRate = val;
    }
    doc.feesLastUpdatedBy = adminId;
    doc.feesLastUpdatedAt = new Date();
    doc.markModified('fees');
  }
  if (cancellation && typeof cancellation === 'object') {
    if (!doc.cancellation) doc.cancellation = {};
    if (cancellation.afterAcceptPenalty !== undefined) {
      const val = parseFloat(cancellation.afterAcceptPenalty);
      if (!Number.isNaN(val) && val >= 0) doc.cancellation.afterAcceptPenalty = val;
    }
    if (cancellation.afterAcceptPayout !== undefined) {
      const val = parseFloat(cancellation.afterAcceptPayout);
      if (!Number.isNaN(val) && val >= 0) doc.cancellation.afterAcceptPayout = val;
    }
    if (cancellation.afterArrivalPayout !== undefined) {
      const val = parseFloat(cancellation.afterArrivalPayout);
      if (!Number.isNaN(val) && val >= 0) doc.cancellation.afterArrivalPayout = val;
    }
    if (cancellation.gracePeriodSeconds !== undefined) {
      const val = parseInt(cancellation.gracePeriodSeconds, 10);
      if (!Number.isNaN(val) && val >= 0) doc.cancellation.gracePeriodSeconds = val;
    }
    if (cancellation.maxDriverPayoutsPerDay !== undefined) {
      const val = parseInt(cancellation.maxDriverPayoutsPerDay, 10);
      if (!Number.isNaN(val) && val >= 1) doc.cancellation.maxDriverPayoutsPerDay = val;
    }
    doc.markModified('cancellation');
  }
  if (arrival && typeof arrival === 'object') {
    if (!doc.arrival) doc.arrival = {};
    if (arrival.maxRadiusMeters !== undefined) {
      const val = parseInt(arrival.maxRadiusMeters, 10);
      if (!Number.isNaN(val) && val >= 50 && val <= 500) doc.arrival.maxRadiusMeters = val;
    }
    doc.markModified('arrival');
  }
  if (wallet && typeof wallet === 'object') {
    if (!doc.wallet) doc.wallet = {};
    if (wallet.minTopupAmount !== undefined) {
      const val = parseFloat(wallet.minTopupAmount);
      if (!Number.isNaN(val) && val >= 0) doc.wallet.minTopupAmount = val;
    }
    if (wallet.minWithdrawAmount !== undefined) {
      const val = parseFloat(wallet.minWithdrawAmount);
      if (!Number.isNaN(val) && val >= 0) doc.wallet.minWithdrawAmount = val;
    }
    if (wallet.maxDailyWithdrawal !== undefined) {
      const val = parseFloat(wallet.maxDailyWithdrawal);
      if (!Number.isNaN(val) && val >= 0) doc.wallet.maxDailyWithdrawal = val;
    }
    doc.markModified('wallet');
  }
  await doc.save();
  await invalidateAdminSettingsCache();
  if (fees || cancellation || arrival || wallet) {
    const { invalidateCache } = await import('../services/settingsService.js');
    invalidateCache();
  }
  res.json({
    status: 'success',
    message: 'Settings updated. Fee changes apply to new rides within 5 minutes.',
    data: {
      alerts: doc.alerts,
      referral: doc.referral,
      topup: doc.topup,
      dvaPreferredBank: doc.dvaPreferredBank,
      driverTasks: doc.driverTasks,
      pricing: doc.pricing,
      fees: doc.fees,
      cancellation: doc.cancellation,
      arrival: doc.arrival,
      wallet: doc.wallet,
      feesLastUpdatedAt: doc.feesLastUpdatedAt,
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

  // Rides by day (for sparklines and trend)
  const ridesByDay = await Ride.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Peak hours: rides by hour of day (0-23)
  const ridesByHour = await Ride.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  // Conversion: requested vs completed vs cancelled in period
  const requestedCount = await Ride.countDocuments({
    createdAt: { $gte: startDate },
    status: { $in: ['requested', 'searching'] },
  });
  const completedInPeriod = await Ride.countDocuments({ createdAt: { $gte: startDate }, status: 'completed' });
  const cancelledInPeriod = await Ride.countDocuments({ createdAt: { $gte: startDate }, status: 'cancelled' });
  const acceptedOrProgress = await Ride.countDocuments({
    createdAt: { $gte: startDate },
    status: { $in: ['accepted', 'driver_en_route', 'in-progress', 'arrived'] },
  });
  const totalRidesInPeriod = await Ride.countDocuments({ createdAt: { $gte: startDate } });
  const conversion_rate = totalRidesInPeriod > 0 ? Math.round((completedInPeriod / totalRidesInPeriod) * 1000) / 10 : 0;

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
      rides_by_day: ridesByDay.map((item) => ({
        date: item._id,
        count: item.count,
      })),
      rides_by_hour: ridesByHour.map((item) => ({ hour: item._id, count: item.count })),
      conversion: {
        requested: requestedCount,
        completed: completedInPeriod,
        cancelled: cancelledInPeriod,
        in_progress: acceptedOrProgress,
        total: totalRidesInPeriod,
        conversion_rate_percent: conversion_rate,
      },
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
    const safeSearch = escapeRegex(search);
    if (safeSearch) {
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }
  }

  const users = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(filter);

  // For drivers, attach driver verification status (app and admin use this; only admin approves drivers)
  const driverUserIds = users.filter((u) => u.role === 'driver').map((u) => u._id);
  const drivers = driverUserIds.length
    ? await Driver.find({ user: { $in: driverUserIds } }).select('user verificationStatus documentsVerified').lean()
    : [];
  const driverByUserId = Object.fromEntries(drivers.map((d) => [d.user.toString(), d]));

  const usersPayload = users.map((user) => {
    const out = formatUserResponse(user);
    if (user.role === 'driver') {
      const dr = driverByUserId[user._id.toString()];
      out.driver_verification_status = dr?.verificationStatus || 'pending';
      out.driver_documents_verified = !!dr?.documentsVerified;
    }
    return out;
  });

  res.json({
    status: 'success',
    data: {
      users: usersPayload,
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

  // When admin approves a driver, set Driver.verificationStatus so app and admin stay in sync
  if (updateData.isVerified === true && user.role === 'driver') {
    const driver = await Driver.findOne({ user: id });
    if (driver) {
      driver.verificationStatus = 'approved';
      driver.documentsVerified = true;
      driver.rejectionReason = null;
      driver.isAvailable = true;
      driver.isOnline = true;
      driver.lastActiveAt = new Date();
      const dayKey = new Date().toISOString().slice(0, 10);
      driver.statsDate = dayKey;
      driver.todayOnlineMs = 0;
      driver.onlineSessionStartedAt = new Date();
      await driver.save();
      try {
        provisionDvaAsync(id);
      } catch (dvaErr) {
        logger.warn(`DVA provisioning after user approve failed for ${id}: ${dvaErr.message}`);
      }
    }
  }

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

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'user_activate',
    resourceType: 'user',
    resourceId: id,
    details: { userId: id, email: user.email },
    req,
  });
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

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'user_deactivate',
    resourceType: 'user',
    resourceId: id,
    details: { userId: id, email: user.email },
    req,
  });
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

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'user_delete',
    resourceType: 'user',
    resourceId: id,
    details: { userId: id, email: user.email },
    req,
  });
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
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, parseInt(limit, 10) || 20);
  const skip = (pageNum - 1) * limitNum;
  const userFilter = { role: 'driver' };

  if (search) {
    const safeSearch = escapeRegex(search);
    if (safeSearch) {
      userFilter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { email: { $regex: safeSearch, $options: 'i' } },
        { phone: { $regex: safeSearch, $options: 'i' } },
      ];
    }
  }

  const users = await User.find(userFilter)
    .select('name email phone profileImage isActive rating onboardingStage kycStatus createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const userIds = users.map((user) => user._id);
  const [drivers, kycDocs, vehicleDocs] = await Promise.all([
    Driver.find({ user: { $in: userIds } }).populate('vehicleDetails.vehicleType').lean(),
    DriverKyc.find({ userId: { $in: userIds } }).lean(),
    DriverVehicle.find({ userId: { $in: userIds } }).populate('vehicleType').lean(),
  ]);

  const driverMap = new Map(drivers.map((driver) => [driver.user.toString(), driver]));
  const kycMap = new Map(kycDocs.map((doc) => [doc.userId.toString(), doc]));
  const vehicleMap = new Map(vehicleDocs.map((doc) => [doc.userId.toString(), doc]));

  const matchedDrivers = users
    .map((user) => formatDriverCandidateResponse({
      user,
      driver: driverMap.get(user._id.toString()) || null,
      driverKyc: kycMap.get(user._id.toString()) || null,
      driverVehicle: vehicleMap.get(user._id.toString()) || null,
    }))
    .filter((driver) => {
      if (verificationStatus && driver.verification_status !== verificationStatus) {
        return false;
      }
      if (status === 'online' && !driver.is_online) {
        return false;
      }
      if (status === 'offline' && driver.is_online) {
        return false;
      }
      return true;
    });

  const total = matchedDrivers.length;
  const paginatedDrivers = matchedDrivers.slice(skip, skip + limitNum);

  res.json({
    status: 'success',
    data: {
      drivers: paginatedDrivers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

/**
 * Get driver details - GET /api/admin/drivers/:id
 */
export const getDriverDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  let user = null;
  let driverKyc = null;
  let driverVehicle = null;

  let driver = await Driver.findById(id)
    .populate('user', 'name email phone profileImage rating isActive')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    driver = await Driver.findOne({ user: id })
      .populate('user', 'name email phone profileImage rating isActive')
      .populate('vehicleDetails.vehicleType');
  }

  if (driver?.user) {
    user = driver.user;
    [driverKyc, driverVehicle] = await Promise.all([
      DriverKyc.findOne({ userId: user._id }).lean(),
      DriverVehicle.findOne({ userId: user._id }).populate('vehicleType').lean(),
    ]);
  }

  if (!driver) {
    user = await User.findOne({ _id: id, role: 'driver' })
      .select('name email phone profileImage rating isActive onboardingStage kycStatus createdAt')
      .lean();

    if (!user) {
      throw new NotFoundError('Driver');
    }

    [driverKyc, driverVehicle] = await Promise.all([
      DriverKyc.findOne({ userId: user._id }).lean(),
      DriverVehicle.findOne({ userId: user._id }).populate('vehicleType').lean(),
    ]);

    return res.json({
      status: 'success',
      data: {
        driver: formatDriverCandidateResponse({
          user,
          driver: null,
          driverKyc,
          driverVehicle,
        }),
        statistics: {
          total_rides: 0,
          completed_rides: 0,
          cancelled_rides: 0,
          total_earnings: 0,
          acceptance_rate: 0,
          cancellation_rate: 0,
          rating: user.rating || 0,
        },
        review: buildDriverReviewPayload({
          user,
          driver: null,
          driverKyc,
          driverVehicle,
        }),
      },
    });
  }

  // Get driver statistics
  const totalRides = await Ride.countDocuments({ driver: driver._id });
  const completedRides = await Ride.countDocuments({ driver: driver._id, status: 'completed' });
  const cancelledRides = await Ride.countDocuments({ driver: driver._id, status: 'cancelled' });
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
      review: buildDriverReviewPayload({
        user,
        driver,
        driverKyc,
        driverVehicle,
      }),
    },
  });
});

/**
 * Verify driver - PATCH /api/admin/drivers/:id/verify
 */
export const verifyDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;

  let driver = await Driver.findById(id).populate('user');
  if (!driver) {
    driver = await Driver.findOne({ user: id }).populate('user');
  }
  if (!driver) {
    throw new NotFoundError('Driver');
  }

  driver.documentsVerified = true;
  driver.verificationStatus = 'approved';
  driver.rejectionReason = null;
  driver.isAvailable = true;
  driver.isOnline = true;
  driver.lastActiveAt = new Date();
  const dayKey = new Date().toISOString().slice(0, 10);
  driver.statsDate = dayKey;
  driver.todayOnlineMs = 0;
  driver.onlineSessionStartedAt = new Date();
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

  // Create DVA for driver only when approved (Paystack DVA for wallet top-ups)
  try {
    provisionDvaAsync(driver.user._id);
  } catch (dvaErr) {
    logger.warn(`DVA provisioning after driver approve failed for ${driver.user._id}: ${dvaErr.message}`);
  }

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'driver_approve',
    resourceType: 'driver',
    resourceId: id,
    details: { driverId: id, userId: driver.user._id.toString() },
    req,
  });
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

  let driver = await Driver.findById(id).populate('user');
  if (!driver) {
    driver = await Driver.findOne({ user: id }).populate('user');
  }
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

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'driver_reject',
    resourceType: 'driver',
    resourceId: id,
    details: { driverId: id, reason },
    req,
  });
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
 * Approve driver KYC (identity) - PATCH /api/admin/drivers/kyc/:userId/approve
 */
export const approveDriverKyc = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const kyc = await DriverKyc.findOneAndUpdate(
    { userId },
    { verificationStatus: 'verified', rejectionReason: null },
    { new: true }
  );
  if (!kyc) throw new NotFoundError('Driver KYC record');
  await syncDriverVerificationStatus(userId);
  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'driver_kyc_approve',
    resourceType: 'driver_kyc',
    resourceId: kyc._id.toString(),
    details: { userId },
    req,
  });
  res.json({ status: 'success', message: 'Identity KYC approved' });
});

/**
 * Reject driver KYC - PATCH /api/admin/drivers/kyc/:userId/reject
 */
export const rejectDriverKyc = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};
  const kyc = await DriverKyc.findOneAndUpdate(
    { userId },
    { verificationStatus: 'rejected', rejectionReason: reason || 'Rejected by admin' },
    { new: true }
  );
  if (!kyc) throw new NotFoundError('Driver KYC record');
  await syncDriverVerificationStatus(userId);
  res.json({ status: 'success', message: 'Identity KYC rejected' });
});

/**
 * Approve driver vehicle - PATCH /api/admin/drivers/vehicle/:userId/approve
 */
export const approveDriverVehicle = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const vehicle = await DriverVehicle.findOneAndUpdate(
    { userId },
    { verificationStatus: 'verified', rejectionReason: null },
    { new: true }
  );
  if (!vehicle) throw new NotFoundError('Driver vehicle record');
  await syncDriverVerificationStatus(userId);
  res.json({ status: 'success', message: 'Vehicle verified' });
});

/**
 * Reject driver vehicle - PATCH /api/admin/drivers/vehicle/:userId/reject
 */
export const rejectDriverVehicle = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};
  const vehicle = await DriverVehicle.findOneAndUpdate(
    { userId },
    { verificationStatus: 'rejected', rejectionReason: reason || 'Rejected by admin' },
    { new: true }
  );
  if (!vehicle) throw new NotFoundError('Driver vehicle record');
  await syncDriverVerificationStatus(userId);
  res.json({ status: 'success', message: 'Vehicle rejected' });
});

async function syncDriverVerificationStatus(userId) {
  const [kyc, vehicle, driver] = await Promise.all([
    DriverKyc.findOne({ userId }).lean(),
    DriverVehicle.findOne({ userId }).lean(),
    Driver.findOne({ user: userId }),
  ]);
  const bothVerified = kyc?.verificationStatus === 'verified' && vehicle?.verificationStatus === 'verified';
  const user = await User.findById(userId);
  if (user) {
    user.kycStatus = bothVerified ? 'verified' : 'pending';
    await user.save();
  }
  if (driver) {
    const newlyApproved = bothVerified && driver.verificationStatus !== 'approved';
    driver.documentsVerified = bothVerified;
    driver.verificationStatus = bothVerified ? 'approved' : 'pending';
    if (!bothVerified) driver.rejectionReason = null;
    if (newlyApproved) {
      driver.isAvailable = true;
      driver.isOnline = true;
      driver.lastActiveAt = new Date();
      const dayKey = new Date().toISOString().slice(0, 10);
      driver.statsDate = dayKey;
      driver.todayOnlineMs = 0;
      driver.onlineSessionStartedAt = new Date();
    }
    await driver.save();
  }
  if (bothVerified && user && !user.topupAccountNumber) {
    provisionDvaAsync(userId);
  }
}

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
        currency: 'NGN',
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
    const safeSearch = escapeRegex(search);
    if (safeSearch) {
      ridesQuery = ridesQuery.where('rider').in(
        await User.find({
          $or: [
            { name: { $regex: safeSearch, $options: 'i' } },
            { email: { $regex: safeSearch, $options: 'i' } },
            { phone: { $regex: safeSearch, $options: 'i' } },
          ],
        }).distinct('_id')
      );
    }
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

  // Update allowed fields (with state transition check)
  if (updateData.status) {
    const newStatus = updateData.status;
    if (!canTransitionRideStatus(ride.status, newStatus)) {
      throw new ValidationError(
        `Invalid status transition: cannot change ride from "${ride.status}" to "${newStatus}"`
      );
    }
    ride.status = newStatus;
    ride.statusHistory.push({
      status: newStatus,
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
 * Assign driver to pending ride - POST /api/admin/rides/:id/assign
 */
export const assignRideDriver = asyncHandler(async (req, res) => {
  const { id: rideId } = req.params;
  const { driverId } = req.body;

  const ride = await Ride.findById(rideId)
    .populate('rider', 'name phone')
    .populate('vehicleType');

  if (!ride) {
    throw new NotFoundError('Ride');
  }

  const allowedStatuses = ['requested', 'searching', 'no-driver-found'];
  if (!allowedStatuses.includes(ride.status)) {
    throw new ValidationError(`Cannot assign driver: ride status is "${ride.status}". Only requested or no-driver-found rides can be assigned.`);
  }

  if (ride.driver) {
    throw new ValidationError('Ride already has a driver assigned');
  }

  const driver = await Driver.findById(driverId)
    .populate('user', 'name phone profileImage')
    .populate('vehicleDetails.vehicleType');

  if (!driver) {
    throw new NotFoundError('Driver');
  }

  if (driver.verificationStatus !== 'approved') {
    throw new ValidationError('Cannot assign unverified driver. Verify the driver first.');
  }

  const rideVehicleTypeId = (ride.vehicleType?._id || ride.vehicleType)?.toString();
  const driverVehicleTypeId = (driver.vehicleDetails?.vehicleType?._id || driver.vehicleDetails?.vehicleType)?.toString();
  if (rideVehicleTypeId && driverVehicleTypeId && rideVehicleTypeId !== driverVehicleTypeId) {
    throw new ValidationError('Driver vehicle type does not match the ride\'s vehicle type');
  }

  ride.driver = driver._id;
  ride.status = 'accepted';
  ride.acceptedByDriver = true;
  ride.acceptedAt = new Date();
  ride.statusHistory.push({
    status: 'accepted',
    timestamp: new Date(),
    note: `Driver assigned by admin: ${driver.user?.name || driverId}`,
  });
  await ride.save();

  driver.isAvailable = false;
  await driver.save();

  await ride.populate('driver.user', 'name phone profileImage');
  await ride.populate('driver', 'licenseNumber vehicleDetails rating');

  try {
    const pusherService = (await import('../services/pusherService.js')).default;
    if (pusherService && pusherService.emitRideStatusUpdate) {
      pusherService.emitRideStatusUpdate(ride, 'accepted', driver);
    }
  } catch (err) {
    logger.warn(`Pusher emit after admin assign: ${err.message}`);
  }

  try {
    const { createNotification } = await import('../services/notificationService.js');
    const riderUser = await User.findById(ride.rider._id).select('deviceToken').lean();
    if (riderUser?.deviceToken) {
      await createNotification(
        { _id: ride.rider._id, deviceToken: riderUser.deviceToken },
        'ride_accepted',
        'Driver assigned',
        'A driver has been assigned to your ride.',
        { rideId: ride._id.toString(), screen: 'home' },
        ride._id
      );
    }
  } catch (err) {
    logger.warn(`Push notification after admin assign: ${err.message}`);
  }

  logger.info(`Admin ${req.user._id} assigned driver ${driver._id} to ride ${rideId}`);

  res.json({
    status: 'success',
    message: 'Driver assigned successfully',
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

      await logAdminAction({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: 'dispute_resolve',
        resourceType: 'ride',
        resourceId: id,
        details: { rideId: id, refundAmount, resolution, reason },
        req,
      });
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
  const { page = 1, limit = 20, status, method, paymentType, dateFrom, dateTo } = req.query;
  const skip = (page - 1) * limit;

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (method) {
    filter.method = method;
  }

  if (paymentType) {
    filter.paymentType = paymentType; // e.g. wallet_topup, ride_payment
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

  if (payment.ride) {
    const ride = await Ride.findById(payment.ride).select('driver fare').lean();
    if (ride?.driver && ride.fare?.driverNetAmount != null && ride.fare?.totalFare > 0) {
      const driverRefundAmount = Math.round((refundAmount / payment.amount) * ride.fare.driverNetAmount * 100) / 100;
      if (driverRefundAmount > 0) {
        try {
          const { debitRefund } = await import('../services/walletService.js');
          await debitRefund(ride.driver, driverRefundAmount, payment.ride, reason || 'Ride refund');
        } catch (err) {
          logger.error(`Driver wallet refund failed for payment ${id}: ${err.message}`);
        }
      }
    }
  }

  await payment.processRefund(refundAmount, reason, `REFUND-${Date.now()}`);

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'refund',
    resourceType: 'payment',
    resourceId: id,
    details: { paymentId: id, refundAmount, reason, rideId: payment.ride?.toString() },
    req,
  });
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

  // Earnings were already deducted when withdrawal was created; just mark completed
  payment.status = 'completed';
  payment.paidAt = new Date();
  await payment.save();

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'withdrawal_approve',
    resourceType: 'withdrawal',
    resourceId: id,
    details: { withdrawalId: id, amount: Math.abs(payment.amount), userId: payment.user._id.toString() },
    req,
  });
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
 * Reject withdrawal - PATCH /api/admin/withdrawals/:id/reject
 */
export const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body || {};

  const payment = await Payment.findById(id).populate('user');
  if (!payment) {
    throw new NotFoundError('Withdrawal');
  }

  if (payment.status !== 'pending') {
    throw new ValidationError('Can only reject pending withdrawals');
  }

  const withdrawalAmount = Math.abs(payment.amount);

  // Refund driver earnings (deducted when withdrawal was created)
  const driver = await Driver.findOne({ user: payment.user._id });
  if (driver) {
    driver.earnings.total += withdrawalAmount;
    await driver.save();
  }

  payment.status = 'cancelled';
  payment.failureReason = reason || 'Rejected by admin';
  await payment.save();

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'withdrawal_reject',
    resourceType: 'withdrawal',
    resourceId: id,
    details: { withdrawalId: id, amount: withdrawalAmount, userId: payment.user._id.toString(), reason: reason || null },
    req,
  });
  logger.info(`Withdrawal ${id} rejected by admin ${req.user._id}`);

  res.json({
    status: 'success',
    message: 'Withdrawal rejected',
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
    profile_image: user.profileImage || null,
    role: user.role,
    is_active: user.isActive,
    is_verified: user.isVerified,
    is_reg_verified: user.isRegVerified,
    is_reg_completed: user.isRegCompleted,
    onboarding_stage: user.onboardingStage || null,
    kyc_status: user.kycStatus || null,
    date_of_birth: user.dateOfBirth || null,
    gender: user.gender || null,
    address: user.address || null,
    city: user.city || null,
    state: user.state || null,
    country: user.country || null,
    current_location: user.currentLocation?.coordinates?.length === 2 ? {
      longitude: user.currentLocation.coordinates[0],
      latitude: user.currentLocation.coordinates[1],
      address: user.currentLocation.address || null,
      last_updated: user.currentLocation.lastUpdated || null,
    } : null,
    addresses: Array.isArray(user.addresses)
      ? user.addresses.map((item) => ({
          name: item.name || null,
          normalised_label: item.normalisedLabel || null,
          address: item.address || null,
          is_default: Boolean(item.isDefault),
          last_used: item.lastUsed || null,
          use_count: item.useCount || 0,
          created_at: item.createdAt || null,
          location: item.location?.coordinates?.length === 2
            ? {
                longitude: item.location.coordinates[0],
                latitude: item.location.coordinates[1],
              }
            : null,
        }))
      : [],
    balance: user.balance || 0,
    rating: user.rating || 0,
    total_rides: user.totalRides || 0,
    topup_account_name: user.topupAccountName || null,
    topup_account_number: user.topupAccountNumber || null,
    topup_bank_name: user.topupBankName || null,
    paystack_customer_code: user.paystackCustomerCode || null,
    dva_account_number: user.dvaAccountNumber || null,
    dva_bank_name: user.dvaBankName || null,
    dva_account_name: user.dvaAccountName || null,
    wallet_account_number: user.walletAccountNumber || null,
    referral_code: user.referralCode || null,
    referred_by: user.referredBy?.toString?.() || user.referredBy || null,
    emergency_contacts: Array.isArray(user.emergencyContacts)
      ? user.emergencyContacts.map((contact) => ({
          name: contact.name,
          phone: contact.phone,
          relationship: contact.relationship || 'emergency',
          created_at: contact.createdAt || null,
        }))
      : [],
    police_emergency_contact: user.policeEmergencyContact || null,
    ten_ride_free_claimed: Boolean(user.tenRideFreeClaimed),
    referral_rewards_claimed_count: user.referralRewardsClaimedCount || 0,
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
    has_driver_profile: true,
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

const formatDriverCandidateResponse = ({ user, driver, driverKyc, driverVehicle }) => {
  if (driver) {
    return formatDriverResponse({
      ...driver,
      user: {
        ...(typeof driver.user === 'object' ? driver.user : {}),
        _id: user?._id || driver.user?._id || driver.user,
        name: user?.name || driver.user?.name || null,
        email: user?.email || driver.user?.email || null,
        phone: user?.phone || driver.user?.phone || null,
        profileImage: user?.profileImage || driver.user?.profileImage || null,
        isActive: user?.isActive ?? driver.user?.isActive ?? false,
      },
    });
  }

  const effectiveStatus = driverKyc?.verificationStatus === 'rejected' || driverVehicle?.verificationStatus === 'rejected'
    ? 'rejected'
    : user?.kycStatus === 'verified'
      ? 'approved'
      : 'pending';

  return {
    driver_id: user?._id?.toString() || null,
    has_driver_profile: false,
    user: user
      ? {
          user_id: user._id?.toString() || null,
          name: user.name,
          email: user.email,
          phone: user.phone,
          image: user.profileImage || null,
          is_active: user.isActive,
        }
      : null,
    license_number: driverKyc?.idNumber || null,
    vehicle_details: driverVehicle
      ? {
          make: driverVehicle.make || null,
          model: driverVehicle.model || null,
          year: driverVehicle.year || null,
          plate_number: driverVehicle.plateNumber || null,
          color: driverVehicle.color || null,
          vehicle_type: driverVehicle.vehicleType?._id?.toString() || driverVehicle.vehicleType?.toString() || null,
        }
      : null,
    documents_verified: driverKyc?.verificationStatus === 'verified' && driverVehicle?.verificationStatus === 'verified',
    verification_status: effectiveStatus,
    is_online: false,
    is_available: false,
    earnings: null,
    rating: user?.rating || 0,
    onboarding_stage: user?.onboardingStage || null,
    kyc_status: user?.kycStatus || null,
    driver_kyc_status: driverKyc?.verificationStatus || null,
    driver_vehicle_status: driverVehicle?.verificationStatus || null,
    created_at: user?.createdAt || null,
  };
};

const buildDriverReviewPayload = ({ user, driver, driverKyc, driverVehicle }) => {
  const identityChecklist = [
    { key: 'id_type', label: 'ID type selected', complete: Boolean(driverKyc?.idType) },
    { key: 'id_number', label: 'ID number entered', complete: Boolean(driverKyc?.idNumber) },
    { key: 'id_image', label: 'ID image uploaded', complete: Boolean(driverKyc?.idImageUrl) },
    { key: 'selfie', label: 'Selfie uploaded', complete: Boolean(driverKyc?.selfieUrl) },
  ];
  const vehicleChecklist = [
    { key: 'vehicle_type', label: 'Vehicle type selected', complete: Boolean(driverVehicle?.vehicleType) },
    { key: 'plate_number', label: 'Plate number entered', complete: Boolean(driverVehicle?.plateNumber) },
    { key: 'make', label: 'Vehicle make entered', complete: Boolean(driverVehicle?.make) },
    { key: 'model', label: 'Vehicle model entered', complete: Boolean(driverVehicle?.model) },
    { key: 'year', label: 'Vehicle year entered', complete: Boolean(driverVehicle?.year) },
    { key: 'color', label: 'Vehicle color entered', complete: Boolean(driverVehicle?.color) },
    { key: 'vehicle_document', label: 'Vehicle document uploaded', complete: Array.isArray(driverVehicle?.vehicleDocuments) && driverVehicle.vehicleDocuments.length > 0 },
    { key: 'insurance_document', label: 'Insurance document uploaded', complete: Boolean(driverVehicle?.insuranceDocumentUrl) },
  ];
  const completedChecklistCount = [...identityChecklist, ...vehicleChecklist].filter((item) => item.complete).length;
  const totalChecklistCount = identityChecklist.length + vehicleChecklist.length;
  const stepStates = [
    {
      key: 'identity',
      label: 'Identity documents',
      complete: Boolean(driverKyc),
      verified: driverKyc?.verificationStatus === 'verified',
      rejected: driverKyc?.verificationStatus === 'rejected',
    },
    {
      key: 'vehicle',
      label: 'Vehicle documents',
      complete: Boolean(driverVehicle),
      verified: driverVehicle?.verificationStatus === 'verified',
      rejected: driverVehicle?.verificationStatus === 'rejected',
    },
    {
      key: 'driver_profile',
      label: 'Driver profile created',
      complete: Boolean(driver),
      verified: driver?.verificationStatus === 'approved',
      rejected: driver?.verificationStatus === 'rejected',
    },
  ];

  return {
    user_id: user?._id?.toString() || driver?.user?._id?.toString() || null,
    driver_id: driver?._id?.toString() || null,
    is_active: user?.isActive ?? driver?.user?.isActive ?? false,
    overall_verification_status: driver?.verificationStatus || (driverKyc?.verificationStatus === 'rejected' || driverVehicle?.verificationStatus === 'rejected' ? 'rejected' : 'pending'),
    documents_verified: Boolean(driver?.documentsVerified),
    overall_rejection_reason: driver?.rejectionReason || null,
    upload_progress: {
      completed_items: completedChecklistCount,
      total_items: totalChecklistCount,
      percent: totalChecklistCount > 0 ? Math.round((completedChecklistCount / totalChecklistCount) * 100) : 0,
      steps: stepStates,
    },
    identity: {
      exists: Boolean(driverKyc),
      verification_status: driverKyc?.verificationStatus || 'not_started',
      rejection_reason: driverKyc?.rejectionReason || null,
      id_type: driverKyc?.idType || null,
      id_number: driverKyc?.idNumber || null,
      id_image_url: driverKyc?.idImageUrl || null,
      selfie_url: driverKyc?.selfieUrl || null,
      created_at: driverKyc?.createdAt || null,
      updated_at: driverKyc?.updatedAt || null,
      checklist: identityChecklist,
    },
    vehicle: {
      exists: Boolean(driverVehicle),
      verification_status: driverVehicle?.verificationStatus || 'not_started',
      rejection_reason: driverVehicle?.rejectionReason || null,
      vehicle_type: driverVehicle?.vehicleType
        ? {
            id: driverVehicle.vehicleType._id?.toString() || driverVehicle.vehicleType?.toString() || null,
            name: driverVehicle.vehicleType.displayName || driverVehicle.vehicleType.name || null,
          }
        : null,
      plate_number: driverVehicle?.plateNumber || null,
      make: driverVehicle?.make || null,
      model: driverVehicle?.model || null,
      year: driverVehicle?.year || null,
      color: driverVehicle?.color || null,
      insurance_document_url: driverVehicle?.insuranceDocumentUrl || null,
      vehicle_documents: (() => {
        const existingVehicleDocs = Array.isArray(driverVehicle?.vehicleDocuments)
          ? driverVehicle.vehicleDocuments.map((doc) => ({
              type: doc.type || 'other',
              url: doc.url || null,
              uploaded_at: doc.uploadedAt || null,
            }))
          : [];
        const driverVehicleImages = (driver?.vehicleImages || []).map((img) => ({
          type: 'vehicle_image',
          url: img.url || null,
          uploaded_at: img.uploadedAt || img.createdAt || null,
        }));
        const seenUrls = new Set(existingVehicleDocs.map((d) => d.url).filter(Boolean));
        const fromDriverOnly = driverVehicleImages.filter((d) => d.url && !seenUrls.has(d.url));
        return [...existingVehicleDocs, ...fromDriverOnly];
      })(),
      created_at: driverVehicle?.createdAt || null,
      updated_at: driverVehicle?.updatedAt || null,
      checklist: vehicleChecklist,
    },
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
    vehicle_type_id: ride.vehicleType?._id?.toString() || ride.vehicleType?.toString() || null,
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

  // Default years for driver registration: current year back 15 years
  const currentYear = new Date().getFullYear();
  const defaultYears = Array.from({ length: 16 }, (_, i) => ({
    value: currentYear - i,
    isActive: true,
  }));

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
    years: defaultYears,
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

  await logAdminAction({
    adminId: req.user._id,
    adminEmail: req.user.email,
    action: 'vehicle_type_delete',
    resourceType: 'vehicle_type',
    resourceId: id,
    details: { vehicleTypeName: vehicleType.name },
    req,
  });
  logger.info(`Vehicle type deleted by admin ${req.user._id}: ${vehicleType.name}`);

  res.json({
    status: 'success',
    message: 'Vehicle type deleted successfully',
  });
});

/**
 * GET /admin/financial-summary
 */
export const getFinancialSummary = asyncHandler(async (req, res) => {
  const totalPlatformRevenue = await Transaction.aggregate([
    { $match: { type: 'commission' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).then((r) => (r[0]?.total ?? 0));

  const totalDriverPayouts = await Transaction.aggregate([
    { $match: { type: 'withdrawal' } },
    { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
  ]).then((r) => (r[0]?.total ?? 0));

  const walletAgg = await DriverWallet.aggregate([
    { $group: { _id: null, available: { $sum: '$availableBalance' }, pending: { $sum: '$pendingBalance' } } },
  ]).then((r) => r[0] || { available: 0, pending: 0 });

  const outstandingLiabilities = walletAgg.available + walletAgg.pending;
  const pendingPayoutCount = await PayoutRequest.countDocuments({ status: 'pending' });
  const pendingPayoutSum = await PayoutRequest.aggregate([
    { $match: { status: 'pending' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).then((r) => (r[0]?.total ?? 0));

  res.json({
    status: 'success',
    data: {
      total_platform_revenue: totalPlatformRevenue,
      total_driver_payouts: totalDriverPayouts,
      outstanding_liabilities: outstandingLiabilities,
      pending_balances_total: walletAgg.pending,
      available_balances_total: walletAgg.available,
      pending_payout_requests_count: pendingPayoutCount,
      pending_payout_requests_amount: pendingPayoutSum,
    },
  });
});

/**
 * GET /admin/driver/:id/wallet
 */
export const getDriverWalletAdmin = asyncHandler(async (req, res) => {
  const driverId = req.params.id;
  const driver = await Driver.findById(driverId);
  if (!driver) throw new NotFoundError('Driver');

  const { getOrCreateWallet } = await import('../services/walletService.js');
  const wallet = await getOrCreateWallet(driverId);

  res.json({
    status: 'success',
    data: {
      driver_id: driver._id.toString(),
      available_balance: wallet.availableBalance,
      pending_balance: wallet.pendingBalance,
      total_earned: wallet.totalEarned,
      total_withdrawn: wallet.totalWithdrawn,
      currency: wallet.currency,
    },
  });
});

/**
 * GET /admin/transactions
 */
export const getTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, driverId, type } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = {};
  if (driverId) filter.driverId = driverId;
  if (type) filter.type = type;

  const [transactions, total] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    status: 'success',
    data: {
      transactions: transactions.map((t) => ({
        transaction_id: t.transactionId,
        ride_id: t.rideId?.toString() ?? null,
        driver_id: t.driverId?.toString(),
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        balance_before: t.balanceBefore,
        balance_after: t.balanceAfter,
        created_at: t.createdAt,
        metadata: t.metadata,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

/**
 * GET /admin/payout-requests
 */
export const listPayoutRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = {};
  if (status) filter.status = status;

  const [payouts, total] = await Promise.all([
    PayoutRequest.find(filter)
      .populate({ path: 'driverId', populate: { path: 'user', select: 'name email phone' } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    PayoutRequest.countDocuments(filter),
  ]);

  res.json({
    status: 'success',
    data: {
      payout_requests: payouts.map((p) => ({
        payout_request_id: p._id.toString(),
        driver_id: p.driverId?._id?.toString(),
        driver_name: p.driverId?.user?.name ?? null,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        requested_at: p.requestedAt,
        processed_at: p.processedAt,
        reference: p.reference,
        rejection_reason: p.rejectionReason,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

/**
 * GET /admin/wallet-transactions - User wallet funding ledger (Paystack top-ups)
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, userId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = {};
  if (userId) filter.user = userId;

  const [transactions, total] = await Promise.all([
    WalletFundingTransaction.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    WalletFundingTransaction.countDocuments(filter),
  ]);

  res.json({
    status: 'success',
    data: {
      wallet_transactions: transactions.map((t) => ({
        reference: t.reference,
        user_id: t.user?._id?.toString(),
        user_email: t.user?.email,
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        balance_before: t.balanceBefore,
        balance_after: t.balanceAfter,
        created_at: t.createdAt,
        metadata: t.metadata,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});

/**
 * GET /admin/wallet-summary - Wallet funding aggregates (total funded, refunded, pending, failed)
 */
function sumPaymentAmount(match) {
  return Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
}
function sumPaymentRefundAmount(match) {
  return Payment.aggregate([{ $match: match }, { $group: { _id: null, total: { $sum: '$refundAmount' } } }]);
}

export const getWalletSummary = asyncHandler(async (req, res) => {
  const walletFilter = { paymentType: 'wallet_topup' };

  const completedAgg = sumPaymentAmount({ ...walletFilter, status: 'completed' });
  const refundedAgg = sumPaymentRefundAmount({ ...walletFilter, status: 'refunded' });
  const pendingAgg = sumPaymentAmount({ ...walletFilter, status: { $in: ['initialized', 'pending'] } });
  const failedAgg = sumPaymentAmount({ ...walletFilter, status: 'failed' });

  const [completedRes, refundedRes, pendingCount, pendingRes, failedCount, failedRes] = await Promise.all([
    completedAgg,
    refundedAgg,
    Payment.countDocuments({ ...walletFilter, status: { $in: ['initialized', 'pending'] } }),
    pendingAgg,
    Payment.countDocuments({ ...walletFilter, status: 'failed' }),
    failedAgg,
  ]);

  const completedSum = completedRes[0]?.total ?? 0;
  const refundedSum = refundedRes[0]?.total ?? 0;
  const pendingSum = pendingRes[0]?.total ?? 0;
  const failedSum = failedRes[0]?.total ?? 0;

  res.json({
    status: 'success',
    data: {
      total_funded: completedSum,
      total_refunded: refundedSum,
      pending_funding_count: pendingCount,
      pending_funding_amount: pendingSum,
      failed_count: failedCount,
      failed_amount: failedSum,
    },
  });
});
