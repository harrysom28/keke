import express from 'express';
import * as adminController from '../controllers/adminController.js';
import * as notificationController from '../controllers/notificationController.js';
import * as payoutController from '../controllers/payoutController.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';
import { limiters } from '../middleware/rateLimiter.js';

const router = express.Router();

// Admin authentication routes (public, rate-limited)
router.post('/login', limiters.adminLoginLimiter, validationRules.adminLogin, validate, adminController.adminLogin);

// All admin routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// Admin profile
router.post('/logout', adminController.adminLogout);
router.get('/me', adminController.getAdminProfile);

// Audit logs
router.get('/audit-logs', validationRules.auditLogsQuery, validate, adminController.getAuditLogs);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/dashboard/live', adminController.getDashboardLive);
router.get('/analytics', adminController.getAnalytics);

// Settings (alerts, etc.)
router.get('/settings', adminController.getSettings);
router.patch('/settings', validationRules.updateSettings, validate, adminController.updateSettings);

// User management
router.get('/users', adminController.listUsers);
router.get('/users/:id', validationRules.mongoId, validate, adminController.getUserDetails);
router.patch('/users/:id', validationRules.mongoId, validate, validationRules.updateUser, validate, adminController.updateUser);
router.patch('/users/:id/activate', validationRules.mongoId, validate, adminController.activateUser);
router.patch('/users/:id/deactivate', validationRules.mongoId, validate, adminController.deactivateUser);
router.delete('/users/:id', validationRules.mongoId, validate, adminController.deleteUser);

// Driver management (specific routes before :id)
router.get('/drivers', adminController.listDrivers);
router.patch('/drivers/kyc/:userId/approve', validationRules.mongoUserId, validate, adminController.approveDriverKyc);
router.patch('/drivers/kyc/:userId/reject', validationRules.mongoUserId, validate, adminController.rejectDriverKyc);
router.patch('/drivers/vehicle/:userId/approve', validationRules.mongoUserId, validate, adminController.approveDriverVehicle);
router.patch('/drivers/vehicle/:userId/reject', validationRules.mongoUserId, validate, adminController.rejectDriverVehicle);
router.get('/drivers/:id', validationRules.mongoId, validate, adminController.getDriverDetails);
router.patch('/drivers/:id/verify', validationRules.mongoId, validate, adminController.verifyDriver);
router.patch('/drivers/:id/reject', validationRules.mongoId, validate, validationRules.rejectDriver, validate, adminController.rejectDriver);
router.get('/drivers/:id/earnings', validationRules.mongoId, validate, adminController.getDriverEarnings);
router.get('/drivers/:id/rides', validationRules.mongoId, validate, adminController.getDriverRides);

// Ride management
router.get('/rides', adminController.listRides);
router.get('/rides/:id', validationRules.mongoId, validate, adminController.getRideDetails);
router.patch('/rides/:id', validationRules.mongoId, validate, validationRules.updateRide, validate, adminController.updateRide);
router.post('/rides/:id/assign', validationRules.mongoId, validate, validationRules.assignRideDriver, validate, adminController.assignRideDriver);
router.post('/rides/:id/dispute', validationRules.mongoId, validate, validationRules.handleDispute, validate, adminController.handleDispute);

// Financial management
router.get('/payments', adminController.listPayments);
router.get('/wallet-transactions', adminController.getWalletTransactions);
router.get('/wallet-summary', adminController.getWalletSummary);
router.get('/revenue', adminController.getRevenueStats);
router.get('/financial-summary', adminController.getFinancialSummary);
router.get('/driver/:id/wallet', validationRules.mongoId, validate, adminController.getDriverWalletAdmin);
router.get('/transactions', adminController.getTransactions);
router.get('/payout-requests', adminController.listPayoutRequests);
router.patch('/payout-requests/:id/approve', validationRules.mongoId, validate, payoutController.approvePayout);
router.patch('/payout-requests/:id/reject', validationRules.mongoId, validate, payoutController.rejectPayout);
router.post('/payments/:id/refund', validationRules.mongoId, validate, validationRules.processRefund, validate, adminController.processRefund);
router.get('/withdrawals', adminController.listWithdrawals);
router.patch('/withdrawals/:id/approve', validationRules.mongoId, validate, adminController.approveWithdrawal);
router.patch('/withdrawals/:id/reject', validationRules.mongoId, validate, adminController.rejectWithdrawal);

// Notification broadcasts
router.post('/notifications/broadcast', notificationController.broadcastNotification);
router.post('/notifications/targeting-preview', notificationController.targetingPreview);

// Support tickets
router.get('/support-tickets', adminController.listSupportTickets);
router.get('/support-tickets/:id', validationRules.mongoId, validate, adminController.getTicketDetails);
router.post('/support-tickets/:id/assign', validationRules.mongoId, validate, validationRules.assignTicket, validate, adminController.assignTicket);
router.post('/support-tickets/:id/resolve', validationRules.mongoId, validate, validationRules.resolveTicket, validate, adminController.resolveTicket);
router.post('/support-tickets/:id/respond', validationRules.mongoId, validate, validationRules.respondToTicket, validate, adminController.respondToTicket);

// Settings (Promocodes)
router.get('/promocodes', adminController.listPromocodes);
router.post('/promocodes', validationRules.createPromocode, validate, adminController.createPromocode);
router.patch('/promocodes/:id', validationRules.mongoId, validate, validationRules.updatePromocode, validate, adminController.updatePromocode);

// Vehicle Type Management
router.get('/vehicle-types', adminController.listVehicleTypes);
router.post('/vehicle-types', validationRules.createVehicleType, validate, adminController.createVehicleType);
router.patch('/vehicle-types/:id', validationRules.mongoId, validate, adminController.updateVehicleType);
router.delete('/vehicle-types/:id', validationRules.mongoId, validate, adminController.deleteVehicleType);

export default router;
