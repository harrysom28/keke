import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";
import apiClient from "@/utils/apiClient";
import {
  decrementUnreadCount,
  setAppData,
  setUnreadCount,
} from "@/store/AppSlice";

type InboxNotification = {
  id: string;
  notification_id: string;
  title: string;
  message: string;
  is_read: boolean;
  delivered_at?: string;
  created_at?: string;
  related_ride_id?: string | null;
  screen?: string;
  action_type?: string;
  action_payload?: Record<string, unknown> | null;
  category?: string;
  /** Semantic event key (e.g. fare_received, chat_message) */
  event_key?: string;
  /** Legacy: API sometimes maps event_key into `type` */
  type?: string;
};

type TabId = "all" | "earnings" | "trips" | "messages";

type Props = {
  userId: string;
  isDriver?: boolean;
};

const EMPTY_INCOMING: InboxNotification[] = [];

const startOfLocalDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());

const dateBucket = (iso?: string): "today" | "yesterday" | "older" => {
  if (!iso) return "older";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "older";
  const t0 = startOfLocalDay(new Date());
  const tD = startOfLocalDay(d);
  const diffDays = Math.round(
    (t0.getTime() - tD.getTime()) / (86400 * 1000)
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "older";
};

const inferTab = (item: InboxNotification): TabId => {
  const c = item.category;
  if (c === "earnings" || c === "trips" || c === "messages") return c;
  const ek = String(item.event_key || item.type || "");
  if (ek === "chat_message") return "messages";
  if (ek === "wallet_funded" || ek === "fare_received") return "earnings";
  return "trips";
};

const formatTimestamp = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  if (startOfLocalDay(d).getTime() === startOfLocalDay(now).getTime()) {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function NotificationInbox({ userId, isDriver = false }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const incomingNotifications = useSelector(
    (s: { App: { incomingNotifications?: typeof EMPTY_INCOMING } }) =>
      s?.App?.incomingNotifications ?? EMPTY_INCOMING
  );

  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setLocalUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<InboxNotification | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [tab, setTab] = useState<TabId>("all");

  const fetchUnreadCount = useCallback(async () => {
    const { data } = await apiClient.get("notifications/unread-count");
    const count = Number(data?.data?.count || 0);
    setLocalUnreadCount(count);
    dispatch(setUnreadCount(count));
  }, [dispatch]);

  const fetchNotifications = useCallback(
    async (nextPage = 1, replace = false) => {
      const category = tab === "all" ? "all" : tab;
      const { data } = await apiClient.get("notifications", {
        params: { page: nextPage, limit: 20, category },
      });

      const payload = data?.data || {};
      const nextNotifications = Array.isArray(payload.notifications)
        ? payload.notifications
        : [];

      setNotifications((current) =>
        replace ? nextNotifications : [...current, ...nextNotifications]
      );
      setPage(Number(payload.pagination?.page || nextPage));
      setPages(Number(payload.pagination?.pages || 1));
      const nextUnread = Number(payload.unread_count || 0);
      setLocalUnreadCount(nextUnread);
      dispatch(setUnreadCount(nextUnread));
    },
    [dispatch, tab]
  );

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await Promise.all([fetchNotifications(1, true), fetchUnreadCount()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, tab, fetchNotifications, fetchUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      fetchUnreadCount();
    }, [fetchUnreadCount])
  );

  const mergedList = useMemo(() => {
    const seen = new Set(notifications.map((n) => n.notification_id));
    const incoming = (incomingNotifications || []).filter(
      (n) => !seen.has(n.notification_id)
    );
    const mapped: InboxNotification[] = incoming.map((n) => ({
      id: n.notification_id,
      notification_id: n.notification_id,
      title: n.title,
      message: n.message,
      is_read: n.is_read,
      delivered_at: n.created_at,
      created_at: n.created_at,
      related_ride_id: n.related_ride_id ?? null,
      screen: undefined,
      action_type: undefined,
      action_payload: null,
      event_key: n.type,
    }));
    const merged = [...mapped, ...notifications];
    if (tab === "all") return merged;
    return merged.filter((n) => inferTab(n) === tab);
  }, [notifications, incomingNotifications, tab]);

  const sections = useMemo(() => {
    const buckets: Record<"today" | "yesterday" | "older", InboxNotification[]> =
      { today: [], yesterday: [], older: [] };
    for (const item of mergedList) {
      const when = item.delivered_at || item.created_at;
      buckets[dateBucket(when)].push(item);
    }
    const out: { title: string; data: InboxNotification[] }[] = [];
    if (buckets.today.length)
      out.push({ title: "Today", data: buckets.today });
    if (buckets.yesterday.length)
      out.push({ title: "Yesterday", data: buckets.yesterday });
    if (buckets.older.length) out.push({ title: "Older", data: buckets.older });
    return out;
  }, [mergedList]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchNotifications(1, true), fetchUnreadCount()]);
    } finally {
      setRefreshing(false);
    }
  }, [fetchNotifications, fetchUnreadCount]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || loading || page >= pages) {
      return;
    }

    setLoadingMore(true);
    try {
      await fetchNotifications(page + 1, false);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchNotifications, loading, loadingMore, page, pages]);

  const markOneRead = useCallback(
    async (item: InboxNotification) => {
      if (item.is_read) {
        return;
      }
      const id = item.id;
      const isMongoId = /^[a-f0-9A-F]{24}$/.test(id);
      if (isMongoId) {
        try {
          await apiClient.patch(`notifications/${id}/read`);
        } catch {
          // FCM-only id may not exist in UserNotification yet
        }
      }
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === item.id
            ? { ...notification, is_read: true }
            : notification
        )
      );
      setLocalUnreadCount((current) => Math.max(0, current - 1));
      dispatch(decrementUnreadCount());
    },
    [dispatch]
  );

  const markEverythingRead = useCallback(async () => {
    await apiClient.patch("notifications/read-all");
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true }))
    );
    setLocalUnreadCount(0);
    dispatch(setUnreadCount(0));
  }, [dispatch]);

  const openWallet = useCallback(() => {
    const path = isDriver
      ? "/(driver)/(tabs)/(profile)/wallet"
      : "/(app)/(tabs)/(profile)/wallet";
    router.push(path as any);
  }, [isDriver]);

  const openRideDetails = useCallback((rideId: string) => {
    router.push({
      pathname: "/(app)/ride-details",
      params: { rideId: String(rideId) },
    });
  }, []);

  const openChat = useCallback(
    (rideId: string) => {
      dispatch(setAppData({ pendingOpenChatRideId: String(rideId) }));
      if (isDriver) {
        router.push("/(driver)/(tabs)/(dashboard)/home-map");
      } else {
        router.push("/(app)/(tabs)/(home)/home");
      }
    },
    [dispatch, isDriver]
  );

  const iconFor = (item: InboxNotification) => {
    const ek = String(item.event_key || item.type || "");
    if (ek === "chat_message") return "chatbubble-ellipses-outline" as const;
    if (ek === "wallet_funded" || ek === "fare_received")
      return "cash-outline" as const;
    if (/cancel/i.test(ek) || /cancelled/i.test(item.title))
      return "close-circle-outline" as const;
    return "car-outline" as const;
  };

  const buildActions = (item: InboxNotification) => {
    const rideId =
      item.related_ride_id ??
      (item.action_payload as { rideId?: string } | null)?.rideId;
    const ek = String(item.event_key || item.type || "");
    const actions: {
      key: string;
      label: string;
      icon: keyof typeof Ionicons.glyphMap;
      onPress: () => void;
    }[] = [];

    if (ek === "chat_message" && rideId) {
      actions.push({
        key: "chat",
        label: "Open chat",
        icon: "chatbubble-outline",
        onPress: () => {
          markOneRead(item);
          openChat(String(rideId));
        },
      });
      return actions;
    }

    if (ek === "wallet_funded" || ek === "fare_received") {
      actions.push({
        key: "wallet",
        label: "Wallet",
        icon: "wallet-outline",
        onPress: () => {
          markOneRead(item);
          openWallet();
        },
      });
      if (rideId) {
        actions.push({
          key: "trip",
          label: "Trip",
          icon: "document-text-outline",
          onPress: () => {
            markOneRead(item);
            openRideDetails(String(rideId));
          },
        });
      }
      return actions;
    }

    if (
      rideId &&
      (/cancel/i.test(ek) ||
        /ride_/.test(ek) ||
        item.screen === "ride" ||
        item.screen === "RideChat")
    ) {
      actions.push({
        key: "details",
        label: "Trip details",
        icon: "information-circle-outline",
        onPress: () => {
          markOneRead(item);
          openRideDetails(String(rideId));
        },
      });
    }

    if (rideId && actions.length === 0) {
      actions.push({
        key: "details",
        label: "Details",
        icon: "arrow-forward-circle-outline",
        onPress: () => {
          markOneRead(item);
          openRideDetails(String(rideId));
        },
      });
    }

    return actions;
  };

  const handleCardPress = useCallback(
    (item: InboxNotification) => {
      markOneRead(item);
      setSelected(item);
      setDetailOpen(true);
    },
    [markOneRead]
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setSelected(null);
  }, []);

  const runPrimaryFromModal = useCallback(() => {
    if (!selected) return;
    const actions = buildActions(selected);
    if (actions[0]) {
      closeDetail();
      actions[0].onPress();
    }
  }, [selected, closeDetail]);

  const tabs: { id: TabId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "earnings", label: "Earnings" },
    { id: "trips", label: "Trips" },
    { id: "messages", label: "Messages" },
  ];

  const renderItem = useCallback(
    ({ item }: { item: InboxNotification }) => {
      const icon = iconFor(item);
      const actions = buildActions(item);
      return (
        <Pressable
          style={styles.rowOuter}
          onPress={() => handleCardPress(item)}
        >
          <View
            style={[
              styles.dot,
              item.is_read ? styles.dotRead : styles.dotUnread,
            ]}
          />
          <View
            style={[
              styles.card,
              item.is_read ? styles.cardRead : styles.cardUnread,
            ]}
          >
            <View style={styles.cardTop}>
              <View style={styles.iconWrap}>
                <Ionicons name={icon} size={22} color="#2E7D52" />
              </View>
              <View style={styles.cardBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.timeText}>
                    {formatTimestamp(item.delivered_at || item.created_at)}
                  </Text>
                </View>
                <Text style={styles.subtitle} numberOfLines={3}>
                  {item.message}
                </Text>
                {actions.length > 0 ? (
                  <View style={styles.actionsRow}>
                    {actions.map((a) => (
                      <TouchableOpacity
                        key={a.key}
                        style={styles.actionChip}
                        onPress={() => {
                          a.onPress();
                        }}
                      >
                        <Ionicons
                          name={a.icon}
                          size={16}
                          color="#2E7D52"
                          style={styles.actionIcon}
                        />
                        <Text style={styles.actionLabel}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [handleCardPress]
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color="#2E7D52" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={[styles.header, { paddingHorizontal: 20 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markEverythingRead} style={styles.markAllButton}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.tabChip, active && styles.tabChipActive]}
              onPress={() => setTab(t.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.tabLabel,
                  active && styles.tabLabelActive,
                  Platform.OS === "android" ? { includeFontPadding: false } : null,
                ]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={
          sections.length === 0
            ? [
                styles.emptyList,
                { paddingBottom: 96 + insets.bottom, paddingHorizontal: 16 },
              ]
            : [
                styles.listContent,
                { paddingBottom: 96 + insets.bottom, paddingHorizontal: 16 },
              ]
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={46} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySubtitle}>
              {tab === "all"
                ? "Ride updates, earnings, and messages will show here"
                : `No ${tab} notifications yet`}
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2E7D52"
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color="#2E7D52" />
            </View>
          ) : null
        }
      />

      <Modal
        visible={detailOpen}
        transparent
        animationType="fade"
        onRequestClose={closeDetail}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeDetail} />
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(16, insets.bottom + 12) },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={3}>
                {selected?.title || "Notification"}
              </Text>
              <TouchableOpacity
                onPress={closeDetail}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalTime}>
              {formatTimestamp(selected?.delivered_at || selected?.created_at)}
            </Text>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={styles.modalMessage}>{selected?.message || ""}</Text>
            </ScrollView>
            {selected && buildActions(selected).length > 0 ? (
              <TouchableOpacity
                onPress={runPrimaryFromModal}
                style={styles.modalPrimaryButton}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {buildActions(selected)[0].label}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      <View
        style={[
          styles.unreadSummary,
          { bottom: Math.max(20, insets.bottom + 8) },
        ]}
      >
        <Text style={styles.unreadSummaryText}>
          {unreadCount > 0
            ? `${unreadCount} unread`
            : "You're all caught up"}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 10,
    minHeight: 48,
    backgroundColor: "#FFFFFF",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "left",
  },
  markAllButton: {
    minWidth: 96,
    minHeight: 40,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingVertical: 4,
  },
  markAllText: {
    color: "#2E7D52",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "android" ? 10 : 9,
    paddingBottom: Platform.OS === "android" ? 10 : 11,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    marginRight: 8,
    justifyContent: "center",
  },
  tabChipActive: {
    backgroundColor: "#DCFCE7",
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
    lineHeight: 20,
  },
  tabLabelActive: {
    color: "#166534",
  },
  listContent: {
    paddingTop: 8,
  },
  emptyList: {
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "800",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  rowOuter: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 18,
    marginRight: 10,
  },
  dotUnread: {
    backgroundColor: "#2E7D52",
  },
  dotRead: {
    backgroundColor: "#D1D5DB",
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
  },
  cardUnread: {
    backgroundColor: "#F0FFF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  cardRead: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
  },
  timeText: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 96,
    textAlign: "right",
  },
  subtitle: {
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  actionIcon: {
    marginRight: 4,
  },
  actionLabel: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "700",
  },
  footerLoader: {
    paddingVertical: 20,
  },
  unreadSummary: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 6,
  },
  unreadSummaryText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  modalTime: {
    marginTop: 6,
    marginBottom: 12,
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
  },
  modalBody: {
    maxHeight: 360,
  },
  modalBodyContent: {
    flexGrow: 0,
    paddingBottom: 12,
  },
  modalMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: "#111827",
    fontWeight: "500",
  },
  modalPrimaryButton: {
    marginTop: 10,
    backgroundColor: "#2E7D52",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 48,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
  },
});
