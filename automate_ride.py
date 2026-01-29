#!/usr/bin/env python3
"""
Ride Flow Automation Script (Python)

Automates the complete driver ride flow for testing purposes.
Matches the actual backend API endpoints.

Usage:
    python automate_ride.py <ride_id> [driver_token]
    
Example:
    python automate_ride.py 69737638adcdf2da0b022063
    python automate_ride.py 69737638adcdf2da0b022063 your-driver-token-here
"""

import requests
import time
import sys
import json
from datetime import datetime
from typing import Optional, Dict, Any

BASE_URL = "http://10.0.2.2:8000/api"


class RideAutomation:
    def __init__(self, base_url: str = BASE_URL, driver_token: Optional[str] = None):
        self.base_url = base_url
        self.driver_token = driver_token
        self.session = requests.Session()
        
        if driver_token:
            self.session.headers.update({
                'Authorization': f'Bearer {driver_token}',
                'Content-Type': 'application/json'
            })
        else:
            self.session.headers.update({
                'Content-Type': 'application/json'
            })

    def api_call(self, endpoint: str, method: str = 'GET', data: Optional[Dict] = None) -> Dict[str, Any]:
        """Make an API call"""
        url = f"{self.base_url}{endpoint}"
        print(f"📤 {method} {url}")
        if data:
            print(f"   Body: {json.dumps(data, indent=2)}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, params=data)
            elif method == 'POST':
                response = self.session.post(url, json=data)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data)
            elif method == 'PUT':
                response = self.session.put(url, json=data)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            result = response.json()
            print(f"📥 Response ({response.status_code}):", json.dumps(result, indent=2))
            
            if response.status_code >= 400:
                raise Exception(f"API Error: {result.get('message', 'Unknown error')}")
            
            return result
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Network Error: {str(e)}")
            raise
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            raise

    def sleep_with_message(self, seconds: int, message: str):
        """Sleep with a countdown message"""
        print(f"⏳ {message} ({seconds}s)")
        for i in range(seconds, 0, -1):
            print(f"   {i}...", end='\r', flush=True)
            time.sleep(1)
        print("   ✓   ")

    def automate_ride_flow(self, ride_id: str) -> bool:
        """Automate the complete ride flow using actual backend endpoints"""
        print("\n🚀 Starting Ride Flow Automation")
        print(f"📋 Ride ID: {ride_id}")
        print("═" * 60)

        if not self.driver_token:
            print("⚠️  WARNING: No driver token provided. Some endpoints require authentication.")
            print("   You may need to provide a driver token for this to work.")
            response = input("   Continue anyway? (y/n): ").strip().lower()
            if response != 'y':
                return False

        try:
            # Step 1: Driver accepts the ride
            print("\n📍 STEP 1: Driver Accepting Ride")
            print("-" * 40)
            self.sleep_with_message(2, "Simulating driver decision time")
            
            accept_response = self.api_call(
                "/driver/rides/accept",
                'POST',
                {
                    'rideId': ride_id
                }
            )
            
            if accept_response.get('status') == 'success':
                print("✅ Ride accepted by driver")
            else:
                raise Exception("Failed to accept ride")

            # Step 2: Wait for driver to arrive (backend auto-transitions after 30s, or we can skip)
            print("\n📍 STEP 2: Driver Arriving at Pickup")
            print("-" * 40)
            print("ℹ️  Note: Backend automatically transitions to 'arrived' after 30 seconds")
            print("   Or we can proceed directly to start (start accepts both 'accepted' and 'arrived')")
            self.sleep_with_message(5, "Simulating travel to pickup location")

            # Check ride status
            try:
                ride_check = self.api_call(f"/booking/active-ride", 'GET')
                current_status = ride_check.get('data', {}).get('ride', {}).get('status')
                print(f"📊 Current ride status: {current_status}")
            except:
                print("⚠️  Could not check ride status (endpoint may require rider auth)")

            # Step 3: Driver starts the ride
            print("\n📍 STEP 3: Starting Ride")
            print("-" * 40)
            self.sleep_with_message(3, "Simulating passenger boarding")
            
            start_response = self.api_call(
                "/driver/rides/start",
                'POST',
                {
                    'rideId': ride_id
                }
            )
            
            if start_response.get('status') == 'success':
                print("✅ Ride started")
            else:
                raise Exception("Failed to start ride")

            # Step 4: Driver completes the ride
            print("\n📍 STEP 4: Completing Ride")
            print("-" * 40)
            self.sleep_with_message(7, "Simulating ride duration")
            
            complete_response = self.api_call(
                "/driver/rides/complete",
                'POST',
                {
                    'rideId': ride_id,
                    'paymentStatus': 'completed'  # Optional, but helps with payment processing
                }
            )
            
            if complete_response.get('status') == 'success':
                print("✅ Ride completed successfully")
            else:
                raise Exception("Failed to complete ride")

            # Final summary
            print("\n" + "═" * 60)
            print("🎉 Ride Flow Automation Completed Successfully!")
            print("═" * 60)
            print("\n📊 Summary:")
            print("   ✓ Ride Accepted (POST /driver/rides/accept)")
            print("   ✓ Ride Started (POST /driver/rides/start)")
            print("   ✓ Ride Completed (POST /driver/rides/complete)")
            print("\n")

            return True

        except Exception as e:
            print(f"\n❌ Automation Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return False

    def get_driver_token_from_login(self, email: str, password: str) -> Optional[str]:
        """Helper to get driver token by logging in"""
        print(f"\n🔐 Logging in as driver: {email}")
        try:
            response = self.api_call(
                "/auth/user/signin",
                'POST',
                {
                    'email': email,
                    'password': password
                }
            )
            
            token = response.get('data', {}).get('token')
            if token:
                print("✅ Login successful, token obtained")
                self.driver_token = token
                self.session.headers.update({
                    'Authorization': f'Bearer {token}'
                })
                return token
            else:
                print("❌ No token in response")
                return None
        except Exception as e:
            print(f"❌ Login failed: {str(e)}")
            return None

    def watch_and_automate(self, check_interval: int = 3):
        """Watch for new rides and automatically process them"""
        print("👁️  Watching for new rides to auto-process...")
        print("⚠️  This requires driver authentication!")
        print("   Press Ctrl+C to stop\n")
        
        last_ride_id = None

        try:
            while True:
                try:
                    # Check for pending rides (driver endpoint)
                    response = self.api_call('/driver/rides/pending', 'GET')
                    rides = response.get('data', {}).get('rides', [])

                    if rides:
                        # Get the first pending ride
                        ride = rides[0]
                        ride_id = ride.get('ride_id')
                        
                        if ride_id and ride_id != last_ride_id:
                            print("\n🔔 New ride detected!")
                            print(f"   Ride ID: {ride_id}")
                            print(f"   From: {ride.get('pickup', {}).get('address', 'Unknown')}")
                            last_ride_id = ride_id
                            
                            # Process the ride
                            self.automate_ride_flow(ride_id)
                    else:
                        print(f"   No pending rides... (checking every {check_interval}s)")

                except Exception as e:
                    print(f"   Error checking rides: {str(e)}")

                time.sleep(check_interval)

        except KeyboardInterrupt:
            print("\n\n👋 Stopping automation watch...")


def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print("Usage: python automate_ride.py <ride_id> [driver_token]")
        print("\nOptions:")
        print("  <ride_id>        - The ride ID to automate")
        print("  [driver_token]   - Optional driver authentication token")
        print("\nExamples:")
        print("  python automate_ride.py 69737638adcdf2da0b022063")
        print("  python automate_ride.py 69737638adcdf2da0b022063 your-token-here")
        print("\nWatch Mode (auto-process new rides):")
        print("  python automate_ride.py watch [driver_token]")
        sys.exit(1)

    ride_id_or_mode = sys.argv[1]
    driver_token = sys.argv[2] if len(sys.argv) > 2 else None

    automation = RideAutomation(driver_token=driver_token)
    
    # Watch mode
    if ride_id_or_mode.lower() == 'watch':
        if not driver_token:
            print("\n⚠️  Watch mode requires driver authentication!")
            print("   Options:")
            print("   1. Provide token as second argument")
            print("   2. Login with email/password")
            
            choice = input("\nEnter choice (1/2): ").strip()
            
            if choice == '2':
                email = input("Driver email: ").strip()
                password = input("Driver password: ").strip()
                token = automation.get_driver_token_from_login(email, password)
                if not token:
                    print("❌ Failed to get token")
                    sys.exit(1)
        
        automation.watch_and_automate()
        sys.exit(0)
    
    # Normal mode - automate specific ride
    ride_id = ride_id_or_mode
    
    # If no token provided, offer to login
    if not driver_token:
        print("\n⚠️  No driver token provided.")
        print("   Some endpoints require authentication.")
        choice = input("   Login as driver? (y/n): ").strip().lower()
        
        if choice == 'y':
            email = input("Driver email: ").strip()
            password = input("Driver password: ").strip()
            token = automation.get_driver_token_from_login(email, password)
            if not token:
                print("❌ Failed to get token, continuing without auth...")
    
    success = automation.automate_ride_flow(ride_id)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
