// Load environment variables before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root (two levels up from src/config).
// When deploying via Dokploy / Docker the file won't exist — env vars are
// injected by the platform, so we only load the file when it's present.
const envPath = join(__dirname, '../../.env');
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Verify required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  if (process.env.NODE_ENV === 'test') {
    // In test, allow missing so tests can mock
  } else if (process.env.NODE_ENV === 'production') {
    console.error(`FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Set them in .env or the process environment. Exiting.');
    process.exit(1);
  } else {
    console.warn(`⚠️  Warning: Missing required environment variables: ${missingVars.join(', ')}`);
    console.warn(`   Make sure .env file exists in the backend directory. Production will exit if these are missing.`);
  }
}

export default process.env;
