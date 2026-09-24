import nodemailer from 'nodemailer';
import axios from 'axios';
import admin from 'firebase-admin';
import logger from '../utils/logger.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Driver from '../models/Driver.js';
import Ride from '../models/Ride.js';
import UserWallet from '../models/UserWallet.js';
import UserNotification from '../models/UserNotification.js';
import mongoose from 'mongoose';
import { getPusherService } from './pusherService.js';

let firebaseInitialized = false;
try {
  const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (serviceAccountJson && !admin.apps.length) {
    const serviceAccount = JSON.parse(serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin SDK initialized');
  }
} catch (e) {
  logger.error('Failed to initialize Firebase Admin SDK:', e.message);
}

// ---------------------------------------------------------------------------
// TASK 1: STANDARDIZED PUSH PAYLOAD FORMAT
// ---------------------------------------------------------------------------
// All push notifications use this structure for consistent handling across platforms.
// Backward compatible: callers can pass partial data; we merge with defaults.

/**
 * Build standardized push data payload.
 * @param {Object} opts - { type, subType, rideId?, paymentId?, screen, priority }
 * @returns {Object} - data object with all values as strings (required for Expo/FCM)
 */
export const buildStandardPushData = (opts = {}) => {
  const {
    type = 'system',
    subType = 'general',
    rideId = '',
    paymentId = '',
    screen = 'home',
    priority = 'medium',
  } = opts;
  return {
    type: String(type),
    subType: String(subType),
    rideId: rideId ? String(rideId) : '',
    paymentId: paymentId ? String(paymentId) : '',
    screen: String(screen),
    priority: String(priority),
    timestamp: Date.now().toString(),
  };
};

/**
 * Map notification type to screen, priority, and data category.
 * Ride-related: screen = ride_tracking; completed = receipt; payment issues = wallet.
 */
const getTypeMetadata = (type, relatedRide, relatedPayment) => {
  const rideId = relatedRide?._id?.toString() || relatedRide?.toString() || '';
  const paymentId = relatedPayment?._id?.toString() || relatedPayment?.toString() || '';
  const rideTypes = [
    'ride_requested', 'ride_accepted', 'ride_arrived', 'ride_started', 'ride_completed',
    'ride_cancelled', 'driver_assigned', 'driver_cancelled', 'booking_scheduled', 'reminder',
  ];
  const paymentTypes = ['payment_completed', 'payment_failed'];
  const highPriority = [
    'ride_requested', 'ride_accepted', 'ride_arrived', 'ride_started', 'ride_cancelled',
    'driver_assigned', 'driver_cancelled',
  ];
  const isRide = rideTypes.includes(type);
  const isPayment = paymentTypes.includes(type);

  let screen = 'home';
  if (type === 'ride_completed') screen = 'receipt';
  else if (type === 'payment_failed') screen = 'wallet';
  else if (isRide) screen = 'ride_tracking';

  const priority = highPriority.includes(type) ? 'high' : (isPayment ? 'medium' : 'low');
  const dataType = isRide ? 'ride_update' : (isPayment ? 'payment' : 'system');

  return {
    type: dataType,
    subType: type,
    rideId,
    paymentId,
    screen,
    priority,
  };
};

const normalizeUserRole = (role) => {
  if (role === 'driver') return 'driver';
  if (role === 'rider' || role === 'passenger') return 'rider';
  return 'rider';
};

const normalizeTargetRole = (role) => {
  if (role === 'all') return 'all';
  return normalizeUserRole(role);
};

/**
 * Whether to send a device push (FCM / Expo). Inbox/banner-only items stay in-app unless
 * they are ride-critical (screen ride) so background riders still get alerts.
 * Previously only high/critical/push fired — e.g. ride_started (alert + normal) never pushed.
 */
const shouldSendPushForNotification = (notification) => {
  if (!notification) return false;
  const { type, priority, screen } = notification;
  if (type === 'push') return true;
  if (priority === 'critical' || priority === 'high') return true;
  if (screen === 'ride' && (type === 'alert' || type === 'banner')) return true;
  return false;
};

const RIDE_PUSH_EVENT_KEYS = new Set([
  'ride_accepted',
  'ride_arrived',
  'driver_arrived',
  'ride_started',
  'ride_completed',
  'ride_cancelled',
  'ride_cancelled_by_driver',
  'driver_cancelled',
  'fare_locked',
]);

/** Ensures ride lifecycle notifications always push and carry alert/ride screen metadata. */
const normalizeRidePushPayload = (payload = {}) => {
  const eventKey =
    payload.event_key || payload.data?.subType || payload.data?.sub_type || 'general';
  if (!RIDE_PUSH_EVENT_KEYS.has(eventKey)) {
    return payload;
  }
  const isAccept = eventKey === 'ride_accepted';
  return {
    ...payload,
    event_key: eventKey,
    type: payload.type || 'alert',
    screen: payload.screen || 'ride',
    priority:
      payload.priority ||
      (isAccept || eventKey === 'driver_arrived' ? 'high' : 'normal'),
  };
};

const notificationToRealtimePayload = (notification, userNotification) => ({
  id: userNotification._id.toString(),
  notification_id: notification._id.toString(),
  title: notification.title,
  message: notification.message,
  type: notification.type,
  priority: notification.priority,
  screen: notification.screen,
  action_type: notification.action_type,
  action_payload: notification.action_payload,
  ride_id: notification.ride_id ? notification.ride_id.toString() : null,
  duration_ms: notification.duration_ms,
  image_url: notification.image_url,
  delivered_at: userNotification.delivered_at.toISOString(),
  event_key: notification.event_key || 'general',
});

/** Maps notification.event_key to inbox tabs (API + clients). */
export const inferNotificationCategory = (eventKey) => {
  const e = String(eventKey || 'general');
  if (e === 'chat_message') return 'messages';
  if (e === 'wallet_funded' || e === 'fare_received') return 'earnings';
  return 'trips';
};

const EARNINGS_KEYS = ['wallet_funded', 'fare_received'];
const MESSAGE_KEYS = ['chat_message'];

const buildCategoryEventFilter = (category) => {
  const c = String(category || 'all').toLowerCase();
  if (!c || c === 'all') return null;
  if (c === 'earnings') return { 'n.event_key': { $in: EARNINGS_KEYS } };
  if (c === 'messages') return { 'n.event_key': { $in: MESSAGE_KEYS } };
  if (c === 'trips') {
    return {
      $nor: [
        { 'n.event_key': { $in: EARNINGS_KEYS } },
        { 'n.event_key': 'chat_message' },
      ],
    };
  }
  return null;
};

const coerceActionPayloadString = (value) => {
  try {
    return JSON.stringify(value || {});
  } catch {
    return '{}';
  }
};

const isLegacyCreateNotificationCall = (payloadOrUser, legacyType, title, message) =>
  !!payloadOrUser &&
  legacyType != null &&
  typeof title === 'string' &&
  typeof message === 'string';

const mapLegacyTypeToDeliveryPayload = (type, title, message, data = {}, relatedRide = null, relatedPayment = null) => {
  const meta = getTypeMetadata(type, relatedRide, relatedPayment);
  const priority = meta.priority === 'medium' ? 'normal' : meta.priority;
  return {
    title,
    message,
    type:
      priority === 'high'
        ? 'alert'
        : type === 'promo_code'
          ? 'banner'
          : 'inbox',
    priority,
    screen: data?.screen || meta.screen || 'home',
    action_type: data?.screen ? 'navigate' : 'none',
    action_payload: data?.screen
      ? {
          screen: data.screen,
          ...(data?.rideId ? { rideId: data.rideId } : {}),
          ...(data?.paymentId ? { paymentId: data.paymentId } : {}),
        }
      : null,
    ride_id: relatedRide || data?.rideId || null,
    event_key: type || 'general',
    data: {
      ...data,
      paymentId: data?.paymentId || relatedPayment?.toString?.() || relatedPayment || '',
      rideId: data?.rideId || relatedRide?.toString?.() || relatedRide || '',
      subType: type,
      type: meta.type,
      priority,
      screen: data?.screen || meta.screen || 'home',
    },
  };
};

const getUserFcmToken = (user) => {
  // Prefer a native FCM token (delivered via Firebase Admin, package-correct)
  // over a possibly-stale Expo token. Native tokens are anything that is not an
  // ExponentPushToken[...]. This avoids routing native devices through the Expo
  // Push API when a fresh FCM token exists.
  const fcm = user?.fcm_token;
  if (fcm && !String(fcm).startsWith('ExponentPushToken[')) return fcm;
  return (
    user?.expoPushToken ||
    user?.fcm_token ||
    user?.pushToken ||
    user?.deviceToken ||
    ''
  );
};

// Email configuration - supports both SMTP_* and MAIL_* (Laravel-style) env vars
const getMailConfig = () => {
  const user = process.env.SMTP_USER || process.env.MAIL_USERNAME;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASSWORD;
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10);
  return { user, pass, host, port };
};

