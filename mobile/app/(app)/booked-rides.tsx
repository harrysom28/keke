/**
 * Redirect: standalone Bookings screen removed in favor of Rides tab > Bookings.
 * Any link to /booked-rides now opens the Rides tab with Bookings selected.
 */
import { useEffect } from "react";
import { router } from "expo-router";

export default function BookedRidesRedirect() {
  useEffect(() => {
    router.replace("/(app)/(tabs)/rides?tab=upcoming");
  }, []);
  return null;
}
