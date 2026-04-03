import { cache } from '../config/redis.js';
import AdminSettings from '../models/AdminSettings.js';

export const ADMIN_SETTINGS_REDIS_KEY = 'admin:settings:default';
const CACHE_TTL_SEC = 300;

/**
 * Full default admin settings document (lean). Cached in Redis when available.
 */
export async function getAdminSettings() {
  const cached = await cache.get(ADMIN_SETTINGS_REDIS_KEY);
  if (cached) return cached;

  const settings = await AdminSettings.findOne({ key: 'default' }).lean();
  if (settings) {
    await cache.set(ADMIN_SETTINGS_REDIS_KEY, settings, CACHE_TTL_SEC);
  }
  return settings;
}

export async function invalidateAdminSettingsCache() {
  await cache.del(ADMIN_SETTINGS_REDIS_KEY);
}