const createEmailTransport = () => {
  if (process.env.NODE_ENV === 'test') {
    return null; // Mock in tests
  }

  const { user, pass, host, port } = getMailConfig();
  if (!user || !pass) {
    logger.warn('SMTP credentials not configured (set SMTP_USER/SMTP_PASS or MAIL_USERNAME/MAIL_PASSWORD). Email sending disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
};

// Termii configuration (SMS)
// Default to 'dnd' for OTP/transactional delivery. Generic route does NOT deliver to
// Nigerian numbers on DND; Termii strongly recommends dnd for verification codes.

/**
 * Termii expects Nigerian mobiles in international form without + (e.g. 2348031234567).
 * Accepts 080..., 234..., or 803... stored in DB.
 */
function normalizeNigeriaPhoneForTermii(raw) {
  if (raw == null) return '';
  const d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('234') && d.length >= 13) return d;
  if (d.startsWith('0') && d.length === 11) return `234${d.slice(1)}`;
  if (d.length === 10 && /^[789]/.test(d)) return `234${d}`;
  return d;
}

const getTermiiConfig = () => {
  const apiKey = process.env.TERMII_API_KEY;
  // Termii-approved sender for DND/transactional is typically "N-Alert"
  const senderId = process.env.TERMII_SENDER_ID || 'N-Alert';
  const baseUrl = process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';
  const channel = process.env.TERMII_CHANNEL || 'dnd';
  const type = process.env.TERMII_SMS_TYPE || 'plain';

  if (!apiKey) return null;

  return { apiKey, senderId, baseUrl, channel, type };
};

/**
 * Send email
 */
export const sendEmail = async (to, subject, html, text = null) => {
  try {
    const transporter = createEmailTransport();
    if (!transporter) {
      logger.warn('Email transport not configured. Set SMTP_USER/SMTP_PASS or MAIL_USERNAME/MAIL_PASSWORD in .env.');
      return false;
    }

    const { user, host, port } = getMailConfig();
    const fromAddress =
      process.env.EMAIL_FROM ||
      process.env.MAIL_FROM_ADDRESS ||
      user;
    const fromName = process.env.EMAIL_FROM_NAME || process.env.MAIL_FROM_NAME || 'Keke Ride';
    const from = `"${fromName}" <${fromAddress}>`;

    const mailOptions = {
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    };

    logger.info(`Attempting to send email to ${to} from ${from} via ${host}:${port}`);

    const info = await transporter.sendMail(mailOptions);

    // Log the message ID if available (indicates successful send)
    if (info.messageId) {
      logger.info(`✅ Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      logger.debug(`Email response: ${JSON.stringify(info)}`);
    } else {
      logger.warn(`⚠️ Email send returned no message ID. Response: ${JSON.stringify(info)}`);
    }

    return true;
  } catch (error) {
    logger.error(`❌ Failed to send email to ${to}: ${error.message}`);
    logger.error(`Email error details: ${JSON.stringify({
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack,
    })}`);
    
    // Common error messages
    if (error.code === 'EAUTH') {
      logger.error('❌ SMTP Authentication failed. Check SMTP_USER/SMTP_PASS or MAIL_USERNAME/MAIL_PASSWORD (use Gmail app password if 2FA is on).');
    } else if (error.code === 'ECONNECTION') {
      logger.error('❌ SMTP Connection failed. Check SMTP_HOST/SMTP_PORT or MAIL_HOST/MAIL_PORT.');
    } else if (error.code === 'ETIMEDOUT') {
      logger.error('❌ SMTP Connection timeout. Check network and SMTP settings.');
    }
    
    return false;
  }
};

/**
 * Send SMS
 */
export const sendSMS = async (to, message) => {
  try {
    const config = getTermiiConfig();
    if (!config) {
      logger.warn('Termii not configured (missing TERMII_API_KEY)');
      return false;
    }

    const normalized = normalizeNigeriaPhoneForTermii(to);
    if (!normalized) {
      logger.warn('sendSMS: empty phone after normalization');
      return false;
    }
    const rawDigits = String(to).replace(/\D/g, '');
    if (normalized !== rawDigits) {
      logger.info(`sendSMS: normalized phone for Termii: ${rawDigits} -> ${normalized}`);
    }

    const payload = {
      to: normalized,
      from: config.senderId,
      sms: message,
      type: config.type,
      channel: config.channel,
      api_key: config.apiKey,
    };

    const url = `${config.baseUrl.replace(/\/$/, '')}/api/sms/send`;
    logger.info(`Termii payload: to=${normalized}, from=${payload.from}, channel=${payload.channel}, sms="${payload.sms}"`);
    const response = await axios.post(url, payload, { timeout: 15000 });

    const data = response.data;
    const codeOk = data && String(data.code).toLowerCase() === 'ok';
    if (!codeOk) {
      logger.error(`Termii SMS rejected or unclear response: ${JSON.stringify(data)}`);
      return false;
    }

    logger.info(`SMS accepted by Termii for ${normalized} (message_id=${data.message_id ?? data.message_id_str ?? 'n/a'})`);
    logger.debug?.(`Termii response: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    const details = error?.response?.data || error.message;
    logger.error(`Failed to send SMS (Termii): ${typeof details === 'string' ? details : JSON.stringify(details)}`);
    return false;
  }
};

/**
 * True if the token is an Expo Push Token (app sends this when using getDevicePushTokenAsync).
 * FCM only accepts FCM registration tokens, so we must use Expo Push API for these.
 */
const isExpoPushToken = (token) =>
  typeof token === 'string' && token.startsWith('ExponentPushToken[');

/**
 * TASK 2: Check if Expo/FCM response indicates invalid/expired device token.
 * If true, the token should be removed from the user record.
 */
const isInvalidDeviceToken = (errorCode, message) => {
  const invalidCodes = [
    'DeviceNotRegistered',
    'NotRegistered',
    'InvalidRegistration',
    'INVALID_REGISTRATION',
    'UNREGISTERED',
  ];
  const code = (errorCode || message || '').toString();
  const msg = (message || '').toString().toLowerCase();
  return invalidCodes.some((c) => code.includes(c) || msg.includes(c.toLowerCase()));
};

/**
 * Remove device token from user record (TASK 2).
 */
const removeDeviceTokenFromUser = async (userId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      $set: {
        deviceToken: null,
        fcm_token: null,
        expoPushToken: null,
      },
    });
    logger.info(`Removed invalid device token for user ${userId}`);
  } catch (err) {
    logger.error(`Failed to remove device token for user ${userId}: ${err.message}`);
  }
};

