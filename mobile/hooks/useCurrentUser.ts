/**
 * Hook for fetching current user data with automatic caching
 */

import { useApiCall } from './useApiCall';
import apiClient from '@/utils/apiClient';

/**
 * Hook for fetching current user data with automatic caching
 * Caches for 30 seconds to prevent excessive API calls
 * 
 * @example
 * const { data: user, loading, error, refetch } = useCurrentUser();
 */
export function useCurrentUser(enabled: boolean = true) {
  return useApiCall(
    async () => {
      const response = await apiClient.get('/auth/user/me');
      return response.data;
    },
    [],
    {
      enabled,
      cacheKey: 'current-user',
      cacheDuration: 30000, // Cache for 30 seconds
      retry: 2,
      retryDelay: 2000,
      onError: (error) => {
        // Only log unexpected errors
        if (error?.status !== 401 && error?.status !== 429) {
          console.error('Error fetching current user:', error?.message);
        }
      },
    }
  );
}

/**
 * Hook for fetching current user without automatic fetching
 * Useful when you want to control when the fetch happens
 */
export function useCurrentUserLazy() {
  const { data, loading, error, refetch, clearCache } = useCurrentUser(false);
  
  return {
    user: data,
    loading,
    error,
    fetchUser: refetch,
    clearUserCache: clearCache,
  };
}
