/**
 * Async DVA provisioning - does not block login/signup
 */
import User from '../models/User.js';
import AdminSettings from '../models/AdminSettings.js';
import { createDVAForUser } from './paystackService.js';
import logger from '../utils/logger.js';

/**
 * Provision DVA for user in background
 */
export function provisionDvaAsync(userId) {
  setImmediate(async () => {
    try {
      const user = await User.findById(userId);
      if (!user || user.topupAccountNumber) return;

      const settings = await AdminSettings.findOne({ key: 'default' }).lean();
      const preferredBank = settings?.dvaPreferredBank || 'wema-bank';
      const dva = await createDVAForUser(user, preferredBank);
      if (dva) {
        user.topupAccountNumber = dva.account_number;
        user.topupBankName = dva.bank_name;
        user.topupAccountName = dva.account_name;
        user.paystackCustomerCode = dva.paystackCustomerCode;
        await user.save({ validateBeforeSave: false });
        logger.info(`DVA provisioned for user ${userId}`);
      }
    } catch (err) {
      logger.warn(`DVA async provisioning failed for ${userId}: ${err.message}`);
    }
  });
}
