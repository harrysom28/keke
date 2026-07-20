#!/usr/bin/env node
/**
 * Send a test push notification to existing users.
 *
 * Usage (from backend/):
 *   npm run test:notification
 *   npm run test:notification -- <userId>
 *   npm run test:notification -- <phone>
 *   npm run test:notification -- --all
 *   npm run test:notification -- --role=driver
 *   npm run test:notification -- --role=rider --limit=10
 *   npm run test:notification -- --all --title="Hello" --body="Test message"
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS_JSON (or FCM_SERVER_KEY) in backend/.env
 * and users who have opened the app with notification permission granted.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import {
  sendPushNotification,
  buildStandardPushData,
  sendToUser,
} from '../src/services/notificationService.js';
import logger from '../src/utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/keke';

const TOKEN_FILTER = {
  $or: [
    { fcm_token: { $exists: true, $nin: [null, ''] } },
    { deviceToken: { $exists: true, $nin: [null, ''] } },
    { expoPushToken: { $exists: true, $nin: [null, ''] } },
  ],
};

const USER_SELECT = 'name phone email role fcm_token deviceToken expoPushToken';

function parseArgs(argv) {
  const flags = {
    all: false,
    role: null,
    limit: null,
    title: 'Test push',
    body: 'Notification system test — tap to open the app',
    inbox: true,
  };
  const positionals = [];

  for (const raw of argv) {
    if (raw === '--all') {
      flags.all = true;
    } else if (raw === '--no-inbox') {
      flags.inbox = false;
    } else if (raw.startsWith('--role=')) {
      flags.role = raw.slice('--role='.length).toLowerCase();
    } else if (raw.startsWith('--limit=')) {
      flags.limit = Number(raw.slice('--limit='.length));
    } else if (raw.startsWith('--title=')) {
      flags.title = raw.slice('--title='.length);
    } else if (raw.startsWith('--body=')) {
      flags.body = raw.slice('--body='.length);
    } else if (!raw.startsWith('--')) {
      positionals.push(raw);
    } else {
      logger.error(`Unknown flag: ${raw}`);
      process.exit(1);
    }
  }

  return { flags, positionals };
}

/** Same preference order as notificationService.getUserFcmToken */
function resolvePushToken(user) {
  const fcm = user?.fcm_token;
  if (fcm && !String(fcm).startsWith('ExponentPushToken[')) return fcm;
  return user?.expoPushToken || user?.fcm_token || user?.deviceToken || '';
}

function tokenKind(token) {
  if (!token) return 'none';
  if (String(token).startsWith('ExponentPushToken[')) return 'expo';
  return 'fcm';
}

function normalizePhone(input) {
  return String(input).replace(/\D/g, '').replace(/^0/, '234');
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value;
}

function roleQuery(role) {
  if (!role) return {};
  if (role === 'driver') return { role: 'driver' };
  if (role === 'rider' || role === 'passenger') {
    return { role: { $in: ['rider', 'passenger'] } };
  }
  logger.error(`Invalid --role=${role}. Use driver or rider.`);
  process.exit(1);
}

async function findUsers({ flags, positionals }) {
  const target = positionals[0];

  if (flags.all || flags.role || flags.limit != null) {
    const query = { ...TOKEN_FILTER, ...roleQuery(flags.role) };
    let q = User.find(query).select(USER_SELECT).sort({ updatedAt: -1 });
    if (flags.limit != null && Number.isFinite(flags.limit) && flags.limit > 0) {
      q = q.limit(flags.limit);
    }
    const users = await q.lean();
    return users;
  }

  if (target) {
    let user;
    if (isObjectId(target)) {
      user = await User.findById(target).select(USER_SELECT).lean();
    } else {
      user = await User.findOne({ phone: normalizePhone(target) }).select(USER_SELECT).lean();
    }
    if (!user) {
      logger.error(`User not found: ${target}`);
      process.exit(1);
    }
    return [user];
  }

  const user = await User.findOne(TOKEN_FILTER).select(USER_SELECT).sort({ updatedAt: -1 }).lean();
  if (!user) {
    logger.error('No user with a push token found. Open the app, log in, and grant notification permission.');
    process.exit(1);
  }
  return [user];
}

async function sendOne(user, { title, body, inbox }) {
  const token = resolvePushToken(user);
  const label = user.name || user.phone || user._id;
  logger.info(`→ ${label} (${user._id}) role=${user.role || '?'} token=${tokenKind(token)}`);

  if (!token) {
    logger.warn(`  skipped — no push token`);
    return { success: false, skipped: true };
  }

  if (inbox) {
    const notifRole = user.role === 'driver' ? 'driver' : 'rider';
    const notif = await sendToUser(user._id, notifRole, {
      title,
      message: body,
      type: 'alert',
      priority: 'high',
      screen: 'home',
      event_key: 'test_push',
      data: { subType: 'test' },
    });
    const ok = Boolean(notif);
    logger.info(`  inbox+push: ${ok ? '✅' : '❌'}`);
    return { success: ok };
  }

  const pushData = buildStandardPushData({
    type: 'alert',
    subType: 'test',
    screen: 'home',
    priority: 'high',
  });
  const pushResult = await sendPushNotification(token, title, body, pushData, user._id.toString());
  logger.info(`  push: ${pushResult.success ? '✅' : '❌'} ${pushResult.error || pushResult.message || ''}`);
  return { success: Boolean(pushResult.success) };
}

async function run() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));

  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('Connected to MongoDB');

    const users = await findUsers({ flags, positionals });
    logger.info(`Sending test notification to ${users.length} user(s)`);
    logger.info(`Title: ${flags.title}`);
    logger.info(`Body:  ${flags.body}`);
    logger.info(`Mode:  ${flags.inbox ? 'inbox + push (sendToUser)' : 'raw push only'}\n`);

    let success = 0;
    let failure = 0;
    let skipped = 0;

    for (const user of users) {
      const result = await sendOne(user, flags);
      if (result.skipped) skipped += 1;
      else if (result.success) success += 1;
      else failure += 1;
    }

    logger.info(`\nDone: ${success} sent, ${failure} failed, ${skipped} skipped`);
    process.exit(failure > 0 && success === 0 ? 1 : 0);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

run();
