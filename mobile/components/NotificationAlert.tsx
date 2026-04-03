import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { NotificationPayload } from "@/services/notificationManager";

type Props = {
  visible: boolean;
  payload: NotificationPayload | null;
  onDismiss: () => void;
  onAction: (payload: NotificationPayload) => void;
};

export default function NotificationAlert({
  visible,
  payload,
  onDismiss,
  onAction,
}: Props) {
  const translateY = useRef(new Animated.Value(180)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const duration = payload?.duration_ms ?? 6000;
  const isCritical = payload?.priority === "critical";

  useEffect(() => {
    if (!visible || !payload) {
      translateY.setValue(180);
      overlayOpacity.setValue(0);
      return;
    }

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 16,
        stiffness: 180,
        mass: 0.9,
      }),
      Animated.timing(overlayOpacity, {
        toValue: isCritical ? 1 : 0.25,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, isCritical, onDismiss, overlayOpacity, payload, translateY, visible]);

  const iconName = useMemo(() => {
    if (payload?.screen === "wallet") return "wallet-outline";
    if (payload?.screen === "ride") return "map-marker-radius-outline";
    return "bell-ring-outline";
  }, [payload?.screen]);

  if (!payload) {
    return null;
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.modalContainer}
        onPress={isCritical ? onDismiss : undefined}
      >
        <Animated.View
          style={[
            styles.overlay,
            {
              opacity: overlayOpacity,
            },
          ]}
        />
        <Animated.View
          style={[
            isCritical ? styles.criticalWrapper : styles.highWrapper,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <View
            style={[
              styles.card,
              isCritical ? styles.criticalCard : styles.highCard,
            ]}
          >
            <View
              style={[
                styles.header,
                isCritical ? styles.criticalHeader : styles.highHeader,
              ]}
            >
              <MaterialCommunityIcons
                name={iconName}
                size={22}
                color={isCritical ? "#FFFFFF" : "#2E7D52"}
              />
              <Text
                style={[
                  styles.title,
                  isCritical ? styles.criticalTitle : styles.highTitle,
                ]}
              >
                {payload.title}
              </Text>
            </View>

            <Text style={styles.message}>{payload.message}</Text>

            <View style={styles.actions}>
              {payload.action_type && payload.action_type !== "none" ? (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => onAction(payload)}
                >
                  <Text style={styles.actionButtonText}>Open</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}

              <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F172A",
  },
  criticalWrapper: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  highWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
  criticalCard: {
    borderWidth: 0,
  },
  highCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  criticalHeader: {
    backgroundColor: "#2E7D52",
    marginHorizontal: -20,
    marginTop: -20,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  highHeader: {},
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
  },
  criticalTitle: {
    color: "#FFFFFF",
  },
  highTitle: {
    color: "#111827",
  },
  message: {
    color: "#374151",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 18,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionButton: {
    backgroundColor: "#2E7D52",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  dismissButton: {
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  dismissButtonText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "600",
  },
});
