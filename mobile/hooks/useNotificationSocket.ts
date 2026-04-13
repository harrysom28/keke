import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiUrlWithOverride } from "@/utils/apiUrlOverride";
import AppStore from "@/store";
import { addIncomingNotification, setLatestNotification } from "@/store/AppSlice";

/**
 * Listens for server Socket.io `NEW_NOTIFICATION` on the authenticated user room.
 * Keeps Redux inbox + unread in sync with Pusher/FCM.
 */
export function useNotificationSocket(
  userId: string | undefined,
  accessToken: string | undefined
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId || !accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const base = getApiUrlWithOverride().replace(/\/+$/, "");
    const socket = io(base, {
      transports: ["websocket"],
      path: "/socket.io/",
      autoConnect: true,
    });

    socket.on("connect", () => {
      socket.emit("authenticate", { token: accessToken });
    });

    socket.on("NEW_NOTIFICATION", (payload: Record<string, unknown>) => {
      if (!payload || typeof payload !== "object") return;
      const p = payload as {
        id?: string;
        notification_id?: string;
        title?: string;
        message?: string;
        type?: string;
        priority?: string;
        screen?: string;
        action_type?: string;
        action_payload?: unknown;
        ride_id?: string | null;
        duration_ms?: number;
        image_url?: string | null;
        delivered_at?: string;
        event_key?: string;
      };
      const nid = String(p.notification_id || p.id || "");
      if (!nid) return;

      AppStore.dispatch(
        addIncomingNotification({
          id: p.id,
          notification_id: nid,
          title: p.title || "",
          message: p.message || "",
          type: p.event_key || p.type || "general",
          priority: p.priority,
          screen: p.screen,
          action_type: p.action_type,
          action_payload: p.action_payload,
          ride_id: p.ride_id ?? undefined,
          duration_ms: p.duration_ms,
          image_url: p.image_url ?? null,
          delivered_at: p.delivered_at,
          event_key: p.event_key,
          created_at: p.delivered_at || new Date().toISOString(),
          related_ride_id: p.ride_id ? String(p.ride_id) : null,
        })
      );
      AppStore.dispatch(
        setLatestNotification({
          id: p.id,
          notification_id: nid,
          title: p.title || "",
          message: p.message || "",
          type: p.event_key || p.type || "general",
          priority: p.priority,
          screen: p.screen,
          action_type: p.action_type,
          action_payload: p.action_payload,
          ride_id: p.ride_id ?? null,
          duration_ms: p.duration_ms,
          image_url: p.image_url ?? null,
          delivered_at: p.delivered_at,
          event_key: p.event_key,
        })
      );
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, accessToken]);
}
