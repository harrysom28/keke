import { createRequire } from 'module';
import logger from '../utils/logger.js';

const require = createRequire(import.meta.url);
let firebaseAdmin = null;

/**
 * Initialize Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT_JSON.
 * This is the only supported initialization path.
 */
export function getFirebaseAdmin() {
  if (firebaseAdmin) return firebaseAdmin;
  try {
    // Firebase Admin is initialized inside this module (CommonJS) using FIREBASE_SERVICE_ACCOUNT_JSON.
    firebaseAdmin = require('./firebaseAdmin.cjs');
    logger.info('Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
    return firebaseAdmin;
  } catch (err) {
    logger.error(`Firebase Admin init failed: ${err.message}`);
    return null;
  }
}

/**
 * Get Firebase Messaging instance for FCM. Returns null if Firebase Admin is not initialized.
 */
export function getMessaging() {
  const admin = getFirebaseAdmin();
  return admin ? admin.messaging() : null;
}

/** Project ID from initialized Firebase Admin app (service account). */
export function getFirebaseProjectId() {
  try {
    const admin = getFirebaseAdmin();
    if (!admin) return null;
    return admin.app()?.options?.projectId || null;
  } catch {
    return null;
  }
}
