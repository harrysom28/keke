import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { getApiUrlWithOverride } from './apiUrlOverride';
import AppStore from '@/store';
import { updateRefreshToken, updateToken } from '@/store/AuthSlice';
import { REFRESH_TOKEN } from '@/constants';

/**
 * Configured Axios instance for API requests
 * Handles Sucuri CloudProxy compatibility and proper headers
 */

// Get API URL (supports runtime override)
const getApiUrl = (): string => {
  return getApiUrlWithOverride();
};

const API_BASE_URL = `${getApiUrl()}api/`;

// Debug: Log the resolved API URL on import
if (__DEV__) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 API CLIENT INITIALIZATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Resolved API Base URL:', API_BASE_URL);
  console.log('📋 Full API URL (base):', getApiUrl());
  
  // Warn if hitting production
  if (API_BASE_URL.includes('yourdomain.com') || (API_BASE_URL.includes('api.') && !API_BASE_URL.includes('10.0.2.2'))) {
    console.error('⚠️  ⚠️  ⚠️  WARNING: Using PRODUCTION URL! ⚠️  ⚠️  ⚠️');
    console.error('   This will trigger Sucuri CloudProxy challenges.');
    console.error('   Expected: http://10.0.2.2:8000/api/');
    console.error('   Current:', API_BASE_URL);
    console.error('   Solution: RESTART Metro bundler and reload app!');
  } else if (API_BASE_URL.includes('10.0.2.2:8000')) {
    console.log('✅ Using LOCAL development URL (correct)');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Create axios instance with proper headers for Sucuri CloudProxy compatibility
 */
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    // User-Agent for Sucuri whitelisting (customize in production)
    'User-Agent': `KekeApp/${Constants.expoConfig?.version || '1.0.0'}`,
    // Additional headers to help bypass Sucuri CloudProxy
    'X-Request-Source': 'mobile-app',
    'X-API-Version': '1.0',
    // Cache control to prevent caching issues
    'Cache-Control': 'no-cache',
  },
  // Follow redirects normally (Laravel handles redirects correctly)
  maxRedirects: 5,
});

let refreshPromise: Promise<string | null> | null = null;

