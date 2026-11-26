import React, { useMemo, useState } from "react";
import { Linking, Modal, Platform, Pressable, Text, View } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { Ionicons } from "@expo/vector-icons";
import tw from "@/lib/tailwind";
import {
  useDriverReachability,
  type ReachabilitySignal,
} from "@/hooks/useDriverReachability";

function signalColor(s: ReachabilitySignal) {
  if (s === "ok") return "#16a34a";
  if (s === "warn") return "#f59e0b";
  if (s === "fail") return "#dc2626";
  return "#9ca3af";
}

function signalLabel(s: ReachabilitySignal) {
  if (s === "ok") return "OK";
  if (s === "warn") return "Warning";
  if (s === "fail") return "Not working";
  return "Checking";
}

export function DriverReachabilityChip() {
  const r = useDriverReachability();
  const [open, setOpen] = useState(false);

  const chipColor = useMemo(() => signalColor(r.overall), [r.overall]);
  const chipText = useMemo(() => {
    if (r.overall === "ok") return "Ready to receive rides";
    if (r.overall === "warn") return "Reachability warning";
    if (r.overall === "fail") return "Not reachable — tap to fix";
    return "Checking…";
  }, [r.overall]);

  const requestBackground = async () => {
    try {
      // Must request foreground first on iOS
      await Location.requestForegroundPermissionsAsync();
      await Location.requestBackgroundPermissionsAsync();
    } catch {}
  };

  const requestNotifications = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {}
  };

  const openAppSettings = () => Linking.openSettings();

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={tw.style(
          `flex-row items-center px-3 py-1.5 rounded-full self-start`,
          { backgroundColor: `${chipColor}20`, borderColor: chipColor, borderWidth: 1 }
        )}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: chipColor,
            marginRight: 6,
          }}
        />
        <Text style={tw.style(`text-xs`, { color: chipColor, fontFamily: "RobotoMedium" })}>
          {chipText}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={tw`flex-1 justify-end bg-black bg-opacity-40`}
        >
          <Pressable onPress={() => {}} style={tw`bg-white rounded-t-3xl p-5`}>
            <View style={tw`flex-row items-center justify-between mb-3`}>
              <Text style={tw.style(`text-lg`, { fontFamily: "RobotoBold" })}>
                Driver reachability
              </Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#111" />
              </Pressable>
            </View>

            <Text style={tw`text-xs text-gray-500 mb-4`}>
              All three must be green for you to receive rides reliably. Tap any red item to fix.
            </Text>

            <Row
              label="GPS (foreground location)"
              signal={r.gps}
              hint="Needed so your position reaches the dispatcher."
              onFix={requestBackground}
            />
            <Row
              label="Push notifications"
              signal={r.push}
              hint="Needed to alert you when a ride is offered."
              onFix={async () => {
                await requestNotifications();
                openAppSettings();
              }}
            />
            <Row
              label="Allow all the time (background location)"
              signal={r.background}
              hint="Needed so the app keeps sharing your location when backgrounded or screen off."
              onFix={() => {
                void requestBackground();
                openAppSettings();
              }}
            />

            <View style={tw`mt-3 border-t border-gray-200 pt-3`}>
              <Text style={tw`text-xs text-gray-500 mb-2`}>
                If all three are green but you still miss rides, your phone's battery saver may be
                killing the app. Open battery settings and exclude Keke Ride from optimization.
              </Text>
              <Pressable
                onPress={openAppSettings}
                style={tw`bg-black py-3 rounded-xl items-center`}
              >
                <Text style={tw.style(`text-white`, { fontFamily: "RobotoBold" })}>
                  Open app settings
                </Text>
              </Pressable>
              {Platform.OS === "android" && (
                <Pressable
                  onPress={() =>
                    Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(
                      () => openAppSettings()
                    )
                  }
                  style={tw`mt-2 border border-gray-300 py-3 rounded-xl items-center`}
                >
                  <Text style={tw.style(`text-black`, { fontFamily: "RobotoBold" })}>
                    Open battery optimization settings
                  </Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Row({
  label,
  signal,
  hint,
  onFix,
}: {
  label: string;
  signal: ReachabilitySignal;
  hint: string;
  onFix: () => void | Promise<void>;
}) {
  const color = signalColor(signal);
  return (
    <View style={tw`py-2.5 border-b border-gray-100`}>
      <View style={tw`flex-row items-center justify-between`}>
        <View style={tw`flex-row items-center flex-1`}>
          <View
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8 }}
          />
          <Text style={tw.style(`flex-1`, { fontFamily: "RobotoMedium" })}>{label}</Text>
        </View>
        <Text style={tw.style(`text-xs`, { color, fontFamily: "RobotoMedium" })}>
          {signalLabel(signal)}
        </Text>
      </View>
      <Text style={tw`text-xs text-gray-500 mt-1`}>{hint}</Text>
      {signal !== "ok" && (
        <Pressable
          onPress={() => void onFix()}
          style={tw`mt-2 self-start bg-base-green px-3 py-1.5 rounded-lg`}
        >
          <Text style={tw.style(`text-xs text-white`, { fontFamily: "RobotoMedium" })}>Fix now</Text>
        </Pressable>
      )}
    </View>
  );
}
