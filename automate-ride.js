#!/usr/bin/env node
/**
 * Ride Flow Automation Script
 * 
 * Automates the complete driver ride flow for testing purposes.
 * Properly advances ride through all states: accepted -> started -> completed
 * 
 * Usage: node automate-ride.js <ride_id> [driver_token]
 * 
 * Example:
 *   node automate-ride.js 6974f6ecde61cb04c6ff6676
 *   node automate-ride.js 6974f6ecde61cb04c6ff6676 your-driver-token-here
 */

const http = require('http');

// Allow API host to be configured via environment variable
// Default to localhost (works on host machine)
// Use 10.0.2.2 for Android emulator
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '8000');

let rideId = process.argv[2];
let driverToken = process.argv[3];

// If first arg looks like a token (starts with eyJ), then no ride ID was provided
if (rideId && rideId.startsWith('eyJ') && !driverToken) {
  // First arg is actually the token, no ride ID provided
  driverToken = rideId;
  rideId = null;
}

if (!driverToken) {
  console.error('Usage: node automate-ride.js [ride_id] <driver_token>');
  console.error('\nExamples:');
  console.error('  node automate-ride.js <driver_token>                    # Uses your active ride');
  console.error('  node automate-ride.js <ride_id> <driver_token>          # Uses specified ride\n');
  console.error('💡 To get a driver token, first run:');
  console.error('   node driver-login.js <email> <password>\n');
  console.error('Environment variables:');
  console.error('  API_HOST - API hostname (default: localhost, use 10.0.2.2 for Android emulator)');
  console.error('  API_PORT - API port (default: 8000)\n');
  process.exit(1);
}

// If no ride ID provided, we'll try to get it from active ride
const needsActiveRideCheck = !rideId;

if (!driverToken) {
  console.warn('⚠️  WARNING: No driver token provided.');
  console.warn('   Driver endpoints require authentication.');
  console.warn('   Get a token by running: node driver-login.js <email> <password>\n');
  console.warn('   Continuing anyway...\n');
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
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || body}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
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

function sleep(seconds) {
  return new Promise((resolve) => {
    if (seconds <= 0) {
      resolve();
      return;
    }
    console.log(`⏳ Waiting ${seconds} second${seconds > 1 ? 's' : ''}...`);
    let remaining = seconds;
    const interval = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(interval);
        resolve();
      }
    }, 1000);
  });
}

