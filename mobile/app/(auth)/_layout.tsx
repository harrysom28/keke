import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboard" />
      <Stack.Screen name="register" />
      <Stack.Screen name="usertype" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="authenticate" />
      <Stack.Screen name="otpcode" />
      <Stack.Screen name="forgotpassword" />
      <Stack.Screen name="driverinfo" />
      <Stack.Screen name="authenticate-google" />
      <Stack.Screen name="terms" />
      <Stack.Screen name="account-recovery" />
    </Stack>
  );
}
