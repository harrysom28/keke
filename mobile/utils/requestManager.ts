/**
 * Request Manager - Handles API request deduplication and caching
 * Prevents duplicate requests and manages request lifecycle
 */

interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
  cacheDuration: number;
}

class RequestManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private cache = new Map<string, { data: any; timestamp: number; duration: number }>();

  /**
   * Execute an API call with deduplication and caching
   * If a request with the same key is already pending, returns that promise
   * If cached data is still valid, returns cached data immediately
   */
  async execute<T>(
    key: string,
    apiCall: () => Promise<T>,
    cacheDuration: number = 5000
  ): Promise<T> {
    // Check cache first
    const cached = this.cache.get(key);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < cached.duration) {
        if (__DEV__) {
          console.log(`✅ Using cached data for: ${key}`);
        }
        return cached.data;
      } else {
        // Cache expired, remove it
        this.cache.delete(key);
      }
    }

    // Check if request is already pending
    const pending = this.pendingRequests.get(key);
    if (pending) {
      const age = Date.now() - pending.timestamp;
      if (age < pending.cacheDuration) {
        if (__DEV__) {
          console.log(`♻️ Reusing pending request: ${key}`);
        }
        return pending.promise;
      } else {
        // Pending request expired, remove it
        this.pendingRequests.delete(key);
      }
    }

    // Create new request
    const promise = apiCall()
      .then((data) => {
        // Cache the result
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          duration: cacheDuration,
        });

        // Remove from pending after a short delay
        setTimeout(() => {
          this.pendingRequests.delete(key);
        }, cacheDuration);

        return data;
      })
      .catch((error) => {
        // Remove from pending on error
        this.pendingRequests.delete(key);
        throw error;
      });

    // Store pending request
    this.pendingRequests.set(key, {
      promise,
      timestamp: Date.now(),
      cacheDuration,
    });

    return promise;
  }

  /**
   * Clear a specific request from cache and pending
   */
  clear(key: string) {
    this.pendingRequests.delete(key);
    this.cache.delete(key);
    if (__DEV__) {
      console.log(`🗑️ Cleared cache for: ${key}`);
    }
  }

  /**
   * Clear all cached requests
   */
  clearAll() {
    const pendingCount = this.pendingRequests.size;
    const cacheCount = this.cache.size;
    
    this.pendingRequests.clear();
    this.cache.clear();
    
    if (__DEV__) {
      console.log(`🧹 Cleared all caches (${pendingCount} pending, ${cacheCount} cached)`);
    }
  }

  /**
   * Get statistics about current state
   */
  getStats() {
    return {
      pending: this.pendingRequests.size,
      cached: this.cache.size,
      pendingKeys: Array.from(this.pendingRequests.keys()),
      cachedKeys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup() {
    const now = Date.now();
    
    // Clean expired cache
    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      if (age >= entry.duration) {
        this.cache.delete(key);
      }
    }

    // Clean expired pending requests
    for (const [key, entry] of this.pendingRequests.entries()) {
      const age = now - entry.timestamp;
      if (age >= entry.cacheDuration * 2) {
        this.pendingRequests.delete(key);
      }
    }
  }
}

export const requestManager = new RequestManager();

// Cleanup expired entries every 30 seconds
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    requestManager.cleanup();
  }, 30000);
}
