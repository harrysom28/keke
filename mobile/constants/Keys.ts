import Constants from 'expo-constants';

// SECURITY NOTE:
// - No Google web-service keys (Places/Directions/Geocoding/Distance Matrix) exist in the mobile app.
// - All such calls MUST go through backend `/api/maps/*` proxy endpoints.
// - Android map rendering uses a DISPLAY-ONLY key injected into the native manifest at build time,
//   NOT exposed via JS constants.
export const GOOGLE_MAP_KEY: string = '';

// Google OAuth Client ID (public identifier, safe to include)
export const WEB_CLIENT_ID: string = 
  Constants.expoConfig?.extra?.googleClientId || 
  '';

// Pusher configuration - Should be fetched from backend /api/config/public
// Fallback values for development
export const PUSHER_API_CLUSTER: string = 
  Constants.expoConfig?.extra?.pusherCluster || 
  '';

export const PUSHER_API_KEY: string = 
  Constants.expoConfig?.extra?.pusherKey || 
  '';
