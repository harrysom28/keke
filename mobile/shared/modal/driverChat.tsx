import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  InteractionManager,
  Modal,
  FlatList,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  Linking,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import { CREATE_CHAT, RETRIEVE_CHAT } from "@/constants";
import React, { memo, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import FlashMessage from "react-native-flash-message";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";
import usePusherChannel from "@/hooks/usePusherChannel";

// ─── helpers ────────────────────────────────────────────────────────────────

const formatTime = (dateString: string | Date): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatSectionDate = (dateString: string | Date): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
};

const getFirstName = (full: string) => String(full || "").trim().split(" ")[0] || "Driver";

// ─── MessageItem ─────────────────────────────────────────────────────────────

interface MProps {
  isOwner: boolean;
  item: {
    message: string;
    created_at?: string;
    createdAt?: string;
    date?: string;
    status?: "sent" | "delivered" | "seen";
    kind?: "chat" | "system" | "date";
    label?: string;
  };
  showAvatar: boolean;
  driverImage?: string;
}

const MessageItem = ({ isOwner, item, showAvatar, driverImage }: MProps) => {
  if (item?.kind === "date") {
    return <Text style={styles.dateSeparator}>{item.label}</Text>;
  }

  if (item?.kind === "system") {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemPill}>
          <Ionicons name="information-circle-outline" size={14} color="#2563EB" />
          <Text style={styles.systemText}>{item.message}</Text>
        </View>
      </View>
    );
  }

  const time = formatTime(
    item?.created_at || item?.createdAt || item?.date || ""
  );

  const status = item?.status || (isOwner ? "delivered" : undefined);
  const statusIcon =
    status === "seen" ? "checkmark-done" : status === "delivered" ? "checkmark-done" : "checkmark";
  const statusColor = status === "seen" ? "#2D7A4F" : "#9CA3AF";

  return (
    <View
      style={[
        styles.msgRow,
        isOwner ? styles.msgRowOwner : styles.msgRowOther,
      ]}
    >
      {/* Driver avatar — only show on last message in a group */}
      {!isOwner && (
        <View style={styles.avatarSlot}>
          {showAvatar ? (
            driverImage ? (
              <Image
                source={{ uri: driverImage }}
                style={styles.msgAvatar}
              />
            ) : (
              <View style={styles.msgAvatarFallback}>
                <Ionicons name="person" size={16} color="#fff" />
              </View>
            )
          ) : null}
        </View>
      )}

      <View style={isOwner ? styles.bubbleWrapOwner : styles.bubbleWrapOther}>
        <View style={[styles.bubble, isOwner ? styles.bubbleOwner : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwner ? styles.bubbleTextOwner : styles.bubbleTextOther]}>
            {item?.message}
          </Text>
        </View>
        {!!time && (
          <Text style={[styles.timeText, isOwner ? styles.timeOwner : styles.timeOther]}>
            {time}
            {isOwner ? (
              <Text style={styles.checkmark}>
                {" "}
                <Ionicons name={statusIcon as any} size={12} color={statusColor} />
              </Text>
            ) : null}
          </Text>
        )}
      </View>
    </View>
  );
};

// ─── EmptyState ──────────────────────────────────────────────────────────────

const EmptyState = ({ name }: { name: string }) => (
  <View style={styles.emptyWrap}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name="chatbubble-ellipses-outline" size={36} color="#2D7A4F" />
    </View>
    <Text style={styles.emptyTitle}>Say hello to {name?.split(" ")[0] || "your driver"}</Text>
    <Text style={styles.emptySubtitle}>
      Messages are only visible during your ride.
    </Text>
  </View>
);

// ─── DriverChatModal ─────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  data: {
    id: string;
    rideId?: string;
    name: string;
    image: string;
    rating?: number;
    vehicle?: string;
    plate?: string;
    phone?: string;
  };
}

type RideStatus = "on_the_way" | "arrived" | "in_progress";

