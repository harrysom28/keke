import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiUrlWithOverride } from "@/utils/apiUrlOverride";
import notificationManager, {
  type NotificationPayload,
} from "@/services/notificationManager";

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

    socket.on("NEW_NOTIFICATION", (raw: Record<string, unknown>) => {
      if (!raw || typeof raw !== "object") return;
      const p = raw as {
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

      const mapped: NotificationPayload = {
        id: String(p.id || nid),
        notification_id: nid,
        title: String(p.title || ""),
        message: String(p.message || ""),
        type:
          p.type === "push" ||
          p.type === "alert" ||
          p.type === "banner" ||
          p.type === "inbox"
            ? p.type
            : "push",
        priority:
          p.priority === "critical" ||
          p.priority === "high" ||
          p.priority === "normal" ||
          p.priority === "low"
            ? p.priority
            : "normal",
        screen: p.screen ? String(p.screen) : undefined,
        action_type:
          p.action_type === "navigate" ||
          p.action_type === "open_url" ||
          p.action_type === "call_api"
            ? p.action_type
            : "none",
        action_payload: p.action_payload,
        ride_id: p.ride_id ? String(p.ride_id) : undefined,
        duration_ms:
          p.duration_ms != null ? Number(p.duration_ms) : undefined,
        image_url: p.image_url ? String(p.image_url) : undefined,
        delivered_at: p.delivered_at
          ? String(p.delivered_at)
          : new Date().toISOString(),
        event_key: p.event_key ? String(p.event_key) : undefined,
      };

      notificationManager.handle(mapped);
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [userId, accessToken]);
}
