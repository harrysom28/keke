import { Stack } from "expo-router";

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="street-view" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="setEmergencyContact" />
      <Stack.Screen name="bookingHistory" />
      <Stack.Screen name="booked-rides" />
      <Stack.Screen name="ride-details" />
    </Stack>
  );
}
