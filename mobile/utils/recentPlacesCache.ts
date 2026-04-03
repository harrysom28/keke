import apiClient from "@/utils/apiClient";
import { GET_RECENT_PLACES } from "@/constants";

export type RecentPlace = {
  _id?: string;
  name: string;
  lat: string;
  long: string;
  address?: string;
  formatted_address?: string;
  place_id?: string | null;
  location?: { latitude?: number; longitude?: number };
  latitude?: number | string;
  longitude?: number | string;
};

type CacheEntry = {
  data: RecentPlace[];
  fetchedAt: number;
  userId: string;
};

type Listener = (places: RecentPlace[]) => void;

// --- config ---
const STALE_TTL_MS = 30_000; // data older than this triggers a background refresh
const MAX_TTL_MS = 5 * 60_000; // data older than this is never served (force hard fetch)

// --- module-level state (intentionally not React state) ---
let cache: CacheEntry | null = null;
let inFlight: Promise<RecentPlace[]> | null = null;
const listeners = new Set<Listener>();

function notify(data: RecentPlace[]) {
  listeners.forEach((fn) => fn(data));
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt > MAX_TTL_MS;
}

function isStale(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt > STALE_TTL_MS;
}

async function doFetch(userId: string): Promise<RecentPlace[]> {
  if (inFlight) return inFlight;

  inFlight = apiClient
    .get(GET_RECENT_PLACES)
    .then(({ data }) => {
      const places: RecentPlace[] =
        data?.data?.recent_places ?? data?.data ?? data?.places ?? data?.data?.places ?? [];
      const safe = Array.isArray(places) ? places : [];
      cache = { data: safe, fetchedAt: Date.now(), userId };
      notify(safe);
      return safe;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Subscribe to background updates (stale-while-revalidate pushes here).
 * Returns an unsubscribe function — call it in your useEffect cleanup.
 */
export function subscribeRecentPlaces(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Main fetch function.
 *
 * - Returns cached data immediately if fresh for this user.
 * - If stale: returns cached data AND triggers a silent background refetch
 *   (subscribers get the update via `subscribeRecentPlaces`).
 * - If expired or wrong user: hard-fetches (caller awaits new data).
 * - Deduplicates concurrent calls — only one network request in flight at a time.
 */
export async function fetchRecentPlacesCached(userId: string): Promise<RecentPlace[]> {
  if (!userId) {
    // Defensive: don't ever serve cross-user cache when caller forgot to pass userId.
    cache = null;
    return [];
  }

  // Wrong user — invalidate immediately (logout / account switch)
  if (cache && cache.userId !== userId) {
    cache = null;
  }

  // Fresh cache — return instantly, no network call
  if (cache && !isStale(cache)) {
    return cache.data;
  }

  // Stale but not expired — return cached data NOW, refetch silently in background
  if (cache && isStale(cache) && !isExpired(cache)) {
    doFetch(userId).catch(() => {
      // Background fetch failed — keep serving stale data, don't surface error
    });
    return cache.data;
  }

  // Expired or no cache — caller must wait for real data
  try {
    return await doFetch(userId);
  } catch (err) {
    // If fetch fails but we have anything cached, return it rather than throwing
    if (cache) return cache.data;
    throw err;
  }
}

/**
 * Call this after the user selects / saves a new place so the next
 * open shows fresh data instead of 30s-stale results.
 */
export function invalidateRecentPlacesCache(): void {
  cache = null;
  // Don't cancel inFlight — let it finish and populate the fresh cache
}

/**
 * Call this on logout so the next user never sees stale data.
 */
export function clearRecentPlacesCache(): void {
  cache = null;
  inFlight = null;
  listeners.clear();
}
