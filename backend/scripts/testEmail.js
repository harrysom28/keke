import dotenv from 'dotenv';
import { sendEmail } from '../src/services/notificationService.js';
import logger from '../src/utils/logger.js';

dotenv.config();

const testEmail = async () => {
  try {
    logger.info('Testing email configuration...');
    logger.info(`SMTP_HOST: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
    logger.info(`SMTP_PORT: ${process.env.SMTP_PORT || '587'}`);
    logger.info(`SMTP_USER: ${process.env.SMTP_USER ? 'Set' : 'Not Set'}`);
    logger.info(`SMTP_PASS: ${process.env.SMTP_PASS ? 'Set' : 'Not Set'}`);
    logger.info(`EMAIL_FROM: ${process.env.EMAIL_FROM || 'noreply@ride-hailing.com'}`);

    const testEmailAddress = process.argv[2] || process.env.TEST_EMAIL || 'test@example.com';
    logger.info(`\nSending test email to: ${testEmailAddress}`);

    const result = await sendEmail(
      testEmailAddress,
      'Test Email - Keke Ride Hailing',
      `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #43A048;">Test Email</h2>
          <p>This is a test email from the Keke Ride Hailing backend.</p>
          <p>If you received this email, your SMTP configuration is working correctly!</p>
          <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
        </div>
      `
    );

    if (result) {
      logger.info('\n✅ Test email sent successfully!');
      logger.info(`Please check ${testEmailAddress} (including spam folder)`);
    } else {
      logger.error('\n❌ Test email failed to send');
      logger.error('Check your SMTP configuration in .env file');
    }

    process.exit(result ? 0 : 1);
  } catch (error) {
    logger.error(`\n❌ Error testing email: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
};

testEmail();