// Request interceptor for debugging and Sucuri bypass
apiClient.interceptors.request.use(
  (config) => {
    // Attach bearer token from redux (for protected endpoints)
    try {
      const { token } = AppStore.getState().Auth;
      if (token) {
        config.headers = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore
    }

    // Ensure we're using the correct API URL (check for production domain)
    const url = config.url || '';
    const fullUrl = /^https?:\/\//i.test(url) ? url : (config.baseURL || '') + url;
    if (__DEV__) {
      console.log(`📤 API Request: ${config.method?.toUpperCase()} ${fullUrl}`);
      if (config.params) {
        console.log('   Params:', config.params);
      }
      
      // Warn if hitting production domain in development
      if (fullUrl.includes('api.yourdomain.com') || fullUrl.includes('yourdomain.com')) {
        console.warn('⚠️  WARNING: Hitting production domain in development!');
        console.warn('   Expected: http://10.0.2.2:8000');
        console.warn('   Current:', config.baseURL);
        console.warn('   Solution: Reload app to pick up app.json changes');
      }
    }
    return config;
  },
  (error) => {
    if (__DEV__) {
      console.error('📤 Request Error:', error);
    }
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    // Success response logging
    if (__DEV__) {
      const url = response.config.url || 'unknown';
      console.log('📥 API Response:', response.status, url);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    const status = error?.response?.status;
    const hasToken = AppStore.getState().Auth.token;
    
    const message = error?.response?.data?.message || error?.response?.data?.error?.message || '';
    const errorMsgLower = typeof message === 'string' ? message.toLowerCase() : '';

    // Check if this is a token error that will be retried
    const isRetryableTokenError = 
      status === 401 && 
      hasToken && 
      originalRequest &&
      !originalRequest.__isRetryRequest &&
      (
        errorMsgLower.includes('token') && 
        (errorMsgLower.includes('expired') || 
         errorMsgLower.includes('invalid') || 
         errorMsgLower.includes('unauthorized') ||
         errorMsgLower.includes('authentication'))
      );

    // Define which 401s are expected (don't log these)
    const isExpected401 = 
      status === 401 && 
      (!hasToken || 
       originalRequest?.url?.includes('auth/user/me') || 
       originalRequest?.url?.includes('recent-places') ||
       originalRequest?.url?.includes('booking/active-ride') ||
       originalRequest?.url?.includes('maps/places/autocomplete') ||
       originalRequest?.url?.includes('schedule/latest/booking') ||
       originalRequest?.url?.includes('locations/drivers-passengers'));
    
    // Define which errors should be silently handled
    const isExpectedError = 
      isExpected401 || 
      isRetryableTokenError || // Don't log token errors that will be retried
      status === 429; // Rate limits are expected, handled gracefully
    
    // Only log unexpected errors in development
    if (__DEV__ && !isExpectedError) {
      console.error('📥 Response Error:', error.response?.status, error.config?.url);
      
      // Check if it's a Sucuri redirect (307 or HTML response)
      if (error.response?.status === 307 || 
          (error.response?.headers?.['content-type']?.includes('text/html') && 
           typeof error.response?.data === 'string' && error.response.data.includes('sucuri'))) {
        console.error('🚨 SUCURI FIREWALL DETECTED - API request blocked');
        console.error('   This usually means:');
        console.error('   1. Your IP is flagged by security');
        console.error('   2. Request pattern looks suspicious');
        console.error('   3. Rate limiting by firewall');
        console.error('   Current API URL:', API_BASE_URL);
        console.error('   Solution: Check app.json "extra.apiUrl" and reload app');
      }
    }
    
    // Handle 429 rate limiting gracefully
    if (status === 429) {
      if (__DEV__) {
        console.warn('⚠️  Rate limit (429) - request will be queued or cached');
      }
      // Don't retry, just reject - let the calling code handle it
      return Promise.reject(error);
    }

    // Auto-refresh access token once when it expires, then retry original request.
    // Check for 401 with token-related errors (expired, invalid, etc.)
    if (isRetryableTokenError) {
      try {
        originalRequest.__isRetryRequest = true;

        if (__DEV__) {
          console.log('🔄 Token expired, attempting refresh...');
        }

        if (!refreshPromise) {
          refreshPromise = (async () => {
            try {
              const { refreshToken } = AppStore.getState().Auth;
              if (!refreshToken) {
                if (__DEV__) {
                  console.warn('⚠️  No refresh token available, user needs to re-login');
                }
                // No refresh token persisted (e.g. old session). Force re-login.
                AppStore.dispatch(updateToken(null));
                AppStore.dispatch(updateRefreshToken(null));
                return null;
              }

              // REFRESH_TOKEN already includes full URL from constants
              const resp = await axios.post(REFRESH_TOKEN, { refresh_token: refreshToken }, {
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              });

              const newToken = resp?.data?.authorisation?.token || resp?.data?.data?.authorisation?.token || null;
              const newRefreshToken = resp?.data?.authorisation?.refresh_token || resp?.data?.data?.authorisation?.refresh_token;

              if (newToken) {
                AppStore.dispatch(updateToken(newToken));
                if (newRefreshToken) {
                  AppStore.dispatch(updateRefreshToken(newRefreshToken));
                }
                if (__DEV__) {
                  console.log('✅ Token refreshed successfully');
                }
                return newToken;
              } else {
                if (__DEV__) {
                  console.error('❌ Token refresh failed: No token in response');
                }
                return null;
              }
            } catch (refreshError: any) {
              if (__DEV__) {
                console.error('❌ Token refresh error:', refreshError?.response?.data || refreshError?.message);
              }
              
              // If refresh token is also expired/invalid, clear auth state
              const refreshErrorMsg = refreshError?.response?.data?.message || refreshError?.response?.data?.error?.message || '';
              if (refreshErrorMsg.toLowerCase().includes('expired') || 
                  refreshErrorMsg.toLowerCase().includes('invalid') ||
                  refreshError?.response?.status === 401) {
                if (__DEV__) {
                  console.warn('⚠️  Refresh token expired, user needs to re-login');
                }
                AppStore.dispatch(updateToken(null));
                AppStore.dispatch(updateRefreshToken(null));
              }
              return null;
            }
          })().finally(() => {
            refreshPromise = null;
          });
        }

        const newToken = await refreshPromise;
        if (newToken) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          if (__DEV__) {
            console.log('🔄 Retrying original request with new token');
          }
          return apiClient(originalRequest);
        } else {
          // Refresh failed, reject with a clearer error
          if (__DEV__) {
            console.error('❌ Token refresh failed, rejecting request');
          }
          const authError = new Error('Authentication failed. Please log in again.');
          (authError as any).isAuthError = true;
          (authError as any).status = 401;
          return Promise.reject(authError);
        }
      } catch (refreshErr) {
        // If refresh itself fails, reject with auth error
        if (__DEV__) {
          console.error('❌ Token refresh exception:', refreshErr);
        }
        const authError = new Error('Authentication failed. Please log in again.');
        (authError as any).isAuthError = true;
        (authError as any).status = 401;
        return Promise.reject(authError);
      }
    }

    // Transform error to ensure it always has a string message
    // This prevents "Objects are not valid as a React child" errors
    const safeErrorMessage = 
      error?.response?.data?.message || 
      error?.response?.data?.error?.message ||
      error?.message || 
      'An error occurred';
    
    // Create a new error with a safe string message
    const safeError = new Error(typeof safeErrorMessage === 'string' ? safeErrorMessage : String(safeErrorMessage));
    
    // Preserve important error properties
    (safeError as any).response = error.response;
    (safeError as any).config = error.config;
    (safeError as any).status = error?.response?.status || error?.status;
    (safeError as any).isAuthError = error?.isAuthError || false;
    
    return Promise.reject(safeError);
  }
);

export default apiClient;

