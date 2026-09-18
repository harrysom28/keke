import AppStore from "@/store";
import { setAppData } from "@/store/AppSlice";
import apiClient from "@/utils/apiClient";
import logger from "@/utils/logger";
import type { NotificationRequest } from "expo-notifications";
import messaging from "@react-native-firebase/messaging";
import { Pusher, PusherEvent } from "@pusher/pusher-websocket-react-native";
import { router } from "expo-router";
import { Platform, Vibration } from "react-native";
import { registerForPushNotifications } from "@/utils/registerPushToken";
import { requestDriverOfferRefresh } from "@/utils/driverRideOffer";
import { markInitialDriverRouteHandled } from "@/utils/driverInitialRoute";

export type NotificationPayload = {
  id: string;
  notification_id: string;
  title: string;
  message: string;
  type: "push" | "alert" | "banner" | "inbox";
  priority: "critical" | "high" | "normal" | "low";
  screen?: string;
  action_type?: "none" | "navigate" | "open_url" | "call_api";
  action_payload?: any;
  ride_id?: string;
  duration_ms?: number;
  image_url?: string;
  delivered_at?: string;
  event_key?: string;
};

export type NotificationHandler = (payload: NotificationPayload) => void;

let alertHandler: NotificationHandler | null = null;
let bannerHandler: NotificationHandler | null = null;
let inboxHandler: NotificationHandler | null = null;

// Some backends (or notification bridges) can occasionally deliver the same event
// multiple times (e.g. reconnect/retry behavior). We defensively de-dupe in-app
// handling to avoid spamming banners/toasts and duplicating inbox items.
const RECENT_DEDUPE_WINDOW_MS = 55_000;
const recentNotificationKeys = new Map<string, number>();

/** Prefer semantic keys so FCM onMessage + Expo received listener dedupe the same push. */
const buildStableNotificationKey = (payload: NotificationPayload): string => {
  const semantic = [
    payload.event_key || "",
    payload.notification_id || "",
    payload.ride_id || "",
    payload.title || "",
    payload.message || "",
  ]
    .map((v) => String(v).trim())
    .join("|");
  if (semantic.replace(/\|/g, "").length > 0) {
    return semantic;
  }
  return String(payload.notification_id || payload.id || "").trim();
};

let foregroundUnsubscribe: (() => void) | null = null;
let backgroundOpenUnsubscribe: (() => void) | null = null;
let firebaseInitialized = false;
let pusherChannelName: string | null = null;
let registerFcmTokenInFlight: Promise<void> | null = null;

const pusher = Pusher.getInstance();

