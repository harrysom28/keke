/**
 * Hook for making API calls with automatic deduplication and caching
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { requestManager } from '@/utils/requestManager';

interface UseApiCallOptions<T> {
  enabled?: boolean;
  cacheKey?: string;
  cacheDuration?: number;
  onSuccess?: (data: T) => void;
  onError?: (error: any) => void;
  retry?: number;
  retryDelay?: number;
}

interface UseApiCallReturn<T> {
  data: T | null;
  loading: boolean;
  error: any;
  refetch: () => void;
  clearCache: () => void;
}

/**
 * Hook for making API calls with automatic deduplication and caching
 * 
 * @example
 * const { data, loading, error, refetch } = useApiCall(
 *   () => apiClient.get('/users'),
 *   [],
 *   { cacheKey: 'users-list', cacheDuration: 30000 }
 * );
 */
export function useApiCall<T = any>(
  apiCall: () => Promise<T>,
  dependencies: any[] = [],
  options: UseApiCallOptions<T> = {}
): UseApiCallReturn<T> {
  const {
    enabled = true,
    cacheKey,
    cacheDuration = 5000,
    onSuccess,
    onError,
    retry = 0,
    retryDelay = 1000,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  
  const isMountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const execute = useCallback(async (isRetry = false) => {
    if (!enabled) return;

    if (!isRetry) {
      setLoading(true);
      setError(null);
      retryCountRef.current = 0;
    }

    try {
      let result: T;
      
      if (cacheKey) {
        // Use request manager for deduplication
        result = await requestManager.execute(cacheKey, apiCall, cacheDuration);
      } else {
        result = await apiCall();
      }

      if (isMountedRef.current) {
        setData(result);
        setLoading(false);
        onSuccess?.(result);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      // Handle rate limiting gracefully
      if (err?.status === 429 || err?.response?.status === 429) {
        console.log('⏳ Rate limited, will retry...');
        
        // Don't count rate limits as retries
        if (retryCountRef.current < retry) {
          timeoutRef.current = setTimeout(() => {
            execute(true);
          }, retryDelay * (retryCountRef.current + 1));
          retryCountRef.current++;
          return;
        }
      }

      setError(err);
      setLoading(false);
      onError?.(err);

      // Retry logic for other errors
      if (!isRetry && retryCountRef.current < retry) {
        retryCountRef.current++;
        timeoutRef.current = setTimeout(() => {
          execute(true);
        }, retryDelay * retryCountRef.current);
      }
    }
  }, [enabled, cacheKey, cacheDuration, retry, retryDelay, ...dependencies]);

  useEffect(() => {
    execute();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [execute]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    if (cacheKey) {
      requestManager.clear(cacheKey);
    }
    retryCountRef.current = 0;
    execute();
  }, [cacheKey, execute]);

  const clearCache = useCallback(() => {
    if (cacheKey) {
      requestManager.clear(cacheKey);
    }
  }, [cacheKey]);

  return { data, loading, error, refetch, clearCache };
}
