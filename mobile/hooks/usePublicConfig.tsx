import { useState, useEffect } from 'react';
import apiClient from '@/utils/apiClient';
import { PUSHER_API_KEY, PUSHER_API_CLUSTER, WEB_CLIENT_ID } from '@/constants/Keys';

interface PublicConfig {
  pusher: {
    key: string;
    cluster: string;
  };
  google: {
    client_id: string;
  };
}

/**
 * Hook to fetch public configuration from backend API
 * Falls back to app.json values if backend is unavailable
 */
export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig>({
    pusher: {
      key: PUSHER_API_KEY, // Fallback from app.json
      cluster: PUSHER_API_CLUSTER, // Fallback from app.json
    },
    google: {
      client_id: WEB_CLIENT_ID, // Fallback from app.json
    },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('config/public');
        
        // ResponseTrait returns status: true (boolean), not 'success'
        if (response.data.status === true && response.data.data) {
          setConfig({
            pusher: {
              key: response.data.data.pusher?.key || PUSHER_API_KEY,
              cluster: response.data.data.pusher?.cluster || PUSHER_API_CLUSTER,
            },
            google: {
              client_id: response.data.data.google?.client_id || WEB_CLIENT_ID,
            },
          });
          setError(null);
        }
      } catch (err: any) {
        console.warn('Failed to fetch public config from backend, using fallback values:', err?.message);
        // Use fallback values from app.json - don't set error as this is acceptable
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
}

