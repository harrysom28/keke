/**
 * Admin audit logging service
 */
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';

/**
 * Log an admin action for audit trail
 * @param {Object} params
 * @param {string} params.adminId - Admin user ID
 * @param {string} params.adminEmail - Admin email
 * @param {string} params.action - Action type
 * @param {string} params.resourceType - Resource type
 * @param {string} [params.resourceId] - Resource ID
 * @param {Object} [params.details] - Additional details
 * @param {Object} [params.req] - Express request (for IP, user agent)
 */
export async function logAdminAction({ adminId, adminEmail, action, resourceType, resourceId, details = {}, req }) {
  try {
    await AuditLog.create({
      adminId,
      adminEmail,
      action,
      resourceType,
      resourceId: resourceId?.toString?.(),
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.headers?.['user-agent'],
    });
  } catch (err) {
    logger.error(`Audit log failed: ${err.message}`);
    // Don't throw - audit failure shouldn't break the operation
  }
}

export default { logAdminAction };