/**
 * Stringify all data values for Expo/FCM (they require string values).
 */
const stringifyData = (data) =>
  Object.fromEntries(
    Object.entries(data || {}).map(([k, v]) => [k, typeof v === 'string' ? v : String(v == null ? '' : v)])
  );

/**
 * Send push via Expo Push API (for ExponentPushToken[...] from the app).
 * Data values must be strings for Expo.
 * TASK 2: On DeviceNotRegistered/NotRegistered/InvalidRegistration, remove token from user.
 */
const sendExpoPushNotification = async (expoToken, title, body, data = {}, userId = null) => {
  try {
    const priority = data.priority === 'high' || data.priority === 'critical' ? 'high' : 'default';
    const channelId =
      priority === 'high'
        ? 'rides'
        : data.type === 'payment'
          ? 'payments'
          : 'general';
    const payload = {
      to: expoToken,
      title,
      body,
      sound: 'default',
      priority,
      channelId,
      data: stringifyData(data),
    };
    const response = await axios.post(
      'https://exp.host/--/api/v2/push/send',
      payload,
      {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        timeout: 10000,
      }
    );
    const result = response.data;
    if (result.data && result.data[0]) {
      const ticket = result.data[0];
      if (ticket.status === 'ok') {
        logger.info(`Expo push sent: ${title}`);
        return { success: true };
      }
      const details = ticket.details?.error || ticket.message || JSON.stringify(ticket);
      const isInvalid = ticket.status === 'error' && isInvalidDeviceToken(details, details);
      if (userId && isInvalid) {
        await removeDeviceTokenFromUser(userId);
      }
      logger.warn(`Expo push ticket error: ${details}`);
      return { success: false, invalidToken: !!isInvalid };
    }
    if (result.errors && result.errors.length) {
      const firstError = result.errors[0];
      const isInvalid = isInvalidDeviceToken(firstError, firstError);
      if (userId && isInvalid) {
        await removeDeviceTokenFromUser(userId);
      }
      logger.warn(`Expo push errors: ${JSON.stringify(result.errors)}`);
      return { success: false, invalidToken: !!isInvalid };
    }
    return { success: true };
  } catch (error) {
    logger.error(`Expo push API error: ${error.response?.data || error.message}`);
    return { success: false };
  }
};

