import {
  ActivityIndicator,
  Alert,
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
import usePusherChannel from "@/hooks/usePusherChannel";
import apiClient from "@/utils/apiClient";

// Keep consistent with the rest of the app (ride-in-transit components)
const BRAND_GREEN = "#3C8F7C";

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

type RideDetailsResponse = {
  ride_id: string;
  status?: string;
  origin?: { name?: string | null; address?: string; lat?: number; lng?: number };
  destination?: { name?: string | null; address?: string; lat?: number; lng?: number };
  duration_min?: number;
  distance_km?: number;
  driver?: {
    name?: string | null;
    phone?: string | null;
    image?: string | null;
    vehicle_name?: string | null;
    vehicle_plate?: string | null;
  } | null;
  rider?: { name?: string | null; phone?: string | null } | null;
};

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
    pending?: boolean;
    failed?: boolean;
  };
  showAvatar: boolean;
  driverImage?: string;
}

const MessageItem = ({ isOwner, item, showAvatar, driverImage }: MProps) => {
  if (item?.kind === "date") {
    return null;
  }

  if (item?.kind === "system") {
    return (
      <View style={styles.systemRow}>
        <View style={styles.systemDivider} />
        <Text style={styles.systemText}>{item.message}</Text>
        <View style={styles.systemDivider} />
      </View>
    );
  }

  const time = formatTime(
    item?.created_at || item?.createdAt || item?.date || ""
  );

  const deliveryLabel =
    isOwner && item?.failed
      ? "Not sent"
      : isOwner && item?.pending
        ? "Sending…"
        : "";

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
          {(!!time || !!deliveryLabel) ? (
            <View style={styles.bubbleMetaRow}>
              {!!deliveryLabel ? (
                <Text
                  style={[
                    styles.deliveryText,
                    item?.failed ? styles.deliveryFailed : null,
                  ]}
                  numberOfLines={1}
                >
                  {deliveryLabel}
                </Text>
              ) : (
                <View />
              )}
              {!!time ? (
                <Text style={[styles.timeInBubble, isOwner ? styles.timeOwner : styles.timeOther]}>
                  {time}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

// ─── EmptyState ──────────────────────────────────────────────────────────────

const EmptyState = ({ name }: { name: string }) => (
  <View style={styles.emptyWrap}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name="chatbubble-ellipses-outline" size={36} color={BRAND_GREEN} />
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
                <Text style={styles.ratingText}>⭐ {rating.toFixed(1)}</Text>
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
              <Ionicons name="call" size={18} color={BRAND_GREEN} />
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
      <Ionicons name="radio-button-on" size={14} color={cfg.dot} />
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
          <Text style={styles.rideValue} numberOfLines={1}>
            {pickupLabel}
          </Text>
        </View>
        {onViewMap ? (
          <TouchableOpacity onPress={onViewMap} style={styles.viewMapBtn} activeOpacity={0.8}>
            <Text style={styles.viewMapText}>View map</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.rideBottom}>
        <View style={styles.rideMiniRow}>
          <Ionicons name="navigate-outline" size={16} color={BRAND_GREEN} />
          <Text style={styles.rideMiniText}>{directionLabel}</Text>
        </View>
        <View style={styles.rideMiniRow}>
          <Ionicons name="time-outline" size={16} color={BRAND_GREEN} />
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
  isDriverView,
}: {
  onPickUp: () => void;
  onCall: () => void;
  onLate: () => void;
  isDriverView: boolean;
}) {
  const actions = [
    {
      key: "pickup",
      label: isDriverView ? "I’m at pickup" : "I’m at pickup",
      icon: "navigate-outline" as const,
      onPress: onPickUp,
    },
    {
      key: "call",
      label: isDriverView ? "Call passenger" : "Call driver",
      icon: "call-outline" as const,
      onPress: onCall,
    },
    {
      key: "late",
      label: isDriverView ? "On my way" : "Running late",
      icon: "time-outline" as const,
      onPress: onLate,
    },
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
            <Ionicons name={a.icon as any} size={12} color={BRAND_GREEN} />
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
  placeholder,
}: {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  disabled: boolean;
  onMic: () => void;
  onLocation: () => void;
  bottomPad: number;
  placeholder: string;
}) {
  return (
    <View style={[styles.inputBar, { paddingBottom: bottomPad }]}>
      <View style={styles.inputField}>
        <TextInput
          value={value}
          onChangeText={onChange}
          multiline
          maxLength={1000}
          style={styles.textInput}
          placeholder={disabled ? "Sending…" : placeholder}
          placeholderTextColor="#9CA3AF"
          returnKeyType="send"
          onSubmitEditing={() => {
            if (!disabled) onSend();
          }}
          blurOnSubmit={false}
        />
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
  const [rideDetails, setRideDetails] = useState<RideDetailsResponse | null>(null);
  const flashMessageRef = useRef<FlashMessage | null>(null);
  const listRef = useRef<FlatList<any> | null>(null);
  const stickToBottomRef = useRef(true);
  const chatRefetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const channelName = data?.rideId ? `private.ride.${data.rideId}` : "";

  const scrollToBottom = useCallback((animated = true) => {
    stickToBottomRef.current = true;
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated });
    }, 350);
  }, []);

  const getAllChats = useCallback(() => {
    if (!data?.rideId) return;
    setLoading(true);
    apiClient
      .get(RETRIEVE_CHAT + data.rideId, apiConfig as any)
      .then(({ data: res }) => {
        const messages = res?.data?.messages || res?.data || [];
        setChats(messages);
        stickToBottomRef.current = true;
        scrollToBottom(false);
      })
      .catch((err) => {
        flashMessageRef.current?.showMessage({
          type: "danger",
          message: err?.response?.data?.message || "Could not load messages",
        });
      })
      .finally(() => setLoading(false));
  }, [data?.rideId, apiConfig, scrollToBottom]);

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

  const sendChat = async () => {
    if (!data?.rideId) {
      flashMessageRef.current?.showMessage({ type: "danger", message: "Ride ID is required" });
      return;
    }
    if (sending) return;
    const messageText = message.trim();
    if (!messageText) return;

    setSending(true);
    setMessage(""); // clear immediately for UX

    const localId = `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic = {
      message_id: localId,
      ride_id: data.rideId,
      message: messageText,
      created_at: new Date().toISOString(),
      is_sender: true,
      pending: true,
    };
    setChats((prev) => [...prev, optimistic]);
    scrollToBottom(true);

    try {
      const resp = await apiClient.post(
        CREATE_CHAT,
        { rideId: data.rideId, message: messageText },
        { ...(apiConfig as any), timeout: 20000 }
      );
      const payload = (resp as any)?.data;
      const serverMsg = payload?.data?.message || payload?.data;
      setChats((prev) => {
        const withoutOptimistic = prev.filter((m: any) => m?.message_id !== localId);
        return [...withoutOptimistic, serverMsg];
      });
      scrollToBottom(true);
    } catch (err: any) {
      // Restore message so user doesn't lose it
      setMessage(messageText);
      const msg = err?.response?.data?.message || err?.message || "";
      const isTimeout =
        err?.code === "ECONNABORTED" ||
        /timeout/i.test(String(msg));
      const friendly = msg?.includes("No driver assigned")
        ? "Wait for a driver to accept your ride first."
        : isTimeout
          ? "Network timeout. Please check your connection and try again."
          : "Failed to send message. Please try again.";

      setChats((prev) =>
        prev.map((m: any) =>
          m?.message_id === localId ? { ...m, pending: false, failed: true } : m
        )
      );
      Alert.alert("Message not sent", friendly, [{ text: "OK" }]);
    } finally {
      setSending(false);
    }
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

  useEffect(() => {
    let mounted = true;
    if (!visible || !data?.rideId) {
      setRideDetails(null);
      return;
    }

    (async () => {
      try {
        const res = await apiClient.get(`rides/${data.rideId}`);
        const ride = (res as any)?.data?.data?.ride as RideDetailsResponse | undefined;
        if (mounted) setRideDetails(ride || null);
      } catch {
        // non-blocking: chat still works even if ride details fail
        if (mounted) setRideDetails(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [visible, data?.rideId]);

  useEffect(
    () => () => {
      if (chatRefetchDebounceRef.current) {
        clearTimeout(chatRefetchDebounceRef.current);
        chatRefetchDebounceRef.current = null;
      }
    },
    []
  );

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

  const isDriverView = user?.profile?.role === "driver";

  const counterpartName =
    (isDriverView ? rideDetails?.rider?.name : rideDetails?.driver?.name) ||
    data?.name ||
    (isDriverView ? "Passenger" : "Driver");

  const counterpartPhone =
    (isDriverView ? rideDetails?.rider?.phone : rideDetails?.driver?.phone) || data?.phone || "";

  const counterpartImage = (isDriverView ? undefined : rideDetails?.driver?.image) || data?.image;

  const driverRating = typeof data?.rating === "number" ? data.rating : 4.8;
  const vehicleLabel = rideDetails?.driver?.vehicle_name || data?.vehicle || "Vehicle";
  const plateLabel = rideDetails?.driver?.vehicle_plate || data?.plate || "—";
  const statusText = "Arriving soon";

  const pickupLabel =
    rideDetails?.origin?.name ||
    rideDetails?.origin?.address ||
    "Pickup location";

  const dropoffLabel =
    rideDetails?.destination?.name ||
    rideDetails?.destination?.address ||
    "Destination";

  const directionLabel = isDriverView ? "Pickup → Dropoff" : "Driver → You";

  const etaLabel =
    typeof rideDetails?.duration_min === "number" && rideDetails.duration_min > 0
      ? `${Math.round(rideDetails.duration_min)} min`
      : "—";

  const renderableMessages = (() => {
    // Backend already returns oldest → newest for chat UI.
    const sys: any[] = [
      { kind: "system", message: statusText, createdAt: new Date().toISOString() },
    ];

    return [...sys, ...chats].map((it: any) => ({
      ...it,
      kind: it.kind || "chat",
      status: it.status || (it.is_sender ? "delivered" : undefined),
    }));
  })();

  const handleCall = () => {
    const num = String(counterpartPhone || "").trim();
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

  const inputPlaceholder = isDriverView ? "Message your passenger…" : "Message your driver…";

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

      <KeyboardAvoidingView
        style={[styles.root, { paddingLeft: insets.left, paddingRight: insets.right }]}
        behavior={Platform.OS === "ios" ? "padding" : "padding"}
        keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(insets.top, 12) + 8 : 0}
      >
        <DriverHeader
          insetsTop={insets.top}
          onBack={onClose}
          onCall={handleCall}
          onSOS={handleSOS}
          avatarUrl={counterpartImage}
          name={counterpartName}
          rating={driverRating}
          vehicleLine={
            isDriverView
              ? "Passenger"
              : `${vehicleLabel}${plateLabel && plateLabel !== "—" ? ` • ${plateLabel}` : ""}`
          }
          statusText={loading ? "Syncing…" : statusText}
        />

        <RideSummaryCard
          pickupLabel={isDriverView ? `${pickupLabel} → ${dropoffLabel}` : pickupLabel}
          directionLabel={directionLabel}
          etaLabel={etaLabel}
          onViewMap={handleViewMap}
        />

        {/* ── Messages ── */}
        <FlatList
          ref={listRef}
          onLayout={() => {
            stickToBottomRef.current = true;
            listRef.current?.scrollToEnd({ animated: false });
          }}
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            renderableMessages.length === 0 ? styles.scrollCentered : null,
          ]}
          inverted={false}
          initialNumToRender={20}
          windowSize={5}
          removeClippedSubviews={true}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => {
            const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
            // If list is shorter than the viewport, we consider it "at bottom".
            if (contentSize.height <= layoutMeasurement.height + 20) {
              stickToBottomRef.current = true;
              return;
            }
            const distanceFromBottom =
              contentSize.height - (contentOffset.y + layoutMeasurement.height);
            stickToBottomRef.current = distanceFromBottom < 80;
          }}
          scrollEventThrottle={16}
          data={renderableMessages}
          keyExtractor={(item, index) => {
            const anyItem = item as any;
            const baseId =
              anyItem?.message_id ||
              anyItem?._id ||
              anyItem?.id ||
              `${anyItem?.kind || "msg"}-${anyItem?.label || ""}`;
            const ts =
              anyItem?.createdAt ||
              anyItem?.created_at ||
              anyItem?.timestamp ||
              "";
            // Always include index to avoid collisions when backend reuses ids (or optimistic items duplicate).
            return `${String(baseId)}-${String(ts)}-${index}`;
          }}
          refreshing={false}
          onRefresh={getAllChats}
          ListEmptyComponent={
            <View style={{ width: "100%" }}>
              <EmptyState name={counterpartName} />
              {isInitialLoading ? (
                <View style={styles.inlineLoaderRow}>
                  <ActivityIndicator size="small" color={BRAND_GREEN} />
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

            // renderableMessages = [system, ...chats]; map list index to chats index
            const chatIndex = Math.max(0, index - 1);

            return (
              <MessageItem
                item={item}
                isOwner={isOwner}
                showAvatar={!isOwner && isLastInGroup(chatIndex)}
                  driverImage={counterpartImage}
              />
            );
          }}
          ListHeaderComponent={
            isTyping ? (
              <View style={styles.typingRow}>
                <View style={styles.typingBubble}>
                  <Text style={styles.typingText}>
                    {getFirstName(counterpartName)} is typing…
                  </Text>
                </View>
              </View>
            ) : null
          }
          onContentSizeChange={() => {
            if (stickToBottomRef.current) {
              listRef.current?.scrollToEnd({ animated: true });
            }
          }}
        />

        <ActionChips
          onPickUp={() => setMessage(isDriverView ? "I’m at the pickup point." : "I’m at the pickup point.")}
          onCall={handleCall}
          onLate={() => setMessage(isDriverView ? "I’m on my way." : "I’m running a bit late.")}
          isDriverView={isDriverView}
        />

        <InputBar
          value={message}
          onChange={setMessage}
          onSend={sendChat}
          disabled={sending || !message.trim()}
          onMic={() =>
            flashMessageRef.current?.showMessage({ type: "info", message: "Voice message (coming soon)." })
          }
          onLocation={() =>
            flashMessageRef.current?.showMessage({ type: "info", message: "Share location (coming soon)." })
          }
          bottomPad={Math.max(insets.bottom, 16)}
          placeholder={inputPlaceholder}
        />
      </KeyboardAvoidingView>
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
    // Light green tint to match brand while keeping chat readable
    backgroundColor: "#F2FBF7",
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
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#EDEDED",
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
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BRAND_GREEN,
  },
  headerAvatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND_GREEN,
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
    fontSize: 15,
    fontFamily: "RobotoMedium",
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
    fontFamily: "RobotoRegular",
    color: "#888",
  },
  vehicleText: {
    fontSize: 11,
    fontFamily: "RobotoRegular",
    color: "#888",
    flex: 1,
    minWidth: 0,
  },
  statusInline: {
    fontSize: 11,
    fontFamily: "RobotoMedium",
    color: BRAND_GREEN,
    marginTop: 2,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  sosBtn: {
    paddingHorizontal: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
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
    paddingVertical: 6,
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  statusDot: {
    width: 0,
    height: 0,
  },
  statusBarText: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
  },
  statusBarEta: {
    marginLeft: 8,
    fontSize: 12,
    fontFamily: "RobotoRegular",
  },

  // ── ride summary card
  rideCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 10,
    paddingHorizontal: 14,
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
  rideValue: {
    fontSize: 13,
    fontFamily: "RobotoMedium",
    color: "#111827",
    lineHeight: 18,
  },
  viewMapBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  viewMapText: {
    fontSize: 12,
    fontFamily: "RobotoMedium",
    color: BRAND_GREEN,
  },
  rideDivider: {
    height: 0,
    marginVertical: 0,
  },
  rideBottom: {
    marginTop: 8,
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
    color: "#666",
  },

  // ── scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginVertical: 8,
  },
  systemText: {
    fontSize: 11,
    fontFamily: "RobotoRegular",
    color: "#999",
  },
  systemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    flex: 1,
    maxWidth: 80,
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
    marginBottom: 2,
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
    backgroundColor: BRAND_GREEN,
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
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 5,
    borderRadius: 12,
  },
  bubbleOwner: {
    backgroundColor: BRAND_GREEN,
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
    fontSize: 14,
    lineHeight: 20,
    fontFamily: "RobotoRegular",
  },
  bubbleTextOwner: {
    color: "#fff",
  },
  bubbleTextOther: {
    color: "#111827",
  },
  timeText: {
    fontSize: 10,
    fontFamily: "RobotoRegular",
    color: "#9CA3AF",
    marginTop: 3,
    marginHorizontal: 4,
  },
  bubbleMetaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timeInBubble: {
    fontSize: 10,
    fontFamily: "RobotoRegular",
    color: "#9CA3AF",
  },
  deliveryText: {
    fontSize: 10,
    fontFamily: "RobotoMedium",
    color: "#6B7280",
  },
  deliveryFailed: {
    color: "#DC2626",
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
    gap: 6,
    paddingRight: 24,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#F0F9F4",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  chipText: {
    fontSize: 11,
    fontFamily: "RobotoMedium",
    color: "#111827",
  },

  // ── input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  sendBtnDisabled: {
    backgroundColor: "#ccc",
  },
});
