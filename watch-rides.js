#!/usr/bin/env node
/**
 * Watch for new ride requests and automatically complete them
 * Usage: node watch-rides.js <driver_token>
 */

const http = require('http');

// Allow API host to be configured via environment variable
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '8000');

const driverToken = process.argv[2];

if (!driverToken) {
  console.error('❌ Error: Driver token is required\n');
  console.error('Usage: node watch-rides.js <driver_token>');
  console.error('Get token: node driver-login.js <email> <password>\n');
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
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body.substring(0, 100)}`));
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

async function setDriverOnline() {
  try {
    await makeRequest('PATCH', '/driver/availability', {
      isAvailable: true,
    });
    console.log('✅ Driver is online and available\n');
  } catch (e) {
    console.log(`⚠️  Could not set driver availability: ${e.message}`);
  }
}

async function checkActiveRide() {
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

async function checkPendingRides() {
  try {
    const response = await makeRequest('GET', '/driver/rides/pending');
    if (response.data && response.data.rides && response.data.rides.length > 0) {
      return response.data.rides;
    }
    return [];
  } catch (e) {
    return [];
  }
}

function sleep(seconds) {
  return new Promise((resolve) => {
    if (seconds <= 0) {
      resolve();
      return;
    }
    let remaining = seconds;
    const interval = setInterval(() => {
      process.stdout.write(`\r⏳ Waiting ${remaining} second${remaining > 1 ? 's' : ''} before next step...`);
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\r' + ' '.repeat(50) + '\r');
        resolve();
      }
    }, 1000);
  });
}

async function acceptRide(rideId) {
  console.log(`\n📍 Accepting ride ${rideId}...`);
  const response = await makeRequest('POST', '/driver/rides/accept', { rideId });
  console.log('✅ Ride accepted!');
  await sleep(12); // Wait 12 seconds
  return response;
}

async function startRide(rideId) {
  console.log(`\n📍 Starting ride ${rideId}...`);
  const response = await makeRequest('POST', '/driver/rides/start', { rideId });
  console.log('✅ Ride started!');
  await sleep(12); // Wait 12 seconds
  return response;
}

async function completeRide(rideId) {
  console.log(`\n📍 Completing ride ${rideId}...`);
  const response = await makeRequest('POST', '/driver/rides/complete', {
    rideId,
    paymentStatus: 'completed',
  });
  console.log('✅ Ride completed!');
  return response;
}

async function processRide(ride) {
  const rideId = ride.ride_id || ride._id || ride.id;
  const status = ride.status;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚗 Processing Ride: ${rideId}`);
  console.log(`📊 Current Status: ${status}`);
  if (ride.origin || ride.pickup) {
    console.log(`📍 Pickup: ${(ride.origin || ride.pickup)?.address || 'N/A'}`);
  }
  if (ride.destination || ride.dropoff) {
    console.log(`📍 Dropoff: ${(ride.destination || ride.dropoff)?.address || 'N/A'}`);
  }
  if (ride.cost) {
    console.log(`💰 Fare: ₦${ride.cost || '0'}`);
  }
  console.log(`${'='.repeat(60)}`);

  try {
    if (status === 'requested') {
      await acceptRide(rideId);
      // Wait already included in acceptRide
      await startRide(rideId);
      // Wait already included in startRide
      await completeRide(rideId);
    } else if (status === 'accepted' || status === 'arrived') {
      console.log(`ℹ️  Ride is already ${status}, starting...`);
      await startRide(rideId);
      // Wait already included in startRide
      await completeRide(rideId);
    } else if (status === 'in-progress') {
      console.log(`ℹ️  Ride is already in progress, completing...`);
      await completeRide(rideId);
    } else if (status === 'completed') {
      console.log(`✅ Ride is already completed!`);
      return true;
    } else {
      console.log(`ℹ️  Ride is in ${status} status, no action needed`);
      return true;
    }

    console.log('\n🎉 Ride flow completed successfully!\n');
    return true;
  } catch (error) {
    if (error.message.includes('not assigned')) {
      console.error(`\n❌ Error: This ride is assigned to a different driver.`);
      console.error(`   The ride ${rideId} belongs to another driver account.\n`);
    } else {
      console.error(`\n❌ Error processing ride: ${error.message}\n`);
    }
    return false;
  }
}

async function watchRides() {
  console.log('\n🚀 Starting Ride Watcher');
  console.log('═'.repeat(60));
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}`);
  console.log('👁️  Watching for new ride requests...');
  console.log('⚠️  Press Ctrl+C to stop\n');

  await setDriverOnline();

  let lastRideId = null;
  let checkCount = 0;
  let processedRides = new Set();

  const watch = async () => {
    try {
      checkCount++;
      process.stdout.write(`\r🔍 Checking for rides... (${checkCount} checks)`);

      // Check for active ride first
      const activeRide = await checkActiveRide();
      if (activeRide && activeRide.ride_id) {
        const rideId = activeRide.ride_id;
        if (!processedRides.has(rideId) && rideId !== lastRideId) {
          console.log('\n\n🔔 Active ride detected!');
          lastRideId = rideId;
          processedRides.add(rideId);
          await processRide(activeRide);
          // Continue watching after processing
          setTimeout(watch, 5000);
          return;
        }
      }

      // Check for pending rides
      const pendingRides = await checkPendingRides();
      if (pendingRides.length > 0) {
        const ride = pendingRides[0];
        const rideId = ride.ride_id || ride._id;
        if (rideId && !processedRides.has(rideId) && rideId !== lastRideId) {
          console.log('\n\n🔔 New ride request detected!');
          lastRideId = rideId;
          processedRides.add(rideId);
          await processRide(ride);
          // Continue watching after processing
          setTimeout(watch, 5000);
          return;
        }
      }

      // Check every 3 seconds
      setTimeout(watch, 3000);
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      setTimeout(watch, 3000);
    }
  };

  watch();
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping ride watcher...\n');
  process.exit(0);
});

watchRides();
