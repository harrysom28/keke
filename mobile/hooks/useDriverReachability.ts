import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { AppState } from "react-native";

export type ReachabilitySignal = "ok" | "warn" | "fail" | "unknown";

export type DriverReachabilityState = {
  gps: ReachabilitySignal;
  push: ReachabilitySignal;
  background: ReachabilitySignal;
  overall: ReachabilitySignal;
  details: {
    foregroundLocation: Location.PermissionStatus | "unknown";
    backgroundLocation: Location.PermissionStatus | "unknown";
    notificationStatus: Notifications.PermissionStatus | "unknown";
  };
};

/**
 * Live view of the three signals that determine whether this driver can
 * actually be matched + notified for a ride:
 *   - GPS:          foreground location granted (so a real fix can be captured)
 *   - Push:         notification permission granted (so ride offers can arrive
 *                   when the app is in the background)
 *   - Background:   background location granted (so heartbeats continue when
 *                   the app is backgrounded)
 *
 * Re-checks every time the app comes to foreground.
 */
export function useDriverReachability(): DriverReachabilityState {
  const [state, setState] = useState<DriverReachabilityState>({
    gps: "unknown",
    push: "unknown",
    background: "unknown",
    overall: "unknown",
    details: {
      foregroundLocation: "unknown",
      backgroundLocation: "unknown",
      notificationStatus: "unknown",
    },
  });

  const check = useCallback(async () => {
    try {
      const [fg, bg, notif] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        Notifications.getPermissionsAsync(),
      ]);

      const gps: ReachabilitySignal =
        fg.status === Location.PermissionStatus.GRANTED ? "ok" : "fail";
      const push: ReachabilitySignal =
        notif.status === Notifications.PermissionStatus.GRANTED
          ? "ok"
          : notif.status === Notifications.PermissionStatus.UNDETERMINED
            ? "warn"
            : "fail";
      const background: ReachabilitySignal =
        bg.status === Location.PermissionStatus.GRANTED
          ? "ok"
          : fg.status === Location.PermissionStatus.GRANTED
            ? "warn"
            : "fail";

      const overall: ReachabilitySignal =
        gps === "fail" || push === "fail" || background === "fail"
          ? "fail"
          : gps === "warn" || push === "warn" || background === "warn"
            ? "warn"
            : "ok";

      setState({
        gps,
        push,
        background,
        overall,
        details: {
          foregroundLocation: fg.status,
          backgroundLocation: bg.status,
          notificationStatus: notif.status,
        },
      });
    } catch {
      // Leave state as "unknown"; UI hides the chip when unknown.
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void check();
    });
    return () => sub.remove();
  }, [check]);

  return state;
}
