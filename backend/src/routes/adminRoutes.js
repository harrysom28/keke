import express from 'express';
import * as adminController from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { validationRules, validate } from '../middleware/validation.js';

const router = express.Router();

// Admin authentication routes (public)
router.post('/login', validationRules.adminLogin, validate, adminController.adminLogin);

// All admin routes require authentication and admin role
router.use(protect);
router.use(requireAdmin);

// Admin profile
router.post('/logout', adminController.adminLogout);
router.get('/me', adminController.getAdminProfile);

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/analytics', adminController.getAnalytics);

// User management
router.get('/users', adminController.listUsers);
router.get('/users/:id', validationRules.mongoId, validate, adminController.getUserDetails);
router.patch('/users/:id', validationRules.mongoId, validate, validationRules.updateUser, validate, adminController.updateUser);
router.patch('/users/:id/activate', validationRules.mongoId, validate, adminController.activateUser);
router.patch('/users/:id/deactivate', validationRules.mongoId, validate, adminController.deactivateUser);
router.delete('/users/:id', validationRules.mongoId, validate, adminController.deleteUser);

// Driver management
router.get('/drivers', adminController.listDrivers);
router.get('/drivers/:id', validationRules.mongoId, validate, adminController.getDriverDetails);
router.patch('/drivers/:id/verify', validationRules.mongoId, validate, adminController.verifyDriver);
router.patch('/drivers/:id/reject', validationRules.mongoId, validate, validationRules.rejectDriver, validate, adminController.rejectDriver);
router.get('/drivers/:id/earnings', validationRules.mongoId, validate, adminController.getDriverEarnings);
router.get('/drivers/:id/rides', validationRules.mongoId, validate, adminController.getDriverRides);

// Ride management
router.get('/rides', adminController.listRides);
router.get('/rides/:id', validationRules.mongoId, validate, adminController.getRideDetails);
router.patch('/rides/:id', validationRules.mongoId, validate, validationRules.updateRide, validate, adminController.updateRide);
router.post('/rides/:id/dispute', validationRules.mongoId, validate, validationRules.handleDispute, validate, adminController.handleDispute);

// Financial management
router.get('/payments', adminController.listPayments);
router.get('/revenue', adminController.getRevenueStats);
router.post('/payments/:id/refund', validationRules.mongoId, validate, validationRules.processRefund, validate, adminController.processRefund);
router.get('/withdrawals', adminController.listWithdrawals);
router.patch('/withdrawals/:id/approve', validationRules.mongoId, validate, adminController.approveWithdrawal);

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
router.post('/vehicle-types', adminController.createVehicleType);
router.patch('/vehicle-types/:id', validationRules.mongoId, validate, adminController.updateVehicleType);
router.delete('/vehicle-types/:id', validationRules.mongoId, validate, adminController.deleteVehicleType);

export default router;
