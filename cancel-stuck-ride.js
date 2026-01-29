#!/usr/bin/env node
/**
 * Cancel Stuck Ride Script
 * 
 * Cancels a ride that's stuck in "arrived" or "accepted" status.
 * This clears the backend automation timers and resets the ride.
 * 
 * Usage: node cancel-stuck-ride.js [ride_id] <driver_token>
 */

const http = require('http');

// Allow API host to be configured via environment variable
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '8000');

let rideId = process.argv[2];
let driverToken = process.argv[3];

// If first arg looks like a token (starts with eyJ), then no ride ID was provided
if (rideId && rideId.startsWith('eyJ') && !driverToken) {
  driverToken = rideId;
  rideId = null;
}

if (!driverToken) {
  console.error('❌ Error: Driver token is required\n');
  console.error('Usage: node cancel-stuck-ride.js [ride_id] <driver_token>');
  console.error('\nExamples:');
  console.error('  node cancel-stuck-ride.js <token>                    # Cancels your active ride');
  console.error('  node cancel-stuck-ride.js <ride_id> <token>            # Cancels specified ride\n');
  process.exit(1);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${driverToken}`,
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
            const errorMsg = parsed.message || parsed.error || `HTTP ${res.statusCode}`;
            reject(new Error(errorMsg));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
          } else {
            resolve({ rawBody: body });
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

async function getActiveRide() {
  try {
    const response = await makeRequest('GET', '/booking/driver/active-ride');
    if (response.data && response.data.ride && response.data.ride.ride_id) {
      return response.data.ride;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function cancelRide() {
  console.log('\n🚫 Canceling Stuck Ride');
  console.log('═'.repeat(60));
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}`);
  console.log(`🔑 Using driver token: ${driverToken.substring(0, 20)}...`);
  console.log('═'.repeat(60));

  try {
    // Get active ride if no ride ID provided
    if (!rideId) {
      console.log('\n📍 Finding Your Active Ride');
      console.log('-'.repeat(40));
      const activeRide = await getActiveRide();
      if (activeRide && activeRide.ride_id) {
        rideId = activeRide.ride_id;
        console.log(`✅ Found active ride: ${rideId}`);
        console.log(`   Status: ${activeRide.status}`);
      } else {
        console.error('\n❌ No active ride found!');
        console.error('   Provide a ride ID: node cancel-stuck-ride.js <ride_id> <token>\n');
        process.exit(1);
      }
    }

    console.log(`\n📋 Canceling Ride: ${rideId}`);
    console.log('-'.repeat(40));

    // Try to cancel as driver first
    try {
      console.log(`📤 POST /driver/rides/cancel`);
      const response = await makeRequest('POST', '/driver/rides/cancel', {
        rideId: rideId,
        reason: 'Clearing stuck ride for testing',
      });
      console.log('✅ Ride canceled successfully by driver');
      console.log(`   Message: ${response.message || 'Success'}\n`);
      return;
    } catch (e) {
      if (e.message.includes('not assigned')) {
        console.log('⚠️  Ride is not assigned to this driver');
        console.log('   Trying to cancel as rider...\n');
      } else {
        throw e;
      }
    }

    // If driver cancel fails, try as rider (if you have rider token)
    console.log('💡 Note: To cancel as rider, you need a rider token.');
    console.log('   Or cancel the ride directly from the mobile app.\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error('💡 Solutions:');
    console.error('   1. Cancel the ride from the mobile app');
    console.error('   2. Make sure you\'re using the correct driver token');
    console.error('   3. The ride may already be canceled or completed\n');
    process.exit(1);
  }
}

cancelRide();
