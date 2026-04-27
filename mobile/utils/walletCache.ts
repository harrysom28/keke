/**
 * Shared wallet response cache.
 *
 * The wallet endpoint (`GET /wallet`) is hit from several screens and a few
 * background flows. Without coordination they can pile up after the user
 * jumps around (Home -> Find Ride -> Wallet -> back). This module gives every
 * caller a single source of truth so a recent response can be reused.
 *
 * Usage:
 *   const cached = getCachedWallet();
 *   if (!cached) {
 *     const res = await apiClient.get("wallet");
 *     setCachedWallet(res);
 *   }
 *   const res = cached ?? (await apiClient.get("wallet"));
 *
 * Writers should call `invalidateWalletCache()` after any action that changes
 * the balance (top-up verification, ride start/cancel, payout, etc.).
 *
 * The cache is kept on `globalThis.__walletCache__` so older code that still
 * reads/writes `(window as any).__walletCache__` keeps working alongside it.
 */

export const WALLET_CACHE_TTL_MS = 60_000;

interface WalletCacheEntry {
  data: unknown;
  ts: number;
}

const STORAGE_KEY = "__walletCache__";

function getStore(): any {
  if (typeof globalThis !== "undefined") return globalThis as any;
  if (typeof window !== "undefined") return window as any;
  if (typeof global !== "undefined") return global as any;
  return {};
}

function readEntry(): WalletCacheEntry | null {
  const store = getStore();
  const raw = store[STORAGE_KEY];
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.ts !== "number") return null;
  return raw as WalletCacheEntry;
}

function writeEntry(entry: WalletCacheEntry | null) {
  const store = getStore();
  store[STORAGE_KEY] = entry;
}

/** Returns the cached wallet response if it's still within the TTL, else null. */
export function getCachedWallet<T = unknown>(
  ttlMs: number = WALLET_CACHE_TTL_MS
): T | null {
  const entry = readEntry();
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) {
    writeEntry(null);
    return null;
  }
  return entry.data as T;
}

/** Stores a fresh wallet response with a current timestamp. */
export function setCachedWallet<T = unknown>(data: T) {
  writeEntry({ data, ts: Date.now() });
}

/** Drops the cached wallet entry. Safe to call when nothing is cached. */
export function invalidateWalletCache() {
  writeEntry(null);
}
