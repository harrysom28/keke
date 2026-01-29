import {
  PusherEvent,
  PusherMember,
} from "@pusher/pusher-websocket-react-native";
import { useCallback, useContext, useEffect, useRef } from "react";

import { AppContext } from "@/app/context";
import logger from "@/utils/logger";

// Track active channels to prevent duplicate subscriptions
const activeChannels = new Set<string>();

interface Props {
  channel: string;
  visible?: boolean;
  onSubscriptionSucceeded?: () => void;
  onSubscriptionError?: (error: string) => void;
  onMemberAdded?: (member: PusherMember) => void;
  onMemberRemoved?: (member: PusherMember) => void;
  onEvent: (event: PusherEvent) => void;
}

export default function usePusherChannel({
  channel,
  visible = true,
  onSubscriptionSucceeded,
  onSubscriptionError,
  onMemberAdded,
  onMemberRemoved,
  onEvent,
}: Props): { unsubscribe: () => Promise<void> } {
  const { pusher } = useContext(AppContext);
  const isSubscribedRef = useRef(false);
  const isUnmountingRef = useRef(false);
  
  // Use refs for callbacks to prevent re-subscriptions when callbacks change
  const callbacksRef = useRef({
    onSubscriptionSucceeded,
    onSubscriptionError,
    onMemberAdded,
    onMemberRemoved,
    onEvent,
  });

  // Update callbacks ref when they change (without causing re-subscription)
  useEffect(() => {
    callbacksRef.current = {
      onSubscriptionSucceeded,
      onSubscriptionError,
      onMemberAdded,
      onMemberRemoved,
      onEvent,
    };
  }, [onSubscriptionSucceeded, onSubscriptionError, onMemberAdded, onMemberRemoved, onEvent]);

  const unsubscribe = useCallback(async () => {
    if (isUnmountingRef.current) return; // Prevent cleanup during unmount
    
    if (!activeChannels.has(channel) || !isSubscribedRef.current) {
      return; // Already unsubscribed
    }

    logger.debug(`Unsubscribing from Pusher channel: ${channel}`);
    
    try {
      await pusher.unsubscribe({
        channelName: channel,
      });
      activeChannels.delete(channel);
      isSubscribedRef.current = false;
      logger.debug(`Successfully unsubscribed from Pusher channel: ${channel}`);
    } catch (error) {
      logger.error("Error during Pusher unsubscription", error, { channel });
      // Still remove from tracking even if unsubscribe fails
      activeChannels.delete(channel);
      isSubscribedRef.current = false;
    }
  }, [channel, pusher]);

  useEffect(() => {
    // Prevent subscription if component is unmounting
    if (isUnmountingRef.current) return;

    // Only subscribe if visible and not already subscribed
    if (visible && !activeChannels.has(channel) && !isSubscribedRef.current) {
      logger.debug(`Attempting to subscribe to Pusher channel: ${channel}`);

      isSubscribedRef.current = true;
      activeChannels.add(channel);

      pusher
        .subscribe({
          channelName: channel,
          onSubscriptionSucceeded: () => {
            if (isUnmountingRef.current) return;
            logger.debug(`Successfully subscribed to Pusher channel: ${channel}`);
            if (callbacksRef.current.onSubscriptionSucceeded) {
              callbacksRef.current.onSubscriptionSucceeded();
            }
          },
          onSubscriptionError: (error: string) => {
            logger.warn("Pusher subscription error", { channel, error });
            // Remove from active channels on error
            activeChannels.delete(channel);
            isSubscribedRef.current = false;
            if (callbacksRef.current.onSubscriptionError) {
              callbacksRef.current.onSubscriptionError(error);
            }
          },
          onMemberAdded: (member: PusherMember) => {
            if (isUnmountingRef.current) return;
            logger.debug(`Member added to channel: ${channel}`, { member });
            if (callbacksRef.current.onMemberAdded) {
              callbacksRef.current.onMemberAdded(member);
            }
          },
          onMemberRemoved: (member: PusherMember) => {
            if (isUnmountingRef.current) return;
            logger.debug(`Member removed from channel: ${channel}`, { member });
            if (callbacksRef.current.onMemberRemoved) {
              callbacksRef.current.onMemberRemoved(member);
            }
          },
          onEvent: (event: PusherEvent) => {
            if (isUnmountingRef.current) return;
            callbacksRef.current.onEvent(event);
          },
        })
        .catch((error: any) => {
          logger.error("Error during Pusher subscription", error, { channel });
          activeChannels.delete(channel);
          isSubscribedRef.current = false;
        });
    } else if (!visible && isSubscribedRef.current) {
      // Unsubscribe if not visible
      unsubscribe();
    }

    // Cleanup on unmount or when visible/channel changes
    return () => {
      isUnmountingRef.current = true;
      if (isSubscribedRef.current || activeChannels.has(channel)) {
        unsubscribe();
      }
    };
  }, [visible, channel, pusher, unsubscribe]);

  return { unsubscribe };
}
