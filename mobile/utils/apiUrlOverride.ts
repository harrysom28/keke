/**
 * Runtime API URL Override
 * 
 * This file provides a runtime way to override the API URL
 * in case app.json changes aren't being picked up.
 * 
 * To use: Uncomment and set the override URL below
 */

import Constants from 'expo-constants';

/**
 * RUNTIME OVERRIDE - Uncomment to force a specific API URL
 * This bypasses app.json and forces the URL at runtime
 * 
 * Useful when:
 * - app.json changes aren't being picked up
 * - Testing different environments
 * - Emergency production URL switch
 */

// Uncomment one of these to override:

// FOR LOCAL DEVELOPMENT (Android Emulator):
export const API_URL_OVERRIDE = 'http://10.0.2.2:8000'; // Android emulator uses 10.0.2.2 to reach host machine

// FOR LOCAL DEVELOPMENT (iOS Simulator / Physical Device on same network):
// export const API_URL_OVERRIDE = 'http://localhost:8000'; // For iOS Simulator, use localhost
// export const API_URL_OVERRIDE = 'http://192.168.1.170:8000'; // For physical device, use your Mac's local IP

// FOR PRODUCTION (only if absolutely necessary):
// export const API_URL_OVERRIDE = 'https://api.yourdomain.com';

// Set to null to use app.json configuration:
// export const API_URL_OVERRIDE: string | null = null;

/**
 * Get API URL with runtime override support
 */
export function getApiUrlWithOverride(): string {
  // Check for runtime override first
  if (API_URL_OVERRIDE) {
    if (__DEV__) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔧 RUNTIME API URL OVERRIDE ACTIVE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️  Override URL:', API_URL_OVERRIDE);
      console.log('   This bypasses app.json configuration!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    const overrideUrl = API_URL_OVERRIDE.endsWith('/') ? API_URL_OVERRIDE : `${API_URL_OVERRIDE}/`;
    return overrideUrl;
  }
  
  // Fall back to normal app.json configuration
  const apiUrl = 
    Constants.expoConfig?.extra?.apiUrl || 
    'http://10.0.2.2:8000'; // Default for Android emulator development
  
  if (__DEV__) {
    console.log('📋 Using app.json API URL:', apiUrl);
    console.log('   (No override set - edit utils/apiUrlOverride.ts to force URL)');
  }
  
  return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
}

