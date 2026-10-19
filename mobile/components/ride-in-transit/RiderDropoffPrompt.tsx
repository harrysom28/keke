import React, { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { showMessage } from "react-native-flash-message";
import apiClient from "@/utils/apiClient";
import { getErrorMessage } from "@/utils/errorHandler";
import { formatDropoffDistance } from "./DropoffSheets";

const BRAND_GREEN = "#3C8F7C";

export type RiderDropoffPromptData = {
  /** confirm_request: trip still running, driver asks to end it. review: driver already ended it away from the pin. */
  kind: "dropoff_confirm_request" | "dropoff_review";
  rideId: string;
  distanceMeters: number | null;
  /** ISO time after which a confirm request no longer works (server window). */
  expiresAt?: string | null;
};

/** Parse a realtime / push payload into prompt data (or null when it is not usable). */
export function parseRiderDropoffPrompt(
  kind: string,
  payload: Record<string, unknown> | null | undefined,
  fallbackRideId?: string | null
): RiderDropoffPromptData | null {
  if (kind !== "dropoff_confirm_request" && kind !== "dropoff_review") return null;
  const rideId = String(payload?.rideId ?? payload?.ride_id ?? fallbackRideId ?? "").trim();
  if (!/^[a-f\d]{24}$/i.test(rideId)) return null;
  const d = Number(payload?.distanceMeters ?? payload?.distance_meters);
  const expiresAt = payload?.expiresAt != null ? String(payload.expiresAt) : null;
  if (expiresAt) {
    const t = Date.parse(expiresAt);
    if (Number.isFinite(t) && t < Date.now()) return null; // stale push tapped too late
  }
  return { kind, rideId, distanceMeters: Number.isFinite(d) ? d : null, expiresAt };
}

/**
 * Rider-side answer to the two trip-ending prompts. Both call
 * POST rides/:rideId/dropoff-confirm { confirmed } - the server decides what happens.
 */
export function RiderDropoffPrompt({
  prompt,
  onClose,
  onAnswered,
}: {
  prompt: RiderDropoffPromptData | null;
  onClose: () => void;
  /** Refresh ride state after an answer. */
  onAnswered?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isRequest = prompt?.kind === "dropoff_confirm_request";

  const answer = async (confirmed: boolean) => {
    if (!prompt) return;
    setBusy(true);
    try {
      await apiClient.post(`rides/${prompt.rideId}/dropoff-confirm`, { confirmed });
      if (isRequest && confirmed) {
        showMessage({ type: "success", message: "Trip ended" });
      } else if (!isRequest && !confirmed) {
        showMessage({ type: "info", message: "Thanks. Our team will look into this trip." });
      }
      onClose();
      onAnswered?.();
    } catch (err) {
      showMessage({ type: "danger", message: getErrorMessage(err, "Could not send your answer. Please try again.") });
      // An expired or already-handled request cannot be retried: close and refresh.
      // Network problems keep the prompt open so the rider can try again.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status && status >= 400 && status < 500) {
        onClose();
        onAnswered?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const title = isRequest
    ? "Your driver says you've arrived. End the trip here?"
    : `Your driver ended the trip about ${formatDropoffDistance(prompt?.distanceMeters ?? 0)} from your destination. Was this right?`;
  const yesLabel = isRequest ? "Yes, end trip" : "Yes";
  const noLabel = isRequest ? "Not yet" : "No, report it";

  return (
    <Modal visible={!!prompt} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity
            style={[styles.primary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => answer(true)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={yesLabel}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{yesLabel}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondary, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => answer(false)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={noLabel}
          >
            <Text style={styles.secondaryText}>{noLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 16, color: "#111827", fontFamily: "RobotoMedium", marginBottom: 4 },
  primary: {
    backgroundColor: BRAND_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontSize: 15, fontFamily: "RobotoMedium" },
  secondary: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { color: "#111827", fontSize: 15, fontFamily: "RobotoMedium" },
});
