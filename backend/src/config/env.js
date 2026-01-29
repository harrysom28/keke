// Load environment variables before any other imports
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root (two levels up from src/config)
const envPath = join(__dirname, '../../.env');

// Load environment variables
dotenv.config({ path: envPath });

// Verify required environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];

const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0 && process.env.NODE_ENV !== 'test') {
  console.warn(`⚠️  Warning: Missing required environment variables: ${missingVars.join(', ')}`);
  console.warn(`   Make sure .env file exists in the backend directory`);
}

export default process.env;
