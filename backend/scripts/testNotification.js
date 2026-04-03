#!/usr/bin/env node
/**
 * Test notification script - sends a test push to verify notification system.
 * Usage:
 *   node scripts/testNotification.js                    # uses first user with deviceToken
 *   node scripts/testNotification.js <userId>           # specific user ID
 *   node scripts/testNotification.js <phone>            # user by phone (e.g. 2349035689338)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import {
  sendPushNotification,
  buildStandardPushData,
  createNotification,
} from '../src/services/notificationService.js';
import logger from '../src/utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';

async function run() {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    const arg = process.argv[2];
    let user;

    if (arg) {
      if (mongoose.Types.ObjectId.isValid(arg) && String(new mongoose.Types.ObjectId(arg)) === arg) {
        user = await User.findById(arg).select('name phone email deviceToken').lean();
      } else {
        user = await User.findOne({ phone: arg.replace(/\D/g, '').replace(/^0/, '234') })
          .select('name phone email deviceToken')
          .lean();
      }
      if (!user) {
        logger.error(`User not found: ${arg}`);
        process.exit(1);
      }
    } else {
      user = await User.findOne({ deviceToken: { $exists: true, $ne: null, $ne: '' } })
        .select('name phone email deviceToken')
        .lean();
      if (!user) {
        logger.error('No user with deviceToken found. Log in to the app on a device first to register a token.');
        process.exit(1);
      }
    }

    logger.info(`Test user: ${user.name || user.phone} (${user._id})`);
    logger.info(`Device token: ${user.deviceToken ? user.deviceToken.substring(0, 30) + '...' : 'NONE'}`);

    if (!user.deviceToken) {
      logger.error('User has no deviceToken. Open the app, log in, and grant notification permission.');
      process.exit(1);
    }

    // 1. Test raw push (standard payload)
    logger.info('\n--- Test 1: Raw push with standard payload ---');
    const pushData = buildStandardPushData({
      type: 'ride_update',
      subType: 'test',
      screen: 'ride_tracking',
      rideId: 'test-ride-123',
      priority: 'high',
    });
    const pushResult = await sendPushNotification(
      user.deviceToken,
      'Test push',
      'Notification system test - tap to open ride_tracking',
      pushData,
      user._id.toString()
    );
    logger.info(`Push result: ${pushResult.success ? '✅ Sent' : '❌ Failed'}`);

    // 2. Test createNotification (DB + push + optional SMS fallback)
    logger.info('\n--- Test 2: createNotification (DB + push) ---');
    const notif = await createNotification(
      { _id: user._id, deviceToken: user.deviceToken, phone: user.phone },
      'general',
      'Test notification',
      'This was created via createNotification. Check your notification list.',
      { test: 'true' },
      null,
      null
    );
    logger.info(`Notification created: ${notif._id}`);
    logger.info('Check the app: Notifications screen should show this (realtime sync if already open).\n');

    process.exit(0);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
