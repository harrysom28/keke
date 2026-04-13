import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let firebaseApp = null;

/**
 * Build service account from env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).
 * FIREBASE_PRIVATE_KEY can use literal \n in the value; we convert to real newlines.
 */
function getServiceAccountFromEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) return null;
  privateKey = privateKey.replace(/\\n/g, '\n');
  return {
    type: 'service_account',
    project_id: projectId,
    client_email: clientEmail,
    private_key: privateKey,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || undefined,
    client_id: process.env.FIREBASE_CLIENT_ID || undefined,
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(clientEmail)}`,
    universe_domain: 'googleapis.com',
  };
}

function getServiceAccountPath() {
  const envPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.FIREBASE_SERVICE_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (envPath) {
    return path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
  }
  return path.resolve(process.cwd(), 'config', 'firebase-service-account.json');
}

/**
 * Initialize Firebase Admin SDK. Safe to call multiple times; returns existing app if already initialized.
 * Credentials from (first wins):
 * 1. Env vars: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 * 2. JSON file: FIREBASE_SERVICE_ACCOUNT_PATH / FIREBASE_SERVICE_KEY / GOOGLE_APPLICATION_CREDENTIALS or config/firebase-service-account.json
 */
export function getFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  let serviceAccount = getServiceAccountFromEnv();
  if (serviceAccount) {
    try {
      firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      logger.info(`Firebase Admin initialized for project: ${serviceAccount.project_id} (from env)`);
      return firebaseApp;
    } catch (err) {
      logger.warn(`Firebase Admin init from env failed: ${err.message}`);
      return null;
    }
  }

  const credentialPath = getServiceAccountPath();
  if (!existsSync(credentialPath)) {
    logger.debug(
      `Firebase Admin: no service account file at ${credentialPath}. Set FIREBASE_* env vars or FIREBASE_SERVICE_ACCOUNT_PATH.`
    );
    return null;
  }

  try {
    serviceAccount = JSON.parse(readFileSync(credentialPath, 'utf8'));
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      logger.warn('Firebase Admin: invalid service account JSON (missing project_id, private_key, or client_email).');
      return null;
    }
    firebaseApp = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    logger.info(`Firebase Admin initialized for project: ${serviceAccount.project_id}`);
    return firebaseApp;
  } catch (err) {
    logger.warn(`Firebase Admin init failed: ${err.message}`);
    return null;
  }
}

/**
 * Get Firebase Messaging instance for FCM. Returns null if Firebase Admin is not initialized.
 */
export function getMessaging() {
  const app = getFirebaseAdmin();
  return app ? admin.messaging(app) : null;
}

/** Project ID from initialized Firebase Admin app (service account). */
export function getFirebaseProjectId() {
  const app = getFirebaseAdmin();
  if (!app) return null;
  try {
    return app.options?.projectId || null;
  } catch {
    return null;
  }
}
