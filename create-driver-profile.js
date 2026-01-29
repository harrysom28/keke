#!/usr/bin/env node
/**
 * Create Driver Profile Script
 * Creates a driver profile for an existing user account
 * 
 * Usage: node create-driver-profile.js <email> <password>
 */

const http = require('http');

const email = process.argv[2];
const password = process.argv[3];

// Allow API host to be configured via environment variable
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '8000');

if (!email || !password) {
  console.error('Usage: node create-driver-profile.js <email> <password>');
  console.error('Example: node create-driver-profile.js driver@example.com password123\n');
  console.error('Environment variables:');
  console.error('  API_HOST - API hostname (default: localhost)');
  console.error('  API_PORT - API port (default: 8000)\n');
  process.exit(1);
}

function makeRequest(method, path, data = null, token = null) {
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

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 400) {
            const errorMsg = parsed.message || parsed.error || 'Request failed';
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
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
          } else {
            resolve(body);
          }
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

async function createDriverProfile() {
  console.log('\n🔐 Step 1: Logging in...');
  console.log(`📧 Email: ${email}`);
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}\n`);

  try {
    // Step 1: Login to get token
    const loginResponse = await makeRequest('POST', '/auth/user/signin', {
      email_phone_number: email,
      password: password,
    });

    const token = loginResponse?.data?.token || 
                  loginResponse?.authorisation?.token || 
                  loginResponse?.token;

    if (!token) {
      throw new Error('No token received from login');
    }

    console.log('✅ Login successful!\n');

    // Step 2: Get available vehicle types
    console.log('🚗 Step 2: Fetching available vehicle types...\n');
    let vehicleTypes = [];
    try {
      const vehicleTypesResponse = await makeRequest('GET', '/vehicle/types', null, token);
      vehicleTypes = vehicleTypesResponse?.data || [];
      if (vehicleTypes.length > 0) {
        console.log(`✅ Found ${vehicleTypes.length} vehicle type(s)\n`);
      }
    } catch (e) {
      console.log('⚠️  Could not fetch vehicle types, using defaults\n');
    }

    // Step 3: Create driver profile with default values
    console.log('👤 Step 3: Creating driver profile...\n');

    // Use first available vehicle type, or default to 'keke'
    const vehicleTypeId = vehicleTypes.length > 0 
      ? (vehicleTypes[0]._id || vehicleTypes[0].id || vehicleTypes[0].vehicle_id)
      : null;
    
    if (!vehicleTypeId && vehicleTypes.length > 0) {
      console.log('⚠️  Warning: Could not extract vehicle type ID, proceeding without it\n');
    }

    const driverData = {
      licenseNumber: 'TEST-LICENSE-12345',
      licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      vehicleDetails: {
        make: 'Test Make',
        model: 'Test Model',
        year: new Date().getFullYear(),
        plateNumber: 'TEST-123',
        color: 'Yellow',
        vehicleType: vehicleTypeId,
      },
      bankAccount: {
        accountName: 'Test Account',
        accountNumber: '1234567890',
        bankName: 'Test Bank',
      },
    };

    const createResponse = await makeRequest('POST', '/driver/create', driverData, token);

    if (createResponse.status === 'success') {
      console.log('✅ Driver profile created successfully!\n');
      console.log('📋 Driver Profile Info:');
      const driver = createResponse.data?.driver;
      if (driver) {
        console.log(`   Name: ${driver.user?.name || 'N/A'}`);
        console.log(`   Email: ${driver.user?.email || 'N/A'}`);
        console.log(`   Vehicle: ${driver.vehicleDetails?.make || 'N/A'} ${driver.vehicleDetails?.model || 'N/A'}`);
        console.log(`   License: ${driver.licenseNumber || 'N/A'}\n`);
      }
      console.log('⚠️  IMPORTANT: Driver needs to be verified before accepting rides!');
      console.log('   Run this to verify and make the driver available:');
      console.log('   cd backend && node scripts/makeDriversAvailable.js\n');
      console.log('💡 After verification, you can use this account to accept rides:');
      console.log('   node automate-ride.js <ride_id> <token>\n');
    } else {
      throw new Error('Failed to create driver profile');
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    
    if (error.message.includes('already exists')) {
      console.error('💡 Driver profile already exists for this user.');
      console.error('   You can proceed to use the automate-ride.js script.\n');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Authentication Error:');
      console.error('   Check your email and password.\n');
    } else if (error.message.includes('404')) {
      console.error('💡 Resource Not Found:');
      console.error('   Make sure the backend server is running.\n');
    }
    
    process.exit(1);
  }
}

createDriverProfile();