/**
 * Send FCM via Firebase Admin SDK (preferred).
 * TASK 3: Add android channelId "rides" for high-priority ride notifications.
 * TASK 2: On invalid token errors, remove from user.
 */
const sendFcmViaFirebaseAdmin = async (deviceToken, title, body, data = {}, userId = null) => {
  if (!firebaseInitialized) {
    logger.warn('FCM skipped: Firebase Admin SDK not initialized');
    return { success: false };
  }

  const expectedProject =
    process.env.EXPECTED_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_ANDROID_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID;
  const actualProject = admin.app()?.options?.projectId || null;
  if (expectedProject && actualProject && expectedProject !== actualProject) {
    logger.error(
      `FCM Firebase project mismatch: Admin SDK is using project_id="${actualProject}" but EXPECTED_FIREBASE_PROJECT_ID / FIREBASE_PROJECT_ID="${expectedProject}". Push may fail for client tokens registered to the other project. Align service account JSON or env vars with the mobile app Firebase project.`
    );
  } else if (expectedProject && !actualProject) {
    logger.error(
      `FCM: EXPECTED_FIREBASE_PROJECT_ID is set (${expectedProject}) but Firebase Admin failed to initialize — cannot validate project_id.`
    );
  }

  try {
    const channelId =
      data.priority === 'high' || data.priority === 'critical'
        ? 'rides'
        : data.type === 'payment'
          ? 'payments'
          : 'general';
    const message = {
      token: deviceToken,
      // ANDROID: data-only (no `notification` block) + priority:high. This
      // guarantees the app's setBackgroundMessageHandler runs in the
      // background/quit state and is the SOLE display path — avoiding the
      // unreliable OS auto-display (the app runs both expo-notifications and
      // @react-native-firebase, which fight over the FCM service) and avoiding
      // duplicate notifications. title/body/channel travel in `data` so the
      // on-device handler can build the local notification.
      data: stringifyData({ ...data, title, body, channelId }),
      android: {
        priority: 'high',
      },
      // iOS: data-only delivery is unreliable, so keep the APNs alert so the
      // system displays the notification in background/quit state.
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    };
    await admin.messaging().send(message);
    logger.info(`FCM (Firebase Admin) push sent: ${title}`);
    return { success: true };
  } catch (error) {
    const code = error.code || error.message || '';
    const isInvalid = isInvalidDeviceToken(code, String(error.message || ''));
    if (userId && isInvalid) {
      await removeDeviceTokenFromUser(userId);
    }
    logger.error(`FCM Firebase Admin error: ${code}`);
    return { success: false, invalidToken: !!isInvalid };
  }
};

/**
 * Send FCM via legacy HTTP API (fallback when Firebase Admin is not configured).
 * TASK 2: Check response for invalid registration and remove token.
 */
