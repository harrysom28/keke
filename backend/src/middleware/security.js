import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';

/**
 * Security middleware setup
 */
export const securityMiddleware = (app) => {
  // Set security HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disable CSP for API
      crossOriginEmbedderPolicy: false,
    })
  );

  // Data sanitization against NoSQL query injection
  app.use(mongoSanitize());

  // Data sanitization against XSS
  app.use(xss());

  // Prevent parameter pollution
  app.use(
    hpp({
      whitelist: ['sort', 'page', 'limit', 'fields'], // Allow these parameters
    })
  );
};
