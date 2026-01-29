#!/usr/bin/env node
/**
 * Comprehensive Ride Automation Script
 * 
 * This script manually controls the ride flow using API endpoints.
 * It bypasses backend automation timers and directly progresses rides.
 * 
 * Usage: node comprehensive-ride-automation.js [ride_id] <driver_token>
 * 
 * If no ride_id is provided, it will use your active ride.
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
  console.error('Usage: node comprehensive-ride-automation.js [ride_id] <driver_token>');
  console.error('\nExamples:');
  console.error('  node comprehensive-ride-automation.js <token>                    # Uses your active ride');
  console.error('  node comprehensive-ride-automation.js <ride_id> <token>            # Uses specified ride\n');
  console.error('💡 To get a driver token:');
  console.error('   node driver-login.js <email> <password>\n');
  console.error('Environment variables:');
  console.error('  API_HOST - API hostname (default: localhost)');
  console.error('  API_PORT - API port (default: 8000)\n');
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

function sleep(seconds) {
  return new Promise((resolve) => {
    if (seconds <= 0) {
      resolve();
      return;
    }
    process.stdout.write(`⏳ Waiting ${seconds} second${seconds > 1 ? 's' : ''}...`);
    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      process.stdout.write(`\r⏳ Waiting ${remaining} second${remaining > 1 ? 's' : ''}...`);
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(30) + '\r');
        resolve();
      }
    }, 1000);
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

async function getRideStatus(rideId) {
  try {
    // Try to get ride info from active ride endpoint
    const activeRide = await getActiveRide();
    if (activeRide && activeRide.ride_id === rideId) {
      return activeRide.status;
    }
    // If not active, we'll infer from API responses
    return null;
  } catch (e) {
    return null;
  }
}

async function comprehensiveAutomation() {
  console.log('\n🚀 Comprehensive Ride Automation');
  console.log('═'.repeat(60));
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}`);
  console.log(`🔑 Using driver token: ${driverToken.substring(0, 20)}...`);
  console.log('═'.repeat(60));

  try {
    // Step 0: Set driver online
    console.log('\n📍 STEP 0: Setting Driver Online & Available');
    console.log('-'.repeat(40));
    try {
      await makeRequest('PATCH', '/driver/availability', { isAvailable: true });
      console.log('✅ Driver is online and available');
    } catch (e) {
      console.log(`⚠️  Could not set availability: ${e.message}`);
      console.log('   Continuing anyway...');
    }

    // Step 0.5: Get active ride if no ride ID provided
    if (!rideId) {
      console.log('\n📍 STEP 0.5: Finding Your Active Ride');
      console.log('-'.repeat(40));
      const activeRide = await getActiveRide();
      if (activeRide && activeRide.ride_id) {
        rideId = activeRide.ride_id;
        console.log(`✅ Found active ride: ${rideId}`);
        console.log(`   Status: ${activeRide.status}`);
        if (activeRide.origin?.address) {
          console.log(`   From: ${activeRide.origin.address}`);
        }
        if (activeRide.destination?.address) {
          console.log(`   To: ${activeRide.destination.address}`);
        }
      } else {
        console.error('\n❌ No active ride found and no ride ID provided!');
        console.error('   You must either:');
        console.error('   1. Provide a ride ID: node comprehensive-ride-automation.js <ride_id> <token>');
        console.error('   2. Have an active ride assigned to your driver account\n');
        throw new Error('No active ride found');
      }
    } else {
      // Check if this ride is our active ride
      const activeRide = await getActiveRide();
      if (activeRide && activeRide.ride_id === rideId) {
        console.log(`\n✅ Ride ${rideId} is your active ride`);
        console.log(`   Current status: ${activeRide.status}`);
      } else if (activeRide) {
        console.log(`\n⚠️  WARNING: Ride ${rideId} is NOT your active ride.`);
        console.log(`   Your active ride is: ${activeRide.ride_id}`);
        console.log(`   The script will use your active ride: ${activeRide.ride_id}\n`);
        rideId = activeRide.ride_id;
      }
    }

    console.log(`\n📋 Target Ride ID: ${rideId}`);
    console.log('═'.repeat(60));

    // Step 1: Accept ride (if needed)
    console.log('\n📍 STEP 1: Accepting Ride (if needed)');
    console.log('-'.repeat(40));
    
    let currentStatus = null;
    try {
      const activeRide = await getActiveRide();
      if (activeRide && activeRide.ride_id === rideId) {
        currentStatus = activeRide.status;
        console.log(`ℹ️  Current ride status: ${currentStatus}`);
      }
    } catch (e) {
      // Ignore
    }

    if (!currentStatus || currentStatus === 'requested') {
      try {
        console.log(`📤 POST /driver/rides/accept`);
        const response = await makeRequest('POST', '/driver/rides/accept', { rideId });
        console.log('✅ Ride accepted');
        currentStatus = 'accepted';
        await sleep(2);
      } catch (e) {
        if (e.message.includes('no longer available') || e.message.includes('already been accepted')) {
          console.log('ℹ️  Ride is already accepted, skipping...');
          currentStatus = 'accepted';
        } else {
          throw e;
        }
      }
    } else {
      console.log(`ℹ️  Ride is already ${currentStatus}, skipping accept step`);
    }

    // Step 2: Start ride (works from 'accepted' or 'arrived')
    console.log('\n📍 STEP 2: Starting Ride');
    console.log('-'.repeat(40));
    console.log('ℹ️  Start endpoint accepts rides in "accepted" or "arrived" status');
    
    await sleep(2);

    try {
      console.log(`📤 POST /driver/rides/start`);
      const response = await makeRequest('POST', '/driver/rides/start', { rideId });
      console.log('✅ Ride started');
      currentStatus = 'in-progress';
      await sleep(3);
    } catch (e) {
      if (e.message.includes('not assigned')) {
        throw new Error('This ride is assigned to a different driver. Use your active ride or create a new ride request.');
      } else if (e.message.includes('not in progress') || e.message.includes('cannot be started')) {
        // Check if already started
        const activeRide = await getActiveRide();
        if (activeRide && activeRide.status === 'in-progress') {
          console.log('ℹ️  Ride is already in progress, skipping start step');
          currentStatus = 'in-progress';
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    // Step 3: Complete ride (only works from 'in-progress')
    console.log('\n📍 STEP 3: Completing Ride');
    console.log('-'.repeat(40));
    console.log('ℹ️  Complete endpoint requires ride to be in "in-progress" status');
    
    await sleep(3);

    console.log(`📤 POST /driver/rides/complete`);
    const response = await makeRequest('POST', '/driver/rides/complete', {
      rideId: rideId,
      paymentStatus: 'completed',
    });
    console.log('✅ Ride completed successfully');

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Comprehensive Ride Automation Completed!');
    console.log('═'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   Ride ID: ${rideId}`);
    console.log('   ✓ Driver set online');
    console.log('   ✓ Ride accepted (if needed)');
    console.log('   ✓ Ride started');
    console.log('   ✓ Ride completed');
    console.log('\n💡 The ride should now show as completed in your app!\n');

  } catch (error) {
    console.error('\n❌ Automation Error:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('not assigned')) {
      console.error('💡 Assignment Error:');
      console.error('   This ride is assigned to a different driver.');
      console.error('   Solutions:');
      console.error('   1. Run without ride ID to use your active ride:');
      console.error('      node comprehensive-ride-automation.js <token>');
      console.error('   2. Create a new ride request from the mobile app');
      console.error('   3. Make sure you\'re using the correct driver token\n');
    } else if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Authentication Error:');
      console.error('   Your token may have expired. Get a new one:');
      console.error('   node driver-login.js <email> <password>\n');
    } else if (error.message.includes('No active ride')) {
      console.error('💡 No Active Ride:');
      console.error('   Create a new ride request from your mobile app first.\n');
    }
    
    process.exit(1);
  }
}

comprehensiveAutomation();