const sendFcmViaLegacyApi = async (deviceToken, title, body, data = {}, userId = null) => {
  if (!process.env.FCM_SERVER_KEY) return { success: false };
  try {
    const response = await axios.post(
      'https://fcm.googleapis.com/fcm/send',
      {
        to: deviceToken,
        notification: { title, body, sound: 'default', badge: '1' },
        data: { ...stringifyData(data), click_action: 'FLUTTER_NOTIFICATION_CLICK' },
        priority: 'high',
      },
      {
        headers: {
          Authorization: `key=${process.env.FCM_SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const result = response.data;
    if (result.success === 1) {
      logger.info(`FCM (legacy) push sent: ${title}`);
      return { success: true };
    }
    const errMsg = result.results?.[0]?.error || result.error || 'Unknown error';
    const isInvalid = isInvalidDeviceToken(errMsg, errMsg);
    if (userId && isInvalid) {
      await removeDeviceTokenFromUser(userId);
    }
    logger.error(`FCM error: ${errMsg}`);
    return { success: false, invalidToken: !!isInvalid };
  } catch (error) {
    logger.error(`FCM API error: ${error.response?.data || error.message}`);
    return { success: false };
  }
};

/**
 * Send push notification (Expo Push API or FCM)
 * - Expo Push Token (ExponentPushToken[...]): sent via Expo; works with app's getDevicePushTokenAsync().
 * - FCM token: sent via Firebase Admin when configured, else via legacy FCM_SERVER_KEY if set.
 * @param {string} deviceToken
 * @param {string} title
 * @param {string} body
 * @param {Object} data - Standard push data (type, subType, screen, priority, etc.)
 * @param {string} [userId] - For invalid token removal (TASK 2)
 * @returns {{ success: boolean, invalidToken?: boolean }}
 */
export const sendPushNotification = async (deviceToken, title, body, data = {}, userId = null) => {
  try {
    if (!deviceToken) {
      logger.warn('Device token not provided for push notification');
      return { success: false };
    }

    let result;
    if (isExpoPushToken(deviceToken)) {
      result = await sendExpoPushNotification(deviceToken, title, body, data, userId);
    } else {
      result = await sendFcmViaFirebaseAdmin(deviceToken, title, body, data, userId);
      if (!result.success) {
        const legacy = await sendFcmViaLegacyApi(deviceToken, title, body, data, userId);
        result = legacy;
      }
      if (!result.success && !result.invalidToken) {
        logger.warn('FCM not sent: configure Firebase service account (FIREBASE_SERVICE_ACCOUNT_PATH) or FCM_SERVER_KEY.');
      }
    }
    return result;
  } catch (error) {
    logger.error(`Failed to send push notification: ${error.message}`);
    return { success: false };
  }
};

const PUSH_CONCURRENCY = 10;

// TASK 6: Retry delays for failed push (network/server errors). Simple in-memory retry.
// Keep retries minimal to avoid blocking request paths that fire-and-forget push (e.g. chat).
const RETRY_DELAYS_MS = [10 * 1000]; // 10s (max 1 retry)

/**
 * TASK 6: Retry failed push deliveries.
 * Retries only on network/server errors, not on invalid token (that is permanent).
 */
const isRetryablePushFailure = (result) =>
  Boolean(result && !result.success && !result.invalidToken);

const sendPushWithRetry = async (deviceToken, title, body, data, userId, attempt = 0) => {
  const result = await sendPushNotification(deviceToken, title, body, data, userId);
  if (result.success || result.invalidToken || !isRetryablePushFailure(result)) {
    return result;
  }
  if (attempt >= RETRY_DELAYS_MS.length) {
    logger.warn(`Push delivery failed after ${RETRY_DELAYS_MS.length} retries: ${title}`);
    return result;
  }
  const delay = RETRY_DELAYS_MS[attempt];
  logger.info(`Push failed, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length}): ${title}`);
  await new Promise((r) => setTimeout(r, delay));
  return sendPushWithRetry(deviceToken, title, body, data, userId, attempt + 1);
};

/**
 * Send push notification to multiple devices (bounded concurrency)
 */
export const sendPushNotificationToMultiple = async (deviceTokens, title, body, data = {}, userId = null) => {
  if (!deviceTokens || deviceTokens.length === 0) {
    return { success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;

  for (let i = 0; i < deviceTokens.length; i += PUSH_CONCURRENCY) {
    const chunk = deviceTokens.slice(i, i + PUSH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((token) => sendPushNotification(token, title, body, data, userId))
    );
    results.forEach((r) => (r.success ? success++ : failure++));
  }

  logger.info(`Push notifications sent: ${success} success, ${failure} failure`);
  return { success, failure };
};

// TASK 7: Critical event types that trigger SMS fallback when push fails
const CRITICAL_TYPES_FOR_SMS = ['ride_cancelled', 'payment_failed', 'ride_arrived'];

/**
 * Create notification definition only.
 * Backward compatible: if called with legacy positional args it will create + dispatch.
 */
export const createNotification = async (
  payloadOrUser,
  legacyType = null,
  legacyTitle = null,
  legacyMessage = null,
  legacyData = {},
  legacyRelatedRide = null,
  legacyRelatedPayment = null
) => {
  if (isLegacyCreateNotificationCall(payloadOrUser, legacyType, legacyTitle, legacyMessage)) {
    const userId = payloadOrUser?._id ?? payloadOrUser;
    const user = await User.findById(userId).select('role fcm_token deviceToken phone email');
    if (!user) {
      return null;
    }
    const role = normalizeUserRole(user.role);
    const payload = mapLegacyTypeToDeliveryPayload(
      legacyType,
      legacyTitle,
      legacyMessage,
      legacyData,
      legacyRelatedRide,
      legacyRelatedPayment
    );
    return sendToUser(user._id, role, payload);
  }

  const payload = payloadOrUser || {};
  const notification = await Notification.create({
    ...payload,
    target_role: normalizeTargetRole(payload.target_role || 'all'),
    target_user_id: payload.target_user_id || null,
    is_global: Boolean(payload.is_global),
    status: payload.status || 'active',
    screen: payload.screen || 'home',
    action_type: payload.action_type || 'none',
    duration_ms: payload.duration_ms ?? 5000,
    event_key: payload.event_key || payload.data?.subType || 'general',
    ride_id: payload.ride_id || null,
    relatedRide: payload.relatedRide || payload.ride_id || null,
    relatedPayment: payload.relatedPayment || null,
  });

  return notification;
};

export const evaluateTargetingRules = async (rules = {}, userId, userRole) => {
  if (!rules || !userId) {
    return true;
  }

  try {
    const normalizedRole = normalizeUserRole(userRole);
    const user = await User.findById(userId).select('city balance');
    if (!user) {
      return false;
    }

    if (Array.isArray(rules.cities) && rules.cities.length > 0) {
      const normalizedCities = rules.cities.map((city) => String(city).trim().toLowerCase());
      const userCity = String(user.city || '').trim().toLowerCase();
      if (!userCity || !normalizedCities.includes(userCity)) {
        return false;
      }
    }

    let completedRideCount = null;
    const getCompletedRideCount = async () => {
      if (completedRideCount != null) {
        return completedRideCount;
      }
      if (normalizedRole === 'driver') {
        const driver = await Driver.findOne({ user: userId }).select('_id').lean();
        if (!driver?._id) {
          completedRideCount = 0;
          return completedRideCount;
        }
        completedRideCount = await Ride.countDocuments({
          driver: driver._id,
          status: 'completed',
        });
        return completedRideCount;
      }
      completedRideCount = await Ride.countDocuments({
        rider: userId,
        status: 'completed',
      });
      return completedRideCount;
    };

    if (rules.min_ride_count != null) {
      const count = await getCompletedRideCount();
      if (count < Number(rules.min_ride_count)) {
        return false;
      }
    }

    if (rules.max_ride_count != null) {
      const count = await getCompletedRideCount();
      if (count > Number(rules.max_ride_count)) {
        return false;
      }
    }

    if (rules.inactive_days != null) {
      const rideFilter = normalizedRole === 'driver'
        ? { status: 'completed' }
        : { rider: userId, status: 'completed' };

      if (normalizedRole === 'driver') {
        const driver = await Driver.findOne({ user: userId }).select('_id').lean();
        if (driver?._id) {
          rideFilter.driver = driver._id;
        } else {
          rideFilter.driver = null;
        }
      }

      const lastRide = await Ride.findOne(rideFilter).sort({ completedAt: -1 }).select('completedAt').lean();
      if (lastRide?.completedAt) {
        const daysSinceLastRide = (Date.now() - new Date(lastRide.completedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceLastRide < Number(rules.inactive_days)) {
          return false;
        }
      }
    }

    const walletBalance = Number(user.balance) || 0;
    if (rules.min_wallet_balance != null && walletBalance < Number(rules.min_wallet_balance)) {
      return false;
    }
    if (rules.max_wallet_balance != null && walletBalance > Number(rules.max_wallet_balance)) {
      return false;
    }

    if (rules.min_driver_rating != null && normalizedRole === 'driver') {
      const driver = await Driver.findOne({ user: userId }).select('rating').lean();
      const rating = Number(driver?.rating?.average ?? 0);
      if (rating < Number(rules.min_driver_rating)) {
        return false;
      }
    }

    if (rules.ride_status) {
      const activeRideFilter = normalizedRole === 'driver'
        ? { status: rules.ride_status }
        : { rider: userId, status: rules.ride_status };

      if (normalizedRole === 'driver') {
        const driver = await Driver.findOne({ user: userId }).select('_id').lean();
        if (!driver?._id) {
          return false;
        }
        activeRideFilter.driver = driver._id;
      }

      const currentRide = await Ride.findOne(activeRideFilter).select('_id').lean();
      if (!currentRide) {
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to evaluate notification targeting rules: ${error.message}`);
    return false;
  }
};

