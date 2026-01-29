#!/usr/bin/env node
/**
 * Driver Login Script
 * Gets a driver authentication token for testing
 * 
 * Usage: node driver-login.js <email> <password>
 */

const http = require('http');

const email = process.argv[2];
const password = process.argv[3];

// Allow API host to be configured via environment variable
// Default to localhost (works on host machine)
// Use 10.0.2.2 for Android emulator
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '8000');

if (!email || !password) {
  console.error('Usage: node driver-login.js <email> <password>');
  console.error('Example: node driver-login.js driver@example.com password123\n');
  console.error('Environment variables:');
  console.error('  API_HOST - API hostname (default: localhost, use 10.0.2.2 for Android emulator)');
  console.error('  API_PORT - API port (default: 8000)\n');
  process.exit(1);
}

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            // Show detailed error information
            const errorMsg = parsed.message || parsed.error || 'Login failed';
            const errors = parsed.errors || parsed.error;
            if (errors && typeof errors === 'object') {
              const errorDetails = Object.entries(errors)
                .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                .join('\n   ');
              reject(new Error(`${errorMsg}\n   ${errorDetails}`));
            } else {
              reject(new Error(errorMsg));
            }
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Invalid response from server: ${body.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function login() {
  console.log('\n🔐 Logging in as driver...');
  console.log(`📧 Email: ${email}`);
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}\n`);

  try {
    const response = await makeRequest('POST', '/auth/user/signin', {
      email_phone_number: email,
      password: password,
    });

    // The API returns token in different possible locations
    const token = response?.data?.token || 
                  response?.authorisation?.token || 
                  response?.token;
    const user = response?.data?.user;

    if (!token) {
      throw new Error('No token received');
    }

    console.log('✅ Login successful!\n');
    console.log('📋 User Info:');
    console.log(`   Name: ${user?.name || 'N/A'}`);
    console.log(`   Email: ${user?.email || 'N/A'}`);
    console.log(`   Role: ${user?.role || 'N/A'}\n`);
    console.log('🔑 Driver Token:');
    console.log('─'.repeat(60));
    console.log(token);
    console.log('─'.repeat(60));
    console.log('\n💡 Copy the token above and use it like this:');
    console.log(`   node automate-ride.js <ride_id> ${token}\n`);

  } catch (error) {
    console.error(`\n❌ Login failed: ${error.message}\n`);
    process.exit(1);
  }
}

login();
