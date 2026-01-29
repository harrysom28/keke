/**
 * Hook for managing Pusher channel subscriptions with automatic cleanup
 */

import { useEffect, useRef } from 'react';
import { pusherManager } from '@/utils/pusherManager';

interface UsePusherSubscriptionOptions {
  enabled?: boolean;
  onEvent?: (data: any) => void;
  onSubscriptionSucceeded?: () => void;
  onSubscriptionError?: (error: any) => void;
}

/**
 * Hook for subscribing to Pusher channels with automatic cleanup
 * 
 * @example
 * usePusherSubscription({
 *   channel: 'private-ride-123',
 *   eventName: 'driver.location',
 *   enabled: true,
 *   onEvent: (data) => {
 *     console.log('Driver location:', data);
 *   }
 * });
 */
export function usePusherSubscription(
  channelName: string,
  eventName: string,
  options: UsePusherSubscriptionOptions = {}
) {
  const {
    enabled = true,
    onEvent,
    onSubscriptionSucceeded,
    onSubscriptionError,
  } = options;

  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !channelName || !eventName) {
      return;
    }

    try {
      const cleanup = pusherManager.subscribe(
        channelName,
        eventName,
        (data: any) => {
          onEvent?.(data);
        }
      );

      cleanupRef.current = cleanup;
      onSubscriptionSucceeded?.();
    } catch (error) {
      console.error(`Failed to subscribe to ${channelName}:${eventName}`, error);
      onSubscriptionError?.(error);
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [channelName, eventName, enabled, onEvent, onSubscriptionSucceeded, onSubscriptionError]);
}