export const dispatchToUser = async (
  notification,
  userId,
  userRole,
  fcmToken = '',
  options = {}
) => {
  const skipRealtime = options?.skip_realtime === true || options?.skipRealtime === true;
  try {
    if (!notification || !userId) {
      return null;
    }

    const existing = await UserNotification.findOne({
      notification_id: notification._id,
      user_id: userId,
    }).lean();
    if (existing) {
      return existing;
    }

    const passes = await evaluateTargetingRules(notification.targeting_rules, userId, userRole);
    if (!passes) {
      return null;
    }

    const [userNotification] = await UserNotification.create([
      {
        notification_id: notification._id,
        user_id: userId,
        role: normalizeUserRole(userRole),
        delivered_at: new Date(),
      },
    ]);

    const realtimePayload = notificationToRealtimePayload(notification, userNotification);

    const wantsPush = shouldSendPushForNotification(notification);
    if (wantsPush && (!fcmToken || !String(fcmToken).trim())) {
      logger.warn(
        `Push not sent: user ${userId} has no FCM/Expo token (${notification.event_key || notification.title || 'notification'})`
      );
    }

    const pushData = {
      notification_id: String(notification._id),
      type: String(notification.type),
      screen: String(notification.screen || 'home'),
      action_type: String(notification.action_type || 'none'),
      action_payload: coerceActionPayloadString(notification.action_payload),
      ride_id: String(notification.ride_id || ''),
      subType: String(notification.event_key || 'general'),
      event_key: String(notification.event_key || 'general'),
      priority: String(notification.priority || 'normal'),
    };

    const disableRetry =
      options?.disable_retry === true || options?.disableRetry === true;

    const pushPromise =
      wantsPush && typeof fcmToken === 'string' && fcmToken.trim()
        ? (async () => {
            try {
              if (disableRetry) {
                await sendPushNotification(
                  fcmToken,
                  notification.title,
                  notification.message,
                  pushData,
                  String(userId)
                );
              } else {
                await sendPushWithRetry(
                  fcmToken,
                  notification.title,
                  notification.message,
                  pushData,
                  String(userId)
                );
              }
            } catch (error) {
              logger.error(`Failed to dispatch push notification: ${error.message}`);
            }
          })()
        : Promise.resolve();

    const realtimePromise = skipRealtime
      ? Promise.resolve()
      : (async () => {
          try {
            const pusherService = getPusherService();
            pusherService?.emitNotification(userId, realtimePayload);
          } catch (error) {
            logger.error(`Failed to dispatch realtime notification: ${error.message}`);
          }

          try {
            const { getSocketService } = await import('./socketService.js');
            const socketSvc = getSocketService();
            socketSvc?.emitNewNotification?.(userId, realtimePayload);
          } catch (error) {
            logger.debug(`Socket NEW_NOTIFICATION skip: ${error.message}`);
          }
        })();

    // Push + Pusher/Socket in parallel so device delivery is not blocked behind websocket work.
    await Promise.all([pushPromise, realtimePromise]);

    return userNotification;
  } catch (error) {
    logger.error(`dispatchToUser failed: ${error.message}`);
    return null;
  }
};