const parseActionPayload = (value: unknown) => {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const toPriority = (value?: string): NotificationPayload["priority"] => {
  if (
    value === "critical" ||
    value === "high" ||
    value === "normal" ||
    value === "low"
  ) {
    return value;
  }
  return "normal";
};

const toType = (value?: string): NotificationPayload["type"] => {
  if (
    value === "push" ||
    value === "alert" ||
    value === "banner" ||
    value === "inbox"
  ) {
    return value;
  }
  return "push";
};

const getRoleHomePath = () => {
  const role = AppStore.getState()?.Auth?.user?.profile?.role;
  return role === "driver"
    ? "/(driver)/(tabs)/(dashboard)/home"
    : "/(app)/(tabs)/(home)/home";
};

const getWalletPath = () => {
  const role = AppStore.getState()?.Auth?.user?.profile?.role;
  return role === "driver"
    ? "/(driver)/(tabs)/(profile)/wallet"
    : "/(app)/(tabs)/(profile)/wallet";
};

const navigateToRoute = (path: string, rideId?: string) => {
  if (rideId) {
    router.push({ pathname: path as any, params: { rideId } });
    return;
  }
  router.push(path as any);
};

export const registerAlertHandler = (handler: NotificationHandler): void => {
  alertHandler = handler;
};

export const registerBannerHandler = (handler: NotificationHandler): void => {
  bannerHandler = handler;
};

export const registerInboxHandler = (handler: NotificationHandler): void => {
  inboxHandler = handler;
};

export const handle = (payload: NotificationPayload): void => {
  try {
    const stableKey = buildStableNotificationKey(payload);
    if (!stableKey) {
      return;
    }

    const now = Date.now();
    // prune stale keys cheaply
    for (const [k, ts] of recentNotificationKeys.entries()) {
      if (now - ts > RECENT_DEDUPE_WINDOW_MS) {
        recentNotificationKeys.delete(k);
      }
    }
    const last = recentNotificationKeys.get(stableKey);
    if (last && now - last < RECENT_DEDUPE_WINDOW_MS) {
      logger.debug("Notification deduped", { stableKey });
      return;
    }
    recentNotificationKeys.set(stableKey, now);
  } catch {
    // Never block notification delivery due to dedupe errors.
  }

  // Driver ride offers: Pusher `ride-request` opens the offer sheet — skip alert/toast from FCM.
  const role = AppStore.getState()?.Auth?.user?.profile?.role;
  if (
    role === "driver" &&
    payload.event_key === "ride_requested" &&
    AppStore.getState()?.App?.driverPendingRideOffer
  ) {
    inboxHandler?.(payload);
    return;
  }

  if (
    (payload.priority === "high" || payload.priority === "critical") &&
    Platform.OS === "android"
  ) {
    Vibration.vibrate(300);
  }

  if (payload.priority === "critical") {
    alertHandler?.(payload);
    return;
  }

  if (payload.type === "alert") {
    alertHandler?.(payload);
    return;
  }

  if (payload.type === "banner") {
    bannerHandler?.(payload);
    return;
  }

  inboxHandler?.(payload);
};

const parsePusherNotificationPayload = (
  event: PusherEvent
): NotificationPayload | null => {
  const rawData = event.data;
  const data =
    typeof rawData === "string"
      ? parseActionPayload(rawData)
      : rawData && typeof rawData === "object"
        ? rawData
        : {};

  if (!data || typeof data !== "object") {
    return null;
  }

  const payload = data as Record<string, any>;
  return {
    id: String(payload.id || payload.notification_id || ""),
    notification_id: String(payload.notification_id || payload.id || ""),
    title: String(payload.title || ""),
    message: String(payload.message || payload.body || ""),
    type: toType(payload.type),
    priority: toPriority(payload.priority),
    screen: payload.screen ? String(payload.screen) : undefined,
    action_type: payload.action_type || "none",
    action_payload: payload.action_payload || null,
    ride_id: payload.ride_id ? String(payload.ride_id) : undefined,
    duration_ms:
      payload.duration_ms != null ? Number(payload.duration_ms) : undefined,
    image_url: payload.image_url ? String(payload.image_url) : undefined,
    delivered_at: payload.delivered_at
      ? String(payload.delivered_at)
      : new Date().toISOString(),
    event_key: payload.event_key ? String(payload.event_key) : undefined,
  };
};

export const initPusherListener = async (userId: string): Promise<void> => {
  if (!userId) {
    return;
  }

  const nextChannelName = `private-user-${userId}`;
  if (pusherChannelName === nextChannelName) {
    return;
  }

  if (pusherChannelName) {
    try {
      await pusher.unsubscribe({ channelName: pusherChannelName });
    } catch {}
  }

  pusherChannelName = nextChannelName;

  await pusher.subscribe({
    channelName: nextChannelName,
    onEvent: (event: PusherEvent) => {
      if (event.eventName !== "notification") {
        return;
      }

      const payload = parsePusherNotificationPayload(event);
      if (!payload) {
        return;
      }

      handle(payload);
    },
  });
};

export const mapFirebaseToPayload = (remoteMessage: any): NotificationPayload => {
  const data = remoteMessage?.data || {};
  const title =
    remoteMessage?.notification?.title || data.title || "Notification";
  const message =
    remoteMessage?.notification?.body || data.message || data.body || "";
  const rideId = data.ride_id || data.rideId || "";

  return {
    id: String(data.id || data.notification_id || rideId || Date.now()),
    notification_id: String(data.notification_id || data.id || Date.now()),
    title: String(title),
    message: String(message),
    type: toType(data.type),
    priority: toPriority(data.priority),
    screen: data.screen ? String(data.screen) : undefined,
    action_type:
      data.action_type === "navigate" ||
      data.action_type === "open_url" ||
      data.action_type === "call_api"
        ? data.action_type
        : "none",
    action_payload: parseActionPayload(data.action_payload),
    ride_id: rideId ? String(rideId) : undefined,
    duration_ms:
      data.duration_ms != null ? Number(data.duration_ms) : undefined,
    image_url: data.image_url ? String(data.image_url) : undefined,
    delivered_at: new Date().toISOString(),
    event_key:
      data.event_key || data.subType || data.sub_type || undefined,
  };
};

/** Maps Expo push delivery (backend uses Expo Push API for `ExponentPushToken[...]`). */
export const mapExpoNotificationRequestToPayload = (
  request: NotificationRequest
): NotificationPayload => {
  const content = request.content;
  const rawData = content.data || {};
  const data: Record<string, string> = {};
  if (rawData && typeof rawData === "object") {
    for (const [k, v] of Object.entries(rawData as Record<string, unknown>)) {
      data[k] = v == null ? "" : typeof v === "string" ? v : String(v);
    }
  }
  const rideId = data.ride_id || data.rideId || "";
  const title =
    (content.title != null && content.title !== ""
      ? String(content.title)
      : null) ||
    data.title ||
    "Notification";
  const message =
    (content.body != null && content.body !== ""
      ? String(content.body)
      : null) ||
    data.message ||
    data.body ||
    "";

  return {
    id: String(data.id || data.notification_id || rideId || Date.now()),
    notification_id: String(data.notification_id || data.id || Date.now()),
    title: String(title),
    message: String(message),
    type: toType(data.type),
    priority: toPriority(data.priority),
    screen: data.screen ? String(data.screen) : undefined,
    action_type:
      data.action_type === "navigate" ||
      data.action_type === "open_url" ||
      data.action_type === "call_api"
        ? data.action_type
        : "none",
    action_payload: parseActionPayload(data.action_payload),
    ride_id: rideId ? String(rideId) : undefined,
    duration_ms:
      data.duration_ms != null ? Number(data.duration_ms) : undefined,
    image_url: data.image_url ? String(data.image_url) : undefined,
    delivered_at: new Date().toISOString(),
    event_key:
      data.event_key || data.subType || data.sub_type || undefined,
  };
};

export const handleNavigation = (payload: NotificationPayload): void => {
  const eventKey = String(payload.event_key || "").toLowerCase();
  const screen = String(
    payload.action_payload?.screen || payload.screen || "home"
  );
  const rideId =
    payload.action_payload?.rideId ||
    payload.action_payload?.ride_id ||
    payload.ride_id;

  // New ride offer: wake DriverRideOfferHost and land on driver home — not the
  // "Passengers around you" map (home-map), which only shows active trips.
  const isRideRequest =
    eventKey === "ride_requested" ||
    eventKey === "ride_request" ||
    screen === "DriverHome" ||
    screen === "driver_home" ||
    screen === "ride_request";

  if (isRideRequest) {
    const role = AppStore.getState()?.Auth?.user?.profile?.role;
    if (role !== "driver") {
      // Not a driver account — a ride-offer-shaped event has no business
      // navigating this user anywhere. Ignore it instead of silently
      // routing into the driver dashboard.
      return;
    }
    requestDriverOfferRefresh(AppStore.dispatch);
    markInitialDriverRouteHandled();
    navigateToRoute("/(driver)/(tabs)/(dashboard)/home", rideId);
    return;
  }

  if (payload.action_type !== "navigate") {
    return;
  }

  if (screen === "DriverMap") {
    navigateToRoute("/(driver)/(tabs)/(dashboard)/home-map", rideId);
    return;
  }

  if (screen === "RideChat" || screen === "ride_chat") {
    if (rideId) {
      AppStore.dispatch(setAppData({ pendingOpenChatRideId: String(rideId) }));
    }
    navigateToRoute(getRoleHomePath(), rideId);
    return;
  }

  if (screen === "ActiveRide" || screen === "ride") {
    navigateToRoute(getRoleHomePath(), rideId);
    return;
  }

  if (screen === "RideDetails") {
    navigateToRoute("/(app)/ride-details", rideId);
    return;
  }

  if (screen === "wallet") {
    navigateToRoute(getWalletPath(), rideId);
    return;
  }

  if (screen === "notifications") {
    const role = AppStore.getState()?.Auth?.user?.profile?.role;
    navigateToRoute(
      role === "driver" ? "/(driver)/notifications" : "/(app)/notifications",
      rideId
    );
    return;
  }

  if (screen === "home") {
    navigateToRoute(getRoleHomePath(), rideId);
    return;
  }

  if (typeof screen === "string" && screen.startsWith("/")) {
    navigateToRoute(screen, rideId);
    return;
  }

  navigateToRoute(getRoleHomePath(), rideId);
};

export const initFirebaseListeners = (): void => {
  if (firebaseInitialized) {
    return;
  }
  try {
    const messagingInstance = messaging();
    const setPresentation =
      messagingInstance.setForegroundNotificationPresentationOptions;
    if (typeof setPresentation === "function") {
      Promise.resolve(
        setPresentation.call(messagingInstance, {
          alert: false,
          badge: false,
          sound: false,
        })
      ).catch(() => {});
    }

    foregroundUnsubscribe = messagingInstance.onMessage(async (remoteMessage) => {
      const payload = mapFirebaseToPayload(remoteMessage);
      handle(payload);
    });

    backgroundOpenUnsubscribe = messagingInstance.onNotificationOpenedApp(
      (remoteMessage) => {
        const payload = mapFirebaseToPayload(remoteMessage);
        handleNavigation(payload);
      }
    );

    messagingInstance
      .getInitialNotification()
      .then((remoteMessage) => {
        if (!remoteMessage) {
          return;
        }
        const payload = mapFirebaseToPayload(remoteMessage);
        setTimeout(() => handleNavigation(payload), 1000);
      })
      .catch(() => {});

    firebaseInitialized = true;
  } catch (error) {
    foregroundUnsubscribe = null;
    backgroundOpenUnsubscribe = null;
    firebaseInitialized = false;
    logger.warn("Firebase messaging unavailable, skipping listeners", {
      message: String((error as Error)?.message || error),
    });
  }
};

export const registerFcmToken = async (): Promise<void> => {
  if (registerFcmTokenInFlight) {
    await registerFcmTokenInFlight;
    return;
  }

  registerFcmTokenInFlight = (async () => {
    try {
      const token = await registerForPushNotifications({ requestPermission: false });
      if (!token) {
        logger.debug("Push token not available (likely simulator or permissions denied)");
        return;
      }

      const isExpo = token.startsWith("ExponentPushToken[");
      if (isExpo) {
        await apiClient.post("auth/push-token", { token, type: "expo" });
        logger.debug("Expo push token registered with backend");
      } else {
        // Single native FCM/APNs token — backend delivers via Firebase Admin only.
        await apiClient.post("notifications/fcm-token", { token });
        logger.debug("Native FCM/APNs token registered with backend");
      }
    } catch (error) {
      logger.error(
        "FCM token registration failed",
        error instanceof Error ? error : undefined,
        { detail: String(error) }
      );
    } finally {
      registerFcmTokenInFlight = null;
    }
  })();

  await registerFcmTokenInFlight;
};

export const cleanupNotificationListeners = (): void => {
  foregroundUnsubscribe?.();
  backgroundOpenUnsubscribe?.();
  foregroundUnsubscribe = null;
  backgroundOpenUnsubscribe = null;
  firebaseInitialized = false;
};

const notificationManager = {
  registerAlertHandler,
  registerBannerHandler,
  registerInboxHandler,
  handle,
  initPusherListener,
  initFirebaseListeners,
  mapFirebaseToPayload,
  mapExpoNotificationRequestToPayload,
  handleNavigation,
  registerFcmToken,
  cleanupNotificationListeners,
};

export default notificationManager;