function DriverHeader({
  insetsTop,
  onBack,
  onCall,
  onSOS,
  avatarUrl,
  name,
  rating,
  vehicleLine,
  statusText,
}: {
  insetsTop: number;
  onBack: () => void;
  onCall: () => void;
  onSOS: () => void;
  avatarUrl?: string;
  name: string;
  rating: number;
  vehicleLine: string;
  statusText: string;
}) {
  return (
    <View style={[styles.headerSafe, { paddingTop: insetsTop }]}>
      <View style={styles.hubHeader}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>

        <View style={styles.driverCard}>
          <View style={styles.driverRow}>
            <View style={styles.avatarWrap}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
              ) : (
                <View style={styles.headerAvatarFallback}>
                  <Ionicons name="person" size={20} color="#fff" />
                </View>
              )}
              <View style={styles.onlineDot} />
            </View>

            <View style={styles.driverMeta}>
              <Text style={styles.driverName} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.driverSubRow}>
                <View style={styles.ratingPill}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                </View>
                <Text style={styles.vehicleText} numberOfLines={1}>
                  {vehicleLine}
                </Text>
              </View>
              <Text style={styles.statusInline} numberOfLines={1}>
                {statusText}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onCall}
              style={styles.callBtn}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Call driver"
            >
              <Ionicons name="call" size={18} color="#2D7A4F" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSOS}
              style={styles.sosBtn}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel="Emergency SOS"
            >
              <Text style={styles.sosText}>SOS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.divider} />
    </View>
  );
}

function StatusBarLite({
  status,
  etaText,
}: {
  status: RideStatus;
  etaText?: string;
}) {
  const cfg =
    status === "arrived"
      ? { label: "Arrived", bg: "#DCFCE7", text: "#166534", dot: "#22C55E" }
      : status === "in_progress"
        ? { label: "Trip in progress", bg: "#DBEAFE", text: "#1D4ED8", dot: "#2563EB" }
        : { label: "On the way", bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" };

  return (
    <View style={[styles.statusBarLite, { backgroundColor: cfg.bg }]}>
      <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.statusBarText, { color: cfg.text }]}>{cfg.label}</Text>
      {etaText ? <Text style={[styles.statusBarEta, { color: cfg.text }]}>{etaText}</Text> : null}
    </View>
  );
}

function RideSummaryCard({
  pickupLabel,
  directionLabel,
  etaLabel,
  onViewMap,
}: {
  pickupLabel: string;
  directionLabel: string;
  etaLabel: string;
  onViewMap?: () => void;
}) {
  return (
    <View style={styles.rideCard}>
      <View style={styles.rideTop}>
        <View style={styles.ridePin}>
          <Ionicons name="location" size={16} color="#EF4444" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rideTitle} numberOfLines={1}>
            Pickup
          </Text>
          <Text style={styles.rideValue} numberOfLines={2}>
            {pickupLabel}
          </Text>
        </View>
        {onViewMap ? (
          <TouchableOpacity onPress={onViewMap} style={styles.viewMapBtn} activeOpacity={0.8}>
            <Text style={styles.viewMapText}>View map</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.rideDivider} />

      <View style={styles.rideBottom}>
        <View style={styles.rideMiniRow}>
          <Ionicons name="navigate-outline" size={16} color="#2D7A4F" />
          <Text style={styles.rideMiniText}>{directionLabel}</Text>
        </View>
        <View style={styles.rideMiniRow}>
          <Ionicons name="time-outline" size={16} color="#2D7A4F" />
          <Text style={styles.rideMiniText}>{etaLabel}</Text>
        </View>
      </View>
    </View>
  );
}