export const sendToUser = async (userId, userRole, notifPayload) => {
  try {
    const user = await User.findById(userId).select('role fcm_token deviceToken expoPushToken');
    if (!user) {
      return null;
    }

    const normalizedRole = normalizeUserRole(userRole || user.role);
    const normalizedPayload = normalizeRidePushPayload(notifPayload || {});
    const {
      disable_retry: disable_retry_opt,
      disableRetry: disableRetry_opt,
      skip_realtime: skip_realtime_opt,
      skipRealtime: skipRealtime_opt,
      ...restPayload
    } = normalizedPayload;
    const disable_retry = disable_retry_opt ?? disableRetry_opt;
    const skip_realtime = skip_realtime_opt ?? skipRealtime_opt;
    const notification = await createNotification({
      ...restPayload,
      target_role: normalizedRole,
      target_user_id: user._id,
      is_global: false,
    });

    await dispatchToUser(notification, user._id, normalizedRole, getUserFcmToken(user), {
      disable_retry,
      skip_realtime,
    });
    return notification;
  } catch (error) {
    logger.error(`sendToUser failed: ${error.message}`);
    return null;
  }
};

export const sendToRole = async (role, notifPayload) => {
  const normalizedRole = normalizeTargetRole(role);
  const mongoRole = normalizedRole === 'rider' ? 'passenger' : 'driver';

  try {
    const notification = await createNotification({
      ...notifPayload,
      target_role: normalizedRole,
      target_user_id: null,
      is_global: false,
    });

    const users = await User.find({ role: mongoRole })
      .select('role fcm_token deviceToken')
      .limit(501);

    if (users.length > 500) {
      logger.warn(`sendToRole(${normalizedRole}) exceeded 500 users, capping delivery at 500`);
    }

    let sent = 0;
    const cappedUsers = users.slice(0, 500);
    const batchSize = 25;
    for (let i = 0; i < cappedUsers.length; i += batchSize) {
      const batch = cappedUsers.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((user) =>
          dispatchToUser(notification, user._id, normalizedRole, getUserFcmToken(user))
        )
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          sent += 1;
        }
      }
    }

    return {
      sent,
      notification_id: notification._id.toString(),
    };
  } catch (error) {
    logger.error(`sendToRole failed: ${error.message}`);
    return {
      sent: 0,
      notification_id: null,
    };
  }
};

export const sendGlobal = async (notifPayload) => {
  const riderResult = await sendToRole('rider', { ...notifPayload, is_global: true });
  const driverResult = await sendToRole('driver', { ...notifPayload, is_global: true });
  return {
    sent: (riderResult?.sent || 0) + (driverResult?.sent || 0),
    notification_id: riderResult?.notification_id || driverResult?.notification_id || null,
  };
};