async function automateRideFlow() {
  console.log('\n🚀 Starting Ride Flow Automation');
  console.log('═'.repeat(60));
  console.log(`📋 Ride ID: ${rideId}`);
  console.log(`🌐 API: http://${API_HOST}:${API_PORT}`);
  if (driverToken) {
    console.log('🔑 Using driver token: ' + driverToken.substring(0, 20) + '...');
  }
  console.log('═'.repeat(60));

  try {
    // Step 0: Ensure driver is online and available
    console.log('\n📍 STEP 0: Setting Driver Online & Available');
    console.log('-'.repeat(40));
    
    try {
      console.log(`📤 PATCH /driver/availability`);
      const availabilityResponse = await makeRequest('PATCH', '/driver/availability', {
        isAvailable: true,
      });
      
      if (availabilityResponse.status === 'success') {
        console.log('✅ Driver is now online and available');
      }
    } catch (availabilityError) {
      console.log('⚠️  Could not set driver availability automatically');
      console.log(`   Error: ${availabilityError.message}`);
      console.log('   Continuing anyway...\n');
    }
    
    await sleep(2);
    
    // Step 0.5: Check pending rides to see what's available
    console.log('\n📍 STEP 0.5: Checking Available Rides');
    console.log('-'.repeat(40));
    
    try {
      console.log(`📤 GET /driver/rides/pending`);
      const pendingResponse = await makeRequest('GET', '/driver/rides/pending', null);
      
      if (pendingResponse.status === 'success' && pendingResponse.data?.rides) {
        const pendingRides = pendingResponse.data.rides;
        console.log(`✅ Found ${pendingRides.length} pending ride(s) available\n`);
        
        // Check if our target ride is in the list
        const targetRide = pendingRides.find(r => r.ride_id === rideId);
        if (!targetRide) {
          console.log(`⚠️  Warning: Ride ${rideId} is NOT in the pending rides list.`);
          console.log(`   This ride may have already been accepted, cancelled, or is in a different state.\n`);
          console.log(`   Available ride IDs:`);
          pendingRides.slice(0, 5).forEach((ride, idx) => {
            console.log(`   ${idx + 1}. ${ride.ride_id} - ${ride.pickup?.address || 'Unknown location'}`);
          });
          if (pendingRides.length > 5) {
            console.log(`   ... and ${pendingRides.length - 5} more`);
          }
          console.log('\n   You can:');
          console.log(`   1. Use one of the available ride IDs above`);
          console.log(`   2. Check the ride status in your database`);
          console.log(`   3. Create a new ride request\n`);
        } else {
          console.log(`✅ Found target ride ${rideId} in pending rides!`);
          console.log(`   From: ${targetRide.pickup?.address || 'Unknown'}`);
          console.log(`   To: ${targetRide.destination?.address || 'Unknown'}\n`);
        }
      }
    } catch (pendingError) {
      console.log('⚠️  Could not check pending rides (this is optional)');
      console.log(`   Error: ${pendingError.message}\n`);
    }
    
    await sleep(2);
    
    // Step 0.6: Check if driver has an active ride assigned (required if no ride ID provided)
    console.log('\n📍 STEP 0.6: Checking Driver Active Ride');
    console.log('-'.repeat(40));
    
    let activeRideId = null;
    let currentRideStatus = null;
    try {
      console.log(`📤 GET /booking/driver/active-ride`);
      const activeRideResponse = await makeRequest('GET', '/booking/driver/active-ride', null);
      
      if (activeRideResponse.status === 'success') {
        const ride = activeRideResponse.data?.ride;
        if (ride && ride.ride_id) {
          activeRideId = ride.ride_id;
          currentRideStatus = ride.status;
          
          console.log(`✅ Found active ride assigned to this driver!`);
          console.log(`   Ride ID: ${activeRideId}`);
          console.log(`   Status: ${currentRideStatus}`);
          if (ride.origin?.address) {
            console.log(`   From: ${ride.origin.address}`);
          }
          if (ride.destination?.address) {
            console.log(`   To: ${ride.destination.address}`);
          }
          console.log('');
          
          if (needsActiveRideCheck) {
            // No ride ID was provided, use the active one
            rideId = activeRideId;
            console.log(`✅ Using active ride: ${rideId}\n`);
          } else if (activeRideId !== rideId) {
            console.log(`⚠️  WARNING: You specified ride ${rideId}, but your active ride is ${activeRideId}`);
            console.log(`   The script will use your active ride: ${activeRideId}\n`);
            rideId = activeRideId; // Update to use the active ride
          } else {
            console.log(`✅ The specified ride ID matches your active ride!\n`);
          }
        } else {
          if (needsActiveRideCheck) {
            console.error('❌ No active ride found and no ride ID provided!');
            console.error('   You must either:');
            console.error('   1. Provide a ride ID: node automate-ride.js <ride_id> <token>');
            console.error('   2. Have an active ride assigned to your driver account\n');
            throw new Error('No active ride found and no ride ID provided');
          } else {
            console.log('ℹ️  No active ride found for this driver');
            console.log(`   Will attempt to use the specified ride ID: ${rideId}\n`);
          }
        }
      } else {
        if (needsActiveRideCheck) {
          console.error('❌ Could not check for active ride!');
          throw new Error('Failed to check active ride');
        } else {
          console.log('ℹ️  No active ride found for this driver');
          console.log(`   Will attempt to use the specified ride ID: ${rideId}\n`);
        }
      }
    } catch (e) {
      if (needsActiveRideCheck) {
        console.error(`❌ Could not check active ride: ${e.message}`);
        console.error('   You must provide a ride ID: node automate-ride.js <ride_id> <token>\n');
        throw e;
      } else {
        console.log(`⚠️  Could not check active ride: ${e.message}`);
        console.log(`   Will proceed with specified ride ID: ${rideId}\n`);
      }
    }
    
    if (!rideId) {
      throw new Error('No ride ID available. Provide one or ensure you have an active ride.');
    }
    
    // Step 1: Try to accept the ride (skip if already accepted)
    console.log('\n📍 STEP 1: Driver Accepting Ride');
    console.log('-'.repeat(40));
    
    let rideAccepted = false;
    try {
      await sleep(2);
      console.log(`📤 POST /driver/rides/accept`);
      const acceptResponse = await makeRequest('POST', '/driver/rides/accept', {
        rideId: rideId,
      });

      if (acceptResponse.status === 'success') {
        console.log('✅ Ride accepted by driver');
        console.log(`   Message: ${acceptResponse.message || 'Success'}`);
        rideAccepted = true;
        currentRideStatus = acceptResponse.data?.ride?.status || 'accepted';
      } else {
        throw new Error('Failed to accept ride: ' + JSON.stringify(acceptResponse));
      }
    } catch (acceptError) {
      if (acceptError.message.includes('no longer available') || 
          acceptError.message.includes('already been accepted') ||
          acceptError.message.includes('already has an active ride')) {
        console.log('ℹ️  Ride is already accepted or in progress');
        console.log('   Skipping accept step, proceeding to start/complete...\n');
        // Ride is likely already accepted, try to get status from start attempt
        currentRideStatus = 'accepted'; // Assume accepted or arrived
      } else {
        throw acceptError;
      }
    }

    // Step 2: Start the ride (works for both 'accepted' and 'arrived' status)
    console.log('\n📍 STEP 2: Starting Ride');
    console.log('-'.repeat(40));
    console.log('ℹ️  Note: Start endpoint accepts rides in "accepted" or "arrived" status');
    
    await sleep(3);

    let rideStarted = false;
    try {
      console.log(`📤 POST /driver/rides/start`);
      const startResponse = await makeRequest('POST', '/driver/rides/start', {
        rideId: rideId,
      });

      if (startResponse.status === 'success') {
        console.log('✅ Ride started');
        console.log(`   Message: ${startResponse.message || 'Success'}`);
        rideStarted = true;
        currentRideStatus = 'in-progress';
      } else {
        throw new Error('Failed to start ride: ' + JSON.stringify(startResponse));
      }
    } catch (startError) {
      if (startError.message.includes('not assigned') || 
          startError.message.includes('You are not assigned')) {
        console.error('\n❌ Assignment Error:');
        console.error('   This ride is assigned to a different driver.');
        console.error('   You cannot start/complete rides assigned to other drivers.\n');
        console.error('   Solutions:');
        console.error('   1. Check your active ride: The script tried to find it above');
        console.error('   2. Use a ride ID that belongs to your driver account');
        console.error('   3. Create a new ride request from the mobile app');
        console.error('   4. Make sure you\'re using the correct driver token\n');
        throw new Error('Ride is assigned to a different driver. Use your active ride or create a new ride request.');
      } else if (startError.message.includes('not in progress') || 
          startError.message.includes('cannot be started')) {
        // Ride might already be started or in wrong status
        if (startError.message.includes('not in progress')) {
          console.log('ℹ️  Ride appears to already be in progress');
          console.log('   Skipping start step, proceeding to complete...\n');
          currentRideStatus = 'in-progress';
          rideStarted = true; // Treat as if started
        } else {
          throw startError;
        }
      } else {
        throw startError;
      }
    }

    // Step 3: Complete the ride (only works if ride is 'in-progress')
    console.log('\n📍 STEP 3: Completing Ride');
    console.log('-'.repeat(40));
    console.log('ℹ️  Note: Complete endpoint requires ride to be in "in-progress" status');
    
    await sleep(5);

    console.log(`📤 POST /driver/rides/complete`);
    const completeResponse = await makeRequest('POST', '/driver/rides/complete', {
      rideId: rideId,
      paymentStatus: 'completed',
    });

    if (completeResponse.status === 'success') {
      console.log('✅ Ride completed successfully');
      console.log(`   Message: ${completeResponse.message || 'Success'}`);
    } else {
      throw new Error('Failed to complete ride: ' + JSON.stringify(completeResponse));
    }

    // Final summary
    console.log('\n' + '═'.repeat(60));
    console.log('🎉 Ride Flow Automation Completed Successfully!');
    console.log('═'.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   ✓ Ride Accepted (POST /driver/rides/accept)');
    console.log('   ✓ Ride Started (POST /driver/rides/start)');
    console.log('   ✓ Ride Completed (POST /driver/rides/complete)');
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Automation Error:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('401') || error.message.includes('403')) {
      console.error('💡 Authentication Error:');
      console.error('   You need to provide a valid driver token.');
      console.error('   Get one by running:');
      console.error('   node driver-login.js <email> <password>\n');
    } else if (error.message.includes('404')) {
      if (error.message.includes('Driver profile not found')) {
        console.error('💡 Driver Profile Not Found:');
        console.error('   Your user account exists but does not have a Driver profile.');
        console.error('   You need to create a Driver profile before accepting rides.\n');
        console.error('   Options:');
        console.error('   1. Use the mobile app to complete driver registration');
        console.error('   2. Use the API endpoint: POST /api/driver/create');
        console.error('   3. Run the seed script: cd backend && node scripts/seedTestDrivers.js\n');
      } else if (error.message.includes('Ride') || error.message.includes('ride')) {
        console.error('💡 Ride Not Found:');
        console.error('   Make sure the ride ID is correct and the ride exists.\n');
      } else {
        console.error('💡 Resource Not Found:');
        console.error(`   ${error.message}\n`);
      }
    } else if (error.message.includes('400')) {
      if (error.message.includes('Driver must be online') || error.message.includes('online and available')) {
        console.error('💡 Driver Status Error:');
        console.error('   The driver needs to be online and available to accept rides.');
        console.error('   The script tried to set the driver online automatically, but it failed.\n');
        console.error('   Possible reasons:');
        console.error('   1. Driver profile is not verified (documentsVerified = false)');
        console.error('   2. Driver verification status is not "approved"');
        console.error('   3. Driver needs to go online manually via the app\n');
        console.error('   Solutions:');
        console.error('   - Run: cd backend && node scripts/makeDriversAvailable.js');
        console.error('   - Or manually verify the driver in the database\n');
      } else if (error.message.includes('not assigned') || 
                 error.message.includes('You are not assigned')) {
        console.error('💡 Assignment Error:');
        console.error('   This ride is assigned to a different driver.');
        console.error('   You can only manage rides assigned to your driver account.\n');
        console.error('   Solutions:');
        console.error('   1. Check your active ride: Run the script and it will auto-detect it');
        console.error('   2. Use a ride ID that belongs to your driver account');
        console.error('   3. Create a new ride request from the mobile app');
        console.error('   4. Make sure you\'re using the correct driver token\n');
      } else if (error.message.includes('no longer available') || error.message.includes('Ride is no longer')) {
        console.error('💡 Ride Status Error:');
        console.error('   The ride is no longer in "requested" status.');
        console.error('   This means the ride has likely been:');
        console.error('   - Already accepted by another driver');
        console.error('   - Cancelled by the rider');
        console.error('   - Already started or completed');
        console.error('   - Auto-assigned to another driver\n');
        console.error('   Solutions:');
        console.error('   1. Check pending rides: The script showed available rides above');
        console.error('   2. Use a different ride ID from the pending rides list');
        console.error('   3. Create a new ride request from the mobile app');
        console.error('   4. Check the ride status in your database\n');
      } else {
        console.error('💡 Bad Request:');
        console.error(`   ${error.message}`);
        console.error('   The ride may already be in a different state.');
        console.error('   Check the ride status in your database or app.\n');
      }
    } else if (error.message.includes('Driver must be verified')) {
      console.error('💡 Driver Verification Error:');
      console.error('   The driver profile exists but is not verified.');
      console.error('   Run: cd backend && node scripts/makeDriversAvailable.js\n');
    }
    
    process.exit(1);
  }
}

automateRideFlow();
