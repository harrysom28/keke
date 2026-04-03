import AdminSettings from '../models/AdminSettings.js';
import logger from '../utils/logger.js';

const DEFAULT_COMMISSION_PERCENT = Number(process.env.PLATFORM_COMMISSION_PERCENT) || 20;
const COMMISSION_SETTINGS_KEY = 'default';

/**
 * @typedef {Object} CommissionResult
 * @property {number} grossFare
 * @property {number} commissionAmount
 * @property {number} driverNetAmount
 * @property {number} platformRevenue
 * @property {number} commissionRate - rate used (0-100)
 */

/**
 * Get effective commission rate for a ride (percentage 0-100).
 * Priority: promotional override > vehicle override > default (ENV/DB).
 * @param {Object} options
 * @param {string} [options.vehicleTypeId] - mongoose ObjectId string
 * @param {boolean} [options.promotionalRate] - if true, use promotional (0 or reduced)
 * @returns {Promise<number>} rate 0-100
 */
async function getEffectiveCommissionRate({ vehicleTypeId = null, promotionalRate = false } = {}) {
  let settings = await AdminSettings.findOne({ key: COMMISSION_SETTINGS_KEY }).lean();
  const commissionConfig = settings?.commission || {};
  const defaultRate = commissionConfig.defaultRate ?? DEFAULT_COMMISSION_PERCENT;
  const promotional = commissionConfig.promotionalRate ?? 0;

  if (promotionalRate && (commissionConfig.promotionalEnabled !== false)) {
    return Math.min(100, Math.max(0, promotional));
  }

  if (vehicleTypeId && commissionConfig.vehicleOverrides && typeof commissionConfig.vehicleOverrides === 'object') {
    const override = commissionConfig.vehicleOverrides[vehicleTypeId.toString()];
    if (typeof override === 'number') {
      return Math.min(100, Math.max(0, override));
    }
  }

  return Math.min(100, Math.max(0, defaultRate));
}

/**
 * Compute commission and driver net for a gross fare.
 * @param {number} grossFare - total fare amount (positive)
 * @param {Object} options
 * @param {string} [options.vehicleTypeId]
 * @param {boolean} [options.promotionalRate]
 * @returns {Promise<CommissionResult>}
 */
export async function computeCommission(grossFare, options = {}) {
  if (grossFare == null || typeof grossFare !== 'number' || grossFare < 0) {
    throw new Error('Invalid gross fare');
  }

  const rate = await getEffectiveCommissionRate(options);
  const commissionAmount = Math.round((grossFare * rate / 100) * 100) / 100;
  const driverNetAmount = Math.round((grossFare - commissionAmount) * 100) / 100;
  const platformRevenue = commissionAmount;

  return {
    grossFare,
    commissionAmount,
    driverNetAmount,
    platformRevenue,
    commissionRate: rate,
  };
}

export { getEffectiveCommissionRate };