export const markRead = async (userNotificationId, userId) => {
  try {
    const result = await UserNotification.findOneAndUpdate(
      {
        _id: userNotificationId,
        user_id: userId,
      },
      {
        $set: {
          is_read: true,
          opened_at: new Date(),
        },
      },
      { new: true }
    );

    return result;
  } catch (error) {
    logger.error(`markRead failed: ${error.message}`);
    return null;
  }
};

export const markAllRead = async (userId) => {
  try {
    return UserNotification.updateMany(
      { user_id: userId, is_read: false },
      {
        $set: {
          is_read: true,
          opened_at: new Date(),
        },
      }
    );
  } catch (error) {
    logger.error(`markAllRead failed: ${error.message}`);
    return { modifiedCount: 0 };
  }
};

export const getUnreadCount = async (userId) => {
  try {
    return UserNotification.countDocuments({
      user_id: userId,
      is_read: false,
      is_dismissed: false,
    });
  } catch (error) {
    logger.error(`getUnreadCount failed: ${error.message}`);
    return 0;
  }
};

export const getUserInbox = async (userId, page = 1, limit = 20, category = 'all') => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;
  const uid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(userId)
    : userId;
  const cat = String(category || 'all').toLowerCase();
  const eventFilter = buildCategoryEventFilter(cat);

  try {
    if (!eventFilter) {
      const [items, total, unreadCount] = await Promise.all([
        UserNotification.find({ user_id: userId, is_dismissed: false })
          .populate('notification_id')
          .sort({ delivered_at: -1 })
          .skip(skip)
          .limit(safeLimit),
        UserNotification.countDocuments({ user_id: userId, is_dismissed: false }),
        getUnreadCount(userId),
      ]);

      return {
        notifications: items,
        unread_count: unreadCount,
        total,
        page: safePage,
        pages: Math.ceil(total / safeLimit) || 1,
      };
    }

    const baseMatch = { user_id: uid, is_dismissed: false };
    const pipelineCount = [
      { $match: baseMatch },
      {
        $lookup: {
          from: 'notifications',
          localField: 'notification_id',
          foreignField: '_id',
          as: 'n',
        },
      },
      { $unwind: { path: '$n', preserveNullAndEmptyArrays: false } },
      { $match: eventFilter },
      { $count: 'c' },
    ];
    const pipelineItems = [
      { $match: baseMatch },
      {
        $lookup: {
          from: 'notifications',
          localField: 'notification_id',
          foreignField: '_id',
          as: 'n',
        },
      },
      { $unwind: { path: '$n', preserveNullAndEmptyArrays: false } },
      { $match: eventFilter },
      { $sort: { delivered_at: -1 } },
      { $skip: skip },
      { $limit: safeLimit },
      { $project: { _id: 1 } },
    ];

    const [countAgg, idRows, unreadCount] = await Promise.all([
      UserNotification.aggregate(pipelineCount),
      UserNotification.aggregate(pipelineItems),
      getUnreadCount(userId),
    ]);

    const total = countAgg?.[0]?.c ?? 0;
    const orderedIds = idRows.map((r) => r._id);
    const fetched = await UserNotification.find({ _id: { $in: orderedIds } })
      .populate('notification_id')
      .lean();
    const orderMap = new Map(orderedIds.map((id, i) => [id.toString(), i]));
    fetched.sort(
      (a, b) =>
        (orderMap.get(a._id.toString()) ?? 0) - (orderMap.get(b._id.toString()) ?? 0)
    );
    const items = fetched;

    return {
      notifications: items,
      unread_count: unreadCount,
      total,
      page: safePage,
      pages: Math.ceil(total / safeLimit) || 1,
    };
  } catch (error) {
    logger.error(`getUserInbox failed: ${error.message}`);
    return {
      notifications: [],
      unread_count: 0,
      total: 0,
      page: safePage,
      pages: 1,
    };
  }
};

export const previewTargeting = async (targetRole, targetingRules = {}) => {
  const normalizedRole = normalizeTargetRole(targetRole);
  const mongoRole = normalizedRole === 'rider' ? 'passenger' : 'driver';

  try {
    const users = await User.find({ role: mongoRole })
      .select('role')
      .limit(1000)
      .lean();

    let matchingUsers = 0;
    const batchSize = 25;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((user) => evaluateTargetingRules(targetingRules, user._id, normalizedRole))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          matchingUsers += 1;
        }
      }
    }

    return { matching_users: matchingUsers };
  } catch (error) {
    logger.error(`previewTargeting failed: ${error.message}`);
    return { matching_users: 0 };
  }
};

export const registerFcmTokenForUser = async (userId, token) => {
  try {
    await User.findByIdAndUpdate(userId, {
      $set: {
        fcm_token: token || null,
        deviceToken: token || null,
      },
    });
    return true;
  } catch (error) {
    logger.error(`registerFcmTokenForUser failed: ${error.message}`);
    return false;
  }
};

export default {
  sendEmail,
  sendSMS,
  sendPushNotification,
  sendPushNotificationToMultiple,
  createNotification,
  evaluateTargetingRules,
  dispatchToUser,
  sendToUser,
  sendToRole,
  sendGlobal,
  markRead,
  markAllRead,
  getUserInbox,
  getUnreadCount,
  previewTargeting,
  registerFcmTokenForUser,
  buildStandardPushData,
  inferNotificationCategory,
};
