/**
 * Driver cold-start landing guard.
 *
 * Goal: when the app cold-starts (process restart, dev reload, deep-link with
 * no notification context), the driver should always land on the dashboard
 * `home` screen — never directly on `home-map`.
 *
 * `home-map` is intentionally registered inside the (driver)/(tabs) navigator
 * so it can render with the bottom tab bar, but Expo Router state restoration
 * can leave it as the active tab after a reload. This module-level flag lets
 * `home-map` detect the very first navigation render after the JS engine boots
 * and bounce the user back to the dashboard, while still allowing intentional
 * in-session navigation (e.g. tapping "Passengers around you", or arriving via
 * a ride-request notification handler that fires after the initial route).
 *
 * Lifecycle:
 *  - Module state is fresh on every JS boot (cold start, Metro reload).
 *  - `markInitialDriverRouteHandled()` is called by `app/index.tsx` after its
 *    role-based redirect, by the driver `home` screen on mount, and by
 *    `home-map` itself once it has decided what to do.
 *  - `consumeInitialDriverRouteRedirect()` is called by `home-map` on mount.
 *    It returns `true` only the first time it is called per JS boot, telling
 *    the screen that this is a cold-start landing and it should redirect to
 *    `home`. Subsequent visits (push/navigate within the session) return
 *    `false` and the screen stays put.
 */

let initialDriverRouteHandled = false;

export function markInitialDriverRouteHandled(): void {
  initialDriverRouteHandled = true;
}

export function consumeInitialDriverRouteRedirect(): boolean {
  if (initialDriverRouteHandled) return false;
  initialDriverRouteHandled = true;
  return true;
}
