/**
 * API Request Deduplication Utility
 * Prevents duplicate API calls by caching pending requests
 */

const pendingRequests = new Map<string, Promise<any>>();

export const deduplicatedApiCall = async <T,>(
  key: string, 
  apiCall: () => Promise<T>,
  cacheDuration: number = 5000
): Promise<T> => {
  // If we have a pending request for this key, return it
  if (pendingRequests.has(key)) {
    console.log(`♻️ Reusing pending request: ${key}`);
    return pendingRequests.get(key)!;
  }

  // Create new request
  const promise = apiCall().finally(() => {
    // Remove from pending after cache duration
    setTimeout(() => {
      pendingRequests.delete(key);
    }, cacheDuration);
  });

  pendingRequests.set(key, promise);
  return promise;
};

/**
 * Clear a specific request from cache
 */
export const clearApiCache = (key: string) => {
  pendingRequests.delete(key);
};

/**
 * Clear all cached requests
 */
export const clearAllApiCache = () => {
  pendingRequests.clear();
};
