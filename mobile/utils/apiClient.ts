import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { getUniqueId } from 'react-native-device-info';
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
 * Create axios instance with proper headers for Sucuri CloudProxy and ngrok compatibility
 */
const isNgrokUrl = API_BASE_URL.includes('ngrok');
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
    // Skip ngrok free-tier browser warning so API requests get through (not the HTML interstitial)
    ...(isNgrokUrl ? { 'ngrok-skip-browser-warning': 'true' } : {}),
  },
  // Follow redirects normally (Laravel handles redirects correctly)
  maxRedirects: 5,
});

let refreshPromise: Promise<string | null> | null = null;

/** Normalize request URL for logs when callers pass absolute https URLs instead of relative paths. */
function stripApiUrlForLog(url: string | undefined): string {
  if (!url || typeof url !== 'string') return 'unknown';
  if (/^https?:\/\//i.test(url)) {
    try {
      const u = new URL(url);
      let path = u.pathname + u.search;
      if (path.startsWith('/api/')) path = path.slice(5);
      else if (path.startsWith('/api')) path = path.slice(4).replace(/^\//, '') || '';
      return path || url;
    } catch {
      return url;
    }
  }
  return url;
}

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

    // FormData: let the client set Content-Type (multipart/form-data with boundary)
    // so file uploads (e.g. user/profile/upload-image) work correctly
    if (config.data && typeof FormData !== 'undefined' && config.data instanceof FormData) {
      const headers = config.headers as Record<string, unknown>;
      if (headers && 'Content-Type' in headers) {
        delete headers['Content-Type'];
      }
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
      const url = stripApiUrlForLog(response.config.url);
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
       originalRequest?.url?.includes('locations/drivers-passengers') ||
       originalRequest?.url?.includes('notifications/unread-count'));
    
    // 404 on driver/availability = driver profile not found (user needs to complete registration)
    const isDriverProfileNotFound =
      status === 404 && originalRequest?.url?.includes('driver/availability');
    
    // Public config endpoint can be absent on some environments; app falls back to app.json
    const isPublicConfigNotFound =
      status === 404 && originalRequest?.url?.includes('config/public');

    // Define which errors should be silently handled
    const isExpectedError =
      isExpected401 ||
      isRetryableTokenError || // Don't log token errors that will be retried
      status === 429 || // Rate limits are expected, handled gracefully
      isDriverProfileNotFound ||
      isPublicConfigNotFound;

    // Only log unexpected errors in development
    if (__DEV__ && !isExpectedError) {
      const url = error.config?.url ?? 'unknown';
      const status = error.response?.status;

      // No response = network error (server unreachable, connection refused, etc.)
      if (error.response == null) {
        const now = Date.now();
        const throttleMs = 10000;
        const lastLog = (apiClient as any).__lastNetworkErrorLog ?? 0;
        const code = (error as any).code;
        const msg = error.message || 'Network Error';
        const isTimeout = code === 'ECONNABORTED';
        const isErrNetwork =
          code === 'ERR_NETWORK' ||
          String(msg).includes('ERR_NETWORK') ||
          String(msg).toLowerCase() === 'network error';
        const isNonCritical =
          typeof url === 'string' &&
          (url.includes('nearby-count') ||
            url.includes('special/offers') ||
            url.includes('notifications/unread-count') ||
            // Driver dashboard polls
            url.includes('driver/earnings') ||
            url.includes('booking/active-ride') ||
            url.includes('schedule/latest/booking') ||
            url.includes('locations/drivers-passengers') ||
            url.includes('auth/user/me'));

        if (isNonCritical && (isTimeout || isErrNetwork)) {
          if (now - lastLog >= throttleMs) {
            (apiClient as any).__lastNetworkErrorLog = now;
            if (__DEV__) {
              console.warn(
                `📥 ${isTimeout ? 'Timeout' : 'Network'} – ${url} (non-critical; tunnel or backend may be unreachable)`
              );
            }
          }
        } else if (now - lastLog >= throttleMs) {
          (apiClient as any).__lastNetworkErrorLog = now;
          const ngrokLines = isNgrokUrl
            ? [
                '📡 Using ngrok: no HTTP response usually means the tunnel is down, Mac slept, ngrok agent stopped, or forward port ≠ backend port.',
                '→ Keep `ngrok http 8000` running; `Forwarding` URL must match mobile/.env (restart Metro after edits).',
                '→ iOS Simulator: EXPO_PUBLIC_API_URL=http://127.0.0.1:8000 avoids ngrok entirely.',
              ]
            : [
                '→ Backend may be stopped or unreachable.',
                '1. Is the API server running? (npm run dev in backend/)',
                '2. URL: Simulator http://localhost:8000  Android http://10.0.2.2:8000',
                '3. Physical device? Set PHYSICAL_DEVICE_API_URL to your computer IP',
              ];
          const lines = [
            `📥 Network Error: ${msg}${code ? ` (${code})` : ''} – ${url}`,
            ...ngrokLines,
            `Current base URL: ${API_BASE_URL}`,
          ];
          if (isNgrokUrl && __DEV__) {
            console.warn(lines.join('\n'));
          } else {
            // In RN dev, console.error triggers a red screen. Network-down is expected while developing.
            console.warn(lines.join('\n'));
          }
        }
      } else {
        const baseFromConfig =
          typeof error.config?.baseURL === 'string' ? error.config.baseURL : API_BASE_URL;
        const rawData = error.response?.data;
        const dataStr =
          typeof rawData === 'string'
            ? rawData
            : rawData != null
              ? JSON.stringify(rawData)
              : '';
        const requestUsesNgrok =
          isNgrokUrl ||
          baseFromConfig.includes('ngrok') ||
          (typeof error.config?.url === 'string' && error.config.url.includes('ngrok'));
        const ngrokBodySuggestsTunnelIssue =
          dataStr.includes('ERR_NGROK') ||
          dataStr.includes('is offline') ||
          (dataStr.includes('Tunnel') && dataStr.includes('not found'));

        // 400 on driver/availability = expected when driver not yet verified (show as warn, not error)
        if (status === 400 && typeof url === 'string' && url.includes('driver/availability')) {
          if (__DEV__) console.warn('📥 Response 400 driver/availability (driver may need to be verified to go online)');
        } else if (status === 404 && typeof url === 'string' && url.includes('config/public')) {
          // Not a fatal error; hook falls back to bundled config
          if (__DEV__) console.warn('📥 Response 404 config/public (using fallback public config)');
        } else if (
          status === 409 &&
          typeof url === 'string' &&
          url.includes('booking/confirm-ride') &&
          (dataStr.toLowerCase().includes('active ride') ||
            dataStr.toLowerCase().includes('already have an active ride'))
        ) {
          // Expected path: user already has an active ride. Do NOT log as error (it triggers redbox).
          if (__DEV__) console.warn('📥 Response 409 booking/confirm-ride (active ride already exists)');
        } else if (
          status === 404 &&
          requestUsesNgrok &&
          typeof url === 'string' &&
          !url.includes('config/public')
        ) {
          // Relative `url` never contains "ngrok"; use baseURL / API_BASE_URL (fixed above).
          if (__DEV__) {
            const detail = ngrokBodySuggestsTunnelIssue
              ? ' (ngrok error page in response body)'
              : '';
            console.warn(
              `📡 HTTP 404 via ngrok${detail} — the app is not reaching your Express API. Typical causes: ngrok not running, tunnel URL changed, or ngrok points at the wrong port.\n` +
                '→ Run: ngrok http 8000 (must match backend port; your server log shows which port).\n' +
                '→ Copy the current https://….ngrok-free.app into mobile/.env as EXPO_PUBLIC_API_URL and EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL (origin only, no /api). Restart Metro.\n' +
                '→ iOS Simulator without ngrok: EXPO_PUBLIC_API_URL=http://127.0.0.1:8000\n' +
                `   Base: ${baseFromConfig} | Path: ${url}`
            );
          }
        } else if (status === 404 && __DEV__) {
          console.warn('📥 HTTP 404:', stripApiUrlForLog(url));
        } else {
          console.error('📥 Response Error:', status, stripApiUrlForLog(url));
          if (__DEV__ && typeof status === 'number' && status >= 400 && status < 500 && dataStr) {
            const clipped = dataStr.length > 1200 ? `${dataStr.slice(0, 1200)}…` : dataStr;
            console.error('   Response body:', clipped);
          }
        }
      }

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

              const deviceId = await getUniqueId().catch(() => 'legacy');

              const resp = await axios.post(
                REFRESH_TOKEN,
                { refresh_token: refreshToken, device_id: deviceId },
                {
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                  },
                }
              );

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

