import nodemailer from 'nodemailer';
import axios from 'axios';
import logger from '../utils/logger.js';
import Notification from '../models/Notification.js';

// Email configuration
const createEmailTransport = () => {
  if (process.env.NODE_ENV === 'test') {
    return null; // Mock in tests
  }

  // Check if email credentials are configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('SMTP credentials not configured. Email sending disabled.');
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Termii configuration (SMS)
const getTermiiConfig = () => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  const baseUrl = process.env.TERMII_BASE_URL || 'https://api.ng.termii.com';
  const channel = process.env.TERMII_CHANNEL || 'generic';
  const type = process.env.TERMII_SMS_TYPE || 'plain';

  if (!apiKey) return null;
  if (!senderId) {
    logger.warn('TERMII_SENDER_ID not configured. SMS sending disabled.');
    return null;
  }

  return { apiKey, senderId, baseUrl, channel, type };
};

/**
 * Send email
 */
export const sendEmail = async (to, subject, html, text = null) => {
  try {
    const transporter = createEmailTransport();
    if (!transporter) {
      logger.warn('Email transport not configured. Check SMTP_USER and SMTP_PASS environment variables.');
      return false;
    }

    const from = process.env.EMAIL_FROM || 'noreply@ride-hailing.com';

    // Verify connection before sending
    try {
      await transporter.verify();
      logger.info(`SMTP connection verified for ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
    } catch (verifyError) {
      logger.error(`SMTP connection verification failed: ${verifyError.message}`);
      logger.error(`SMTP Config - Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}, Port: ${process.env.SMTP_PORT || '587'}, User: ${process.env.SMTP_USER ? 'Set' : 'Not Set'}`);
      return false;
    }

    const mailOptions = {
      from,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML if no text provided
    };

    logger.info(`Attempting to send email to ${to} from ${from} with subject: ${subject}`);

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
      logger.error('❌ SMTP Authentication failed. Check SMTP_USER and SMTP_PASS.');
    } else if (error.code === 'ECONNECTION') {
      logger.error('❌ SMTP Connection failed. Check SMTP_HOST and SMTP_PORT.');
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
      logger.warn('Termii not configured (missing TERMII_API_KEY and/or TERMII_SENDER_ID)');
      return false;
    }

    const payload = {
      to,
      from: config.senderId,
      sms: message,
      type: config.type,
      channel: config.channel,
      api_key: config.apiKey,
    };

    const url = `${config.baseUrl.replace(/\/$/, '')}/api/sms/send`;
    const response = await axios.post(url, payload, { timeout: 15000 });

    // Termii returns 2xx for success; treat non-2xx as failure (caught below)
    logger.info(`SMS sent to ${to} via Termii`);
    logger.debug?.(`Termii response: ${JSON.stringify(response.data)}`);
    return true;
  } catch (error) {
    const details = error?.response?.data || error.message;
    logger.error(`Failed to send SMS (Termii): ${typeof details === 'string' ? details : JSON.stringify(details)}`);
    return false;
  }
};

/**
 * Send push notification (FCM)
 * Uses Firebase Cloud Messaging for push notifications
 */
export const sendPushNotification = async (deviceToken, title, body, data = {}) => {
  try {
    if (!deviceToken) {
      logger.warn('Device token not provided for push notification');
      return false;
    }

    // Use FCM HTTP v1 API if credentials provided
    if (process.env.FCM_SERVER_KEY) {
      // Legacy FCM API (Server Key)
      const fcmEndpoint = 'https://fcm.googleapis.com/fcm/send';
      
      try {
        const response = await axios.post(
          fcmEndpoint,
          {
            to: deviceToken,
            notification: {
              title,
              body,
              sound: 'default',
              badge: '1',
            },
            data: {
              ...data,
              click_action: 'FLUTTER_NOTIFICATION_CLICK',
            },
            priority: 'high',
          },
          {
            headers: {
              'Authorization': `key=${process.env.FCM_SERVER_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );

        const result = response.data;
        
        if (result.success === 1 || result.success === 0) {
          logger.info(`Push notification sent to ${deviceToken}: ${title}`);
          return true;
        } else {
          logger.error(`FCM error: ${result.error || 'Unknown error'}`);
          return false;
        }
      } catch (error) {
        logger.error(`FCM API error: ${error.response?.data || error.message}`);
        return false;
      }
    } else {
      // Fallback: Log notification (for development)
      logger.info(`Push notification would be sent to ${deviceToken}: ${title} - ${body}`);
      logger.warn('FCM_SERVER_KEY not configured, push notification not sent');
      return false;
    }
  } catch (error) {
    logger.error(`Failed to send push notification: ${error.message}`);
    return false;
  }
};

/**
 * Send push notification to multiple devices
 */
export const sendPushNotificationToMultiple = async (deviceTokens, title, body, data = {}) => {
  if (!deviceTokens || deviceTokens.length === 0) {
    return { success: 0, failure: 0 };
  }

  let success = 0;
  let failure = 0;

  for (const token of deviceTokens) {
    const result = await sendPushNotification(token, title, body, data);
    if (result) {
      success++;
    } else {
      failure++;
    }
  }

  logger.info(`Push notifications sent: ${success} success, ${failure} failure`);
  return { success, failure };
};

/**
 * Create and send notification
 */
export const createNotification = async (
  user,
  type,
  title,
  message,
  data = {},
  relatedRide = null,
  relatedPayment = null
) => {
  try {
    const notification = await Notification.createNotification(
      user,
      type,
      title,
      message,
      data,
      relatedRide,
      relatedPayment
    );

    // Send push notification if device token exists
    if (user.deviceToken) {
      await sendPushNotification(user.deviceToken, title, message, data);
      await notification.markPushSent();
    }

    // Send email for important notifications
    if (['payment_failed', 'account_verified', 'support_ticket'].includes(type) && user.email) {
      await sendEmail(
        user.email,
        title,
        `<p>${message}</p>`
      );
      await notification.markEmailSent();
    }

    return notification;
  } catch (error) {
    logger.error(`Failed to create notification: ${error.message}`);
    throw error;
  }
};

export default {
  sendEmail,
  sendSMS,
  sendPushNotification,
  createNotification,
};
