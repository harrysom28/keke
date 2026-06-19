/**
 * Async DVA provisioning - does not block login/signup
 */
import User from '../models/User.js';
import AdminSettings from '../models/AdminSettings.js';
import { createDVAForUser } from './paystackService.js';
import logger from '../utils/logger.js';

/**
 * Provision DVA for user in background. Never throws — failures are logged
 * and the user record is left without topupAccountNumber so a later
 * profile/wallet fetch can retry provisioning.
 */
export function provisionDvaAsync(userId) {
  setImmediate(async () => {
    try {
      const user = await User.findById(userId);
      if (!user || user.topupAccountNumber) return;

      const settings = await AdminSettings.findOne({ key: 'default' }).lean();
      const preferredBank = settings?.dvaPreferredBank || 'wema-bank';

      let dva = null;
      try {
        dva = await createDVAForUser(user, preferredBank);
      } catch (dvaErr) {
        logger.warn(`DVA createDVAForUser threw for ${userId}: ${dvaErr.message}`);
      }

      if (dva) {
        user.topupAccountNumber = dva.account_number;
        user.topupBankName = dva.bank_name;
        user.topupAccountName = dva.account_name;
        user.paystackCustomerCode = dva.paystackCustomerCode;
        await user.save({ validateBeforeSave: false });
        logger.info(`DVA provisioned for user ${userId}`);
      } else {
        logger.warn(
          `DVA provisioning deferred for ${userId} — topup account missing; will retry on next profile/wallet fetch`
        );
      }
    } catch (err) {
      logger.warn(`DVA async provisioning failed for ${userId}: ${err.message}`);
    }
  });
}
