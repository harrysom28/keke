import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const BRAND_GREEN = "#3C8F7C";

/** Reasons the server accepts for `reason` on driver/rides/complete (Tier 2). */
export const DROPOFF_REASONS = [
  { key: "rider_requested_stop", label: "Rider asked me to stop here" },
  { key: "pin_inaccurate", label: "Destination pin is inaccurate" },
  { key: "road_blocked", label: "Road is blocked" },
  { key: "other", label: "Other" },
] as const;

export type DropoffReasonKey = (typeof DROPOFF_REASONS)[number]["key"];

/** "350 m" below a kilometre, "1.2 km" above. */
export function formatDropoffDistance(meters: number): string {
  const m = Math.max(0, Math.round(meters));
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

type SheetShellProps = {
  visible: boolean;
  onRequestClose: () => void;
  children: React.ReactNode;
};

function SheetShell({ visible, onRequestClose, children }: SheetShellProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onRequestClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <View style={styles.card}>{children}</View>
      </View>
    </Modal>
  );
}

/** Tier 2: the driver is between the free and confirm radii and must say why. */
export function DropoffReasonSheet({
  visible,
  distanceMeters,
  busy,
  onPick,
  onClose,
}: {
  visible: boolean;
  distanceMeters: number | null;
  busy?: boolean;
  onPick: (reason: DropoffReasonKey) => void;
  onClose: () => void;
}) {
  return (
    <SheetShell visible={visible} onRequestClose={onClose}>
      <Text style={styles.title}>
        {`You're about ${formatDropoffDistance(distanceMeters ?? 0)} from the destination. Why are you ending here?`}
      </Text>
      {DROPOFF_REASONS.map((r) => (
        <TouchableOpacity
          key={r.key}
          style={[styles.option, busy && { opacity: 0.5 }]}
          disabled={busy}
          activeOpacity={0.85}
          onPress={() => onPick(r.key)}
          accessibilityRole="button"
          accessibilityLabel={r.label}
        >
          <Text style={styles.optionText}>{r.label}</Text>
        </TouchableOpacity>
      ))}
      {busy ? <ActivityIndicator color={BRAND_GREEN} style={{ marginTop: 8 }} /> : null}
      <TouchableOpacity style={styles.ghost} onPress={onClose} disabled={busy}>
        <Text style={styles.ghostText}>Keep driving</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

/** Tier 3: too far for the driver to end alone — the rider has to confirm. */
export function DropoffTooFarSheet({
  visible,
  distanceMeters,
  waiting,
  busy,
  onAskRider,
  onClose,
}: {
  visible: boolean;
  distanceMeters: number | null;
  waiting: boolean;
  busy?: boolean;
  onAskRider: () => void;
  onClose: () => void;
}) {
  return (
    <SheetShell visible={visible} onRequestClose={onClose}>
      <Text style={styles.title}>
        {`You're ${formatDropoffDistance(distanceMeters ?? 0)} away. Ask the rider to confirm?`}
      </Text>
      {waiting ? (
        <View style={styles.waitingRow}>
          <ActivityIndicator color={BRAND_GREEN} />
          <Text style={styles.waitingText}>Waiting for rider…</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.primary, busy && { opacity: 0.6 }]}
          disabled={busy}
          activeOpacity={0.9}
          onPress={onAskRider}
          accessibilityRole="button"
          accessibilityLabel="Ask rider to confirm"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Ask rider to confirm</Text>
          )}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.ghost} onPress={onClose}>
        <Text style={styles.ghostText}>Keep driving</Text>
      </TouchableOpacity>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(17,24,39,0.45)",
  },
  card: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 10,
  },
  title: {
    fontSize: 16,
    color: "#111827",
    fontFamily: "RobotoMedium",
    marginBottom: 6,
  },
  option: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  optionText: { fontSize: 15, color: "#111827", fontFamily: "RobotoMedium" },
  primary: {
    backgroundColor: BRAND_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primaryText: { fontSize: 15, color: "#fff", fontFamily: "RobotoMedium" },
  ghost: { paddingVertical: 12, alignItems: "center" },
  ghostText: { fontSize: 14, color: "#6B7280", fontFamily: "RobotoMedium" },
  waitingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
  },
  waitingText: { fontSize: 15, color: "#111827", fontFamily: "RobotoMedium" },
});
