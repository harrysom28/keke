import React, { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NotificationPayload } from "@/services/notificationManager";

type Props = {
  visible: boolean;
  payload: NotificationPayload | null;
  onDismiss: () => void;
};

export default function NotificationBanner({
  visible,
  payload,
  onDismiss,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-90)).current;

  useEffect(() => {
    if (!visible || !payload) {
      translateY.setValue(-90);
      return;
    }

    Animated.timing(translateY, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -90,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          onDismiss();
        }
      });
    }, payload.duration_ms ?? 5000);

    return () => clearTimeout(timer);
  }, [onDismiss, payload, translateY, visible]);

  if (!payload) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable style={styles.banner} onPress={onDismiss}>
        <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#FFFFFF" />
        <Text style={styles.text} numberOfLines={1}>
          {payload.title} · {payload.message}
        </Text>
        <View style={styles.closeWrap}>
          <Text style={styles.closeText}>×</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
  },
  banner: {
    height: 52,
    backgroundColor: "#1A1A2E",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  closeWrap: {
    width: 18,
    alignItems: "center",
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 18,
  },
});
