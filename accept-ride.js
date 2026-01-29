#!/usr/bin/env node
/**
 * Simple script to accept a ride for testing
 * Usage: node accept-ride.js <ride_id> [driver_token]
 */

const http = require('http');

const BASE_URL = '10.0.2.2:8000';
const rideId = process.argv[2];
const driverToken = process.argv[3];

if (!rideId) {
  console.error('Usage: node accept-ride.js <ride_id> [driver_token]');
  console.error('Example: node accept-ride.js 69737a4badcdf2da0b0226ff');
  process.exit(1);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL.split(':')[0],
      port: BASE_URL.split(':')[1] || 8000,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (driverToken) {
      options.headers['Authorization'] = `Bearer ${driverToken}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          console.log(`📥 ${method} ${path} - Status: ${res.statusCode}`);
          console.log(JSON.stringify(parsed, null, 2));
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || body}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          console.log(`📥 ${method} ${path} - Status: ${res.statusCode}`);
          console.log(body);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}`));
          } else {
            resolve(body);
          }
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function acceptRide() {
  try {
    console.log(`\n🚀 Accepting ride: ${rideId}\n`);

    // Step 1: Accept the ride
    console.log('📍 Step 1: Driver accepting ride...');
    const acceptResponse = await makeRequest('POST', '/driver/rides/accept', {
      rideId: rideId,
    });

    if (acceptResponse.status === 'success') {
      console.log('✅ Ride accepted!\n');
    } else {
      throw new Error('Failed to accept ride');
    }

    // Step 2: Start the ride (after a short delay)
    console.log('📍 Step 2: Starting ride...');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const startResponse = await makeRequest('POST', '/driver/rides/start', {
      rideId: rideId,
    });

    if (startResponse.status === 'success') {
      console.log('✅ Ride started!\n');
    } else {
      console.log('⚠️  Could not start ride (may need to wait for arrival status)');
    }

    // Step 3: Complete the ride (after a delay)
    console.log('📍 Step 3: Completing ride...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const completeResponse = await makeRequest('POST', '/driver/rides/complete', {
      rideId: rideId,
      paymentStatus: 'completed',
    });

    if (completeResponse.status === 'success') {
      console.log('✅ Ride completed!\n');
    } else {
      console.log('⚠️  Could not complete ride');
    }

    console.log('🎉 Ride flow completed!\n');
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (error.message.includes('401') || error.message.includes('403')) {
      console.log('💡 Tip: You may need to provide a driver token:');
      console.log(`   node accept-ride.js ${rideId} your-driver-token\n`);
    }
    process.exit(1);
  }
}

acceptRide();
