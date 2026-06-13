import { useState, useEffect } from 'react';
import apiClient from '@/utils/apiClient';
import { PUSHER_API_KEY, PUSHER_API_CLUSTER, WEB_CLIENT_ID } from '@/constants/Keys';
import {
  DEFAULT_PUBLIC_PAYMENT_METHODS,
  type PublicPaymentMethodsConfig,
} from '@/utils/paymentMethods';

interface PublicConfig {
  pusher: {
    key: string;
    cluster: string;
  };
  google: {
    client_id: string;
  };
  paymentMethods: PublicPaymentMethodsConfig;
}

/**
 * Hook to fetch public configuration from backend API
 * Falls back to app.json values if backend is unavailable
 */
export function usePublicConfig() {
  const [config, setConfig] = useState<PublicConfig>({
    pusher: {
      key: PUSHER_API_KEY,
      cluster: PUSHER_API_CLUSTER,
    },
    google: {
      client_id: WEB_CLIENT_ID,
    },
    paymentMethods: DEFAULT_PUBLIC_PAYMENT_METHODS,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('config/public');

        if (response.data.status === true && response.data.data) {
          const pm = response.data.data.paymentMethods;
          setConfig({
            pusher: {
              key: response.data.data.pusher?.key || PUSHER_API_KEY,
              cluster: response.data.data.pusher?.cluster || PUSHER_API_CLUSTER,
            },
            google: {
              client_id: response.data.data.google?.client_id || WEB_CLIENT_ID,
            },
            paymentMethods: {
              enabled: Array.isArray(pm?.enabled) && pm.enabled.length
                ? pm.enabled
                : DEFAULT_PUBLIC_PAYMENT_METHODS.enabled,
              default: pm?.default || DEFAULT_PUBLIC_PAYMENT_METHODS.default,
              labels: {
                ...DEFAULT_PUBLIC_PAYMENT_METHODS.labels,
                ...(pm?.labels || {}),
              },
            },
          });
          setError(null);
        }
      } catch (err: any) {
        console.warn('Failed to fetch public config from backend, using fallback values:', err?.message);
        setError(null);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading, error };
}