function ActionChips({
  onPickUp,
  onCall,
  onLate,
}: {
  onPickUp: () => void;
  onCall: () => void;
  onLate: () => void;
}) {
  const actions = [
    { key: "pickup", label: "I’m at pickup", icon: "navigate-outline" as const, onPress: onPickUp },
    { key: "call", label: "Call driver", icon: "call-outline" as const, onPress: onCall },
    { key: "late", label: "Running late", icon: "time-outline" as const, onPress: onLate },
  ];
  return (
    <View style={styles.chipsWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        {actions.map((a) => (
          <TouchableOpacity key={a.key} onPress={a.onPress} style={styles.chip} activeOpacity={0.85}>
            <Ionicons name={a.icon as any} size={16} color="#2D7A4F" />
            <Text style={styles.chipText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function InputBar({
  value,
  onChange,
  onSend,
  disabled,
  onMic,
  onLocation,
  bottomPad,
  keyboardOffset,
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  disabled: boolean;
  onMic: () => void;
  onLocation: () => void;
  bottomPad: number;
  keyboardOffset: number;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardOffset}
    >
      <View style={[styles.inputBar, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          onPress={onMic}
          style={styles.iconPill}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Voice message"
        >
          <Ionicons name="mic-outline" size={20} color="#111827" />
        </TouchableOpacity>

        <View style={styles.inputField}>
          <TextInput
            value={value}
            onChangeText={onChange}
            multiline
            maxLength={1000}
            style={styles.textInput}
            placeholder="Message your driver…"
            placeholderTextColor="#9CA3AF"
            returnKeyType="send"
            onSubmitEditing={onSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={onLocation}
            style={styles.inputIcon}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Share location"
          >
            <Ionicons name="location-outline" size={20} color="#2D7A4F" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onSend}
          disabled={disabled}
          style={[styles.sendBtn, disabled && styles.sendBtnDisabled]}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function DriverChatModalContent({ visible, onClose, data }: Readonly<Props>) {
  const insets = useCombinedSafeInsets();
  const { user } = useSelector(AuthState);
  const { apiConfig } = useContext(AppContext);
  const [chats, setChats] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [isTyping] = useState(false); // optional; keep false by default (no constant UI updates)
  const [rideStatus] = useState<RideStatus>("on_the_way"); // dummy, static
  const flashMessageRef = useRef<FlashMessage | null>(null);
  const chatRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const channelName = data?.rideId ? `private.ride.${data.rideId}` : "";

  const getAllChats = useCallback(() => {
    if (!data?.rideId) return;
    setLoading(true);
    axios
      .get(RETRIEVE_CHAT + data.rideId, apiConfig)
      .then(({ data: res }) => {
        const messages = res?.data?.messages || res?.data || [];
        setChats(messages);
      })
      .catch((err) => {
        flashMessageRef.current?.showMessage({
          type: "danger",
          message: err?.response?.data?.message || "Could not load messages",
        });
      })
      .finally(() => setLoading(false));
  }, [data?.rideId, apiConfig]);

  const scheduleChatRefetch = useCallback(() => {
    if (chatRefetchDebounceRef.current) {
      clearTimeout(chatRefetchDebounceRef.current);
    }
    chatRefetchDebounceRef.current = setTimeout(() => {
      chatRefetchDebounceRef.current = null;
      getAllChats();
    }, 280);
  }, [getAllChats]);

  usePusherChannel({
    channel: channelName || "private.ride.__disabled__",
    visible: visible && !!channelName,
    onEvent: (event) => {
      const ev = event as { eventName?: string; name?: string };
      const name = ev.eventName ?? ev.name ?? "";
      if (!name || name.startsWith("pusher:") || name.startsWith("pusher_internal:")) {
        return;
      }
      if (name === "new-message") {
        scheduleChatRefetch();
      }
    },
  });

  const sendChat = () => {
    if (!data?.rideId) {
      flashMessageRef.current?.showMessage({ type: "danger", message: "Ride ID is required" });
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    axios
      .post(CREATE_CHAT, { rideId: data.rideId, message: trimmed }, apiConfig)
      .then(({ data }) => {
        setChats((prev) => [...prev, data?.data?.message || data?.data]);
        setMessage("");
      })
      .catch((err) => {
        const msg = err?.response?.data?.message;
        flashMessageRef.current?.showMessage({
          type: "danger",
          message: msg?.includes("No driver assigned")
            ? "Wait for a driver to accept your ride first."
            : msg || "Something went wrong",
        });
      })
      .finally(() => setSending(false));
  };

  useEffect(() => {
    if (visible) {
      const interactionTask = InteractionManager.runAfterInteractions(() => {
        getAllChats();
      });
      return () => interactionTask.cancel();
    }
    else setChats([]);
  }, [visible, getAllChats]);

  useEffect(
    () => () => {
      if (chatRefetchDebounceRef.current) {
        clearTimeout(chatRefetchDebounceRef.current);
        chatRefetchDebounceRef.current = null;
      }
    },
    []
  );

  const keyboardOffset =
    Platform.OS === "ios" ? Math.max(insets.top, 12) + 8 : 0;

  // Group messages to know when to show avatar (last in a consecutive group)
  const isLastInGroup = (index: number): boolean => {
    const current = chats[index] as any;
    const next = chats[index + 1] as any;
    const currentIsOwner =
      current?.is_sender ||
      current?.sender?.user_id === user?.profile?.user_id ||
      current?.sender_id === user?.profile?.user_id;
    if (!next) return true;
    const nextIsOwner =
      next?.is_sender ||
      next?.sender?.user_id === user?.profile?.user_id ||
      next?.sender_id === user?.profile?.user_id;
    return currentIsOwner !== nextIsOwner;
  };

  const driverDisplayName = data?.name || "John Doe";
  const driverRating = typeof data?.rating === "number" ? data.rating : 4.8;
  const vehicleLabel = data?.vehicle || "Toyota Camry";
  const plateLabel = data?.plate || "ABC-123";
  const statusText = "Arriving soon";

  const renderableMessages = (() => {
    const base = [...chats].reverse();
    // Inject a lightweight system message (static) at the top of the timeline.
    const sys: any[] = [
      { kind: "system", message: statusText, createdAt: new Date().toISOString() },
    ];

    const all = [...sys, ...base];
    const withDates: any[] = [];
    let lastLabel = "";
    for (let i = 0; i < all.length; i++) {
      const it = all[i] as any;
      const d = it?.created_at || it?.createdAt || it?.date || new Date().toISOString();
      const label = formatSectionDate(d);
      if (label && label !== lastLabel) {
        withDates.push({ kind: "date", label, message: "" });
        lastLabel = label;
      }
      withDates.push({
        ...it,
        kind: it.kind || "chat",
        status: it.status || (it.is_sender ? "delivered" : undefined),
      });
    }
    return withDates;
  })();

  const handleCall = () => {
    const num = String(data?.phone || "").trim();
    if (!num) {
      flashMessageRef.current?.showMessage({ type: "info", message: "Phone number not available" });
      return;
    }
    Linking.openURL(num.startsWith("0") ? `tel:${num}` : `tel:+${num}`).catch(() =>
      flashMessageRef.current?.showMessage({ type: "danger", message: "Unable to make call" })
    );
  };

  const handleSOS = () => {
    flashMessageRef.current?.showMessage({
      type: "warning",
      message: "Emergency: contact support or emergency services.",
    });
  };

  const handleViewMap = () => {
    flashMessageRef.current?.showMessage({
      type: "info",
      message: "View map (open the main trip screen).",
    });
  };

  const isInitialLoading = loading && chats.length === 0;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <FlashMessage
        ref={flashMessageRef}
        position="top"
        floating
        style={{ zIndex: 99999, marginTop: insets.top + 8 }}
        duration={3000}
        titleStyle={{ fontFamily: "RobotoMedium", textAlign: "center" }}
      />

      <View
        style={[
          styles.root,
          {
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <DriverHeader
          insetsTop={insets.top}
          onBack={onClose}
          onCall={handleCall}
          onSOS={handleSOS}
          avatarUrl={data?.image}
          name={driverDisplayName}
          rating={driverRating}
          vehicleLine={`${vehicleLabel} • ${plateLabel}`}
          statusText={loading ? "Syncing…" : statusText}
        />

        <StatusBarLite status={rideStatus} etaText={loading ? "Updating messages…" : "Arriving soon"} />

        <RideSummaryCard
          pickupLabel="Roban Stores"
          directionLabel="Driver → You"
          etaLabel="1 min away"
          onViewMap={handleViewMap}
        />

        {/* ── Messages ── */}
        <FlatList
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            renderableMessages.length === 0 ? styles.scrollCentered : null,
          ]}
          inverted={true}
          initialNumToRender={20}
          windowSize={5}
          removeClippedSubviews={true}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          data={[...renderableMessages].reverse()}
          keyExtractor={(item, index) =>
            String(
              (item as any)?.message_id ||
                (item as any)?._id ||
                (item as any)?.kind + "-" + ((item as any)?.label || "") + "-" + index
            )
          }
          refreshing={false}
          onRefresh={getAllChats}
          ListEmptyComponent={
            <View style={{ width: "100%" }}>
              <EmptyState name={data?.name} />
              {isInitialLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator size="small" color="#2D7A4F" />
                  <Text style={styles.inlineLoaderText}>Loading messages…</Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            if ((item as any)?.kind === "date" || (item as any)?.kind === "system") {
              return (
                <MessageItem
                  item={item as any}
                  isOwner={false}
                  showAvatar={false}
                  driverImage={data?.image}
                />
              );
            }
            const isOwner =
              item?.is_sender ||
              item?.sender?.user_id === user?.profile?.user_id ||
              item?.sender_id === user?.profile?.user_id;

            // index here is for reversed array; map back to original chats index for grouping logic
            const originalIndex = chats.length - 1 - index;

            return (
              <MessageItem
                item={item}
                isOwner={isOwner}
                showAvatar={!isOwner && isLastInGroup(originalIndex)}
                driverImage={data?.image}
              />
            );
          }}
          ListHeaderComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <View style={styles.typingBubble}>
                  <Text style={styles.typingText}>
                    {getFirstName(driverDisplayName)} is typing…
                  </Text>
                </View>
              </View>
            ) : null
          }
        />

        <ActionChips
          onPickUp={() => setMessage("I’m at the pickup point.")}
          onCall={handleCall}
          onLate={() => setMessage("I’m running a bit late.")}
        />

        <InputBar
          value={message}
          onChange={setMessage}
          onSend={sendChat}
          disabled={!message.trim() || sending}
          onMic={() =>
            flashMessageRef.current?.showMessage({ type: "info", message: "Voice message (coming soon)." })
          }
          onLocation={() =>
            flashMessageRef.current?.showMessage({ type: "info", message: "Share location (coming soon)." })
          }
          bottomPad={Math.max(insets.bottom, 16)}
          keyboardOffset={keyboardOffset}
        />
      </View>
    </>
  );
}

function DriverChatModal(props: Readonly<Props>) {
  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={props.onClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <DriverChatModalContent {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

export default memo(DriverChatModal);

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F7F8FA",
  },
  headerSafe: {
    backgroundColor: "#fff",
  },

  // ── hub header
  hubHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  driverCard: {
    marginTop: 8,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    position: "relative",
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#2D7A4F",
  },
  headerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#2D7A4F",
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#fff",
  },
  driverMeta: {
    flex: 1,
    minWidth: 0,
  },
  driverName: {
    fontSize: 16,
    fontFamily: "RobotoBold",
    color: "#111827",
  },
  driverSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  ratingText: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
    color: "#111827",
  },
  vehicleText: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#6B7280",
    flex: 1,
    minWidth: 0,
  },
  statusInline: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
    color: "#2D7A4F",
    marginTop: 6,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  sosBtn: {
    paddingHorizontal: 10,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  sosText: {
    fontSize: 12,
    fontFamily: "RobotoBold",
    color: "#fff",
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },

  // ── lightweight status bar
  statusBarLite: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusBarText: {
    fontSize: 13,
    fontFamily: "RobotoBold",
  },
  statusBarEta: {
    marginLeft: 8,
    fontSize: 12,
    fontFamily: "RobotoMedium",
  },

  // ── ride summary card
  rideCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    padding: 14,
  },
  rideTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ridePin: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
  },
  rideTitle: {
    fontSize: 11,
    fontFamily: "RobotoRegular",
    color: "#6B7280",
    marginBottom: 2,
  },
  rideValue: {
    fontSize: 13,
    fontFamily: "RobotoMedium",
    color: "#111827",
    lineHeight: 18,
  },
  viewMapBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F0F9F4",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  viewMapText: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
    color: "#2D7A4F",
  },
  rideDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 12,
  },
  rideBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rideMiniRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rideMiniText: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#374151",
  },

  // ── scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scrollCentered: {
    flexGrow: 1,
    justifyContent: "center",
  },

  // ── loading
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  inlineLoaderRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  inlineLoaderText: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#6B7280",
  },

  // ── date separator
  dateSeparator: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#9CA3AF",
    marginBottom: 10,
    marginTop: 6,
  },

  // ── system messages
  systemRow: {
    alignItems: "center",
    marginVertical: 6,
  },
  systemPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  systemText: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
    color: "#1D4ED8",
  },

  // ── empty state
  emptyWrap: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#EBF5EE",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "RobotoBold",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "RobotoRegular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },

  // ── messages
  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 4,
  },
  msgRowOwner: {
    justifyContent: "flex-end",
  },
  msgRowOther: {
    justifyContent: "flex-start",
  },
  avatarSlot: {
    width: 32,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  msgAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2D7A4F",
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleWrapOwner: {
    alignItems: "flex-end",
    maxWidth: "75%",
  },
  bubbleWrapOther: {
    alignItems: "flex-start",
    maxWidth: "75%",
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  bubbleOwner: {
    backgroundColor: "#2D7A4F",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    // subtle shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "RobotoRegular",
  },
  bubbleTextOwner: {
    color: "#fff",
  },
  bubbleTextOther: {
    color: "#111827",
  },
  timeText: {
    fontSize: 11,
    fontFamily: "RobotoRegular",
    color: "#9CA3AF",
    marginTop: 3,
    marginHorizontal: 4,
  },
  timeOwner: {
    textAlign: "right",
  },
  timeOther: {
    textAlign: "left",
  },
  checkmark: {
    fontSize: 11,
  },

  typingRow: {
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  typingBubble: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  typingText: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#6B7280",
  },

  // ── action chips (subtle)
  chipsWrap: {
    marginTop: 4,
    paddingBottom: 6,
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 10,
    paddingRight: 24,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "#F0F9F4",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  chipText: {
    fontSize: 13,
    fontFamily: "RobotoMedium",
    color: "#111827",
  },

  // ── input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  iconPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  inputField: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 10,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  textInput: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    fontFamily: "RobotoRegular",
    color: "#111827",
  },
  inputIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#2D7A4F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  sendBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
});
