/**
 * Runtime API URL Override
 *
 * PHYSICAL DEVICE: On a real iPhone/Android, "localhost" / 10.0.2.2 is wrong — that is the
 * emulator loopback. Use EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL (LAN IP) or EXPO_PUBLIC_API_URL
 * (ngrok / staging). Find Mac IP: ipconfig getifaddr en0
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** True when running on a real device (localhost won't reach your computer). */
export const IS_PHYSICAL_DEVICE = Constants.isDevice;

/**
 * Physical device API URL: from app config (EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL in mobile/.env)
 * or set below. Find your computer IP: ipconfig getifaddr en0 (Mac) or hostname -I (Linux).
 */
const HARDCODED_PHYSICAL_DEVICE_API_URL: string | null = null; // e.g. 'http://192.168.1.42:8000'

/** Android emulator / iOS simulator loopback — not reachable from a physical device. */
function isEmulatorOnlyUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return true;
  const u = url.trim();
  if (!u) return true;
  try {
    const parsed = new URL(u);
    return (
      parsed.hostname === '10.0.2.2' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost'
    );
  } catch {
    return /10\.0\.2\.2|127\.0\.0\.1|localhost/.test(u);
  }
}

/**
 * Trim slashes and strip a trailing `/api` so we never build `.../api/api/...`
 * when appending `api/` for SERVER_URL / apiClient baseURL.
 *
 * If the env value omits a scheme (e.g. `*.up.railway.app`), prepend `https://` so
 * composed URLs are absolute. Otherwise axios treats `host/api/...` as a path
 * relative to baseURL and the host is doubled: `.../api/host/api/...`.
 */
function normalizeBaseUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, '');
  if (u.endsWith('/api')) {
    u = u.slice(0, -4).replace(/\/+$/, '');
  }
  if (!u || /^https?:\/\//i.test(u)) {
    return u;
  }
  if (/^localhost\b/i.test(u) || /^127\.0\.0\.1\b/.test(u)) {
    return `http://${u}`;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(u)) {
    return `http://${u}`;
  }
  return `https://${u}`;
}

function asTrimmedString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

const physicalFromEnv =
  typeof process !== 'undefined'
    ? asTrimmedString(process.env.EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL)
    : undefined;

const physicalFromConfig = Constants.expoConfig?.extra?.physicalDeviceApiUrl;

const rawPhysical =
  (typeof physicalFromConfig === 'string' ? physicalFromConfig : '') ||
  (typeof physicalFromEnv === 'string' ? physicalFromEnv : '') ||
  (typeof HARDCODED_PHYSICAL_DEVICE_API_URL === 'string' ? HARDCODED_PHYSICAL_DEVICE_API_URL : '');

/** Dedicated LAN / physical-device URL from env or hardcoded fallback; undefined if unset. */
const PHYSICAL_DEVICE_API_URL = rawPhysical.trim() || undefined;

const SIMULATOR_URL = Platform.OS === 'ios' ? 'http://localhost:8000' : 'http://10.0.2.2:8000';

const extraApiUrlRaw = asTrimmedString(Constants.expoConfig?.extra?.apiUrl);

/**
 * Dev override: simulators use loopback; physical devices use explicit LAN/ngrok URL, or any
 * non-emulator extra.apiUrl (ngrok, LAN from EXPO_PUBLIC_API_URL, etc.).
 *
 * If EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL is set, it wins first — Expo dev client can report
 * Constants.isDevice === false on a real phone, which would otherwise force 10.0.2.2.
 */
export const API_URL_OVERRIDE: string | null = (() => {
  if (PHYSICAL_DEVICE_API_URL) {
    return normalizeBaseUrl(PHYSICAL_DEVICE_API_URL);
  }
  if (!IS_PHYSICAL_DEVICE) {
    return SIMULATOR_URL;
  }
  if (extraApiUrlRaw && !isEmulatorOnlyUrl(extraApiUrlRaw)) {
    return normalizeBaseUrl(extraApiUrlRaw);
  }
  return null;
})();

/**
 * Get API URL with runtime override support.
 * Production builds: on a physical device use extra.physicalDeviceApiUrl if set,
 * otherwise use extra.apiUrl (both set from EAS env or app.config.js).
 */
export function getApiUrlWithOverride(): string {
  // Production: require explicit apiUrl (no emulator/localhost fallback)
  if (!__DEV__) {
    const physicalUrl = asTrimmedString(Constants.expoConfig?.extra?.physicalDeviceApiUrl);
    if (IS_PHYSICAL_DEVICE && physicalUrl) {
      const n = normalizeBaseUrl(physicalUrl);
      return n.endsWith('/') ? n : `${n}/`;
    }
    const apiUrlRaw = asTrimmedString(Constants.expoConfig?.extra?.apiUrl);
    const badFallback =
      !apiUrlRaw || apiUrlRaw === 'http://10.0.2.2:8000' || apiUrlRaw.startsWith('http://localhost');
    if (badFallback) {
      console.error('Production API URL not set. Set EXPO_PUBLIC_API_URL in EAS env (or extra.apiUrl in app.config.js).');
      return 'https://api-url-not-configured/';
    }
    const n = normalizeBaseUrl(apiUrlRaw);
    return n.endsWith('/') ? n : `${n}/`;
  }

  if (IS_PHYSICAL_DEVICE && !PHYSICAL_DEVICE_API_URL) {
    const extra = asTrimmedString(Constants.expoConfig?.extra?.apiUrl);
    if (!extra || isEmulatorOnlyUrl(extra)) {
      console.warn(
        '📱 Physical device: set EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL in mobile/.env to your Mac IP (e.g. http://192.168.1.34:8000), or set EXPO_PUBLIC_API_URL to ngrok / your LAN URL. Restart Metro after changing .env.'
      );
    }
  }

  if (API_URL_OVERRIDE) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔧 RUNTIME API URL OVERRIDE ACTIVE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Override URL:', API_URL_OVERRIDE);
    console.log('   This bypasses app.json configuration!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const overrideUrl = API_URL_OVERRIDE.endsWith('/') ? API_URL_OVERRIDE : `${API_URL_OVERRIDE}/`;
    return overrideUrl;
  }

  const defaultEmulator = Platform.OS === 'ios' ? 'http://localhost:8000' : 'http://10.0.2.2:8000';
  const rawFallback = Constants.expoConfig?.extra?.apiUrl;
  const apiUrlRaw =
    typeof rawFallback === 'string' && rawFallback.trim() ? rawFallback.trim() : null;
  const apiUrl = apiUrlRaw ? normalizeBaseUrl(apiUrlRaw) : defaultEmulator;
  if (IS_PHYSICAL_DEVICE && isEmulatorOnlyUrl(apiUrl)) {
    console.warn(
      '📱 Physical device cannot use emulator host (10.0.2.2 / localhost). Set EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL or EXPO_PUBLIC_API_URL in mobile/.env, then restart Metro.'
    );
  }
  console.log('📋 Using app.json API URL:', apiUrl);
  return apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
}
