import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useDispatch, useSelector } from "react-redux";
import apiClient from "@/utils/apiClient";
import {
  decrementUnreadCount,
  setUnreadCount,
} from "@/store/AppSlice";
import { AppDetailsState } from "@/store/AppSlice";

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
};

type Props = {
  userId: string;
  isDriver?: boolean;
};

const formatRelativeTime = (value?: string) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
};

const WINDOW_HEIGHT = Dimensions.get("window").height;

export default function NotificationInbox({ userId, isDriver = false }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const { latest_notification } = useSelector(AppDetailsState);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setLocalUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<InboxNotification | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    const { data } = await apiClient.get("notifications/unread-count");
    const count = Number(data?.data?.count || 0);
    setLocalUnreadCount(count);
    dispatch(setUnreadCount(count));
  }, [dispatch]);

  const fetchNotifications = useCallback(
    async (nextPage = 1, replace = false) => {
      const { data } = await apiClient.get("notifications", {
        params: { page: nextPage, limit: 20 },
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
    [dispatch]
  );

  const loadInitial = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      await Promise.all([fetchNotifications(1, true), fetchUnreadCount()]);
    } finally {
      setLoading(false);
    }
  }, [fetchNotifications, fetchUnreadCount, userId]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const incomingId = latest_notification?.notification_id || latest_notification?.id;
    if (!incomingId) {
      return;
    }

    const nextNotification: InboxNotification = {
      id: String(latest_notification.id || incomingId),
      notification_id: String(incomingId),
      title: latest_notification.title || "Notification",
      message: latest_notification.message || "",
      is_read: false,
      delivered_at: latest_notification.delivered_at,
      created_at: latest_notification.delivered_at || new Date().toISOString(),
      related_ride_id: latest_notification.related_ride_id ?? latest_notification.ride_id ?? null,
      screen: latest_notification.screen,
      action_type: latest_notification.action_type,
      action_payload: latest_notification.action_payload ?? null,
    };

    let wasAdded = false;
    setNotifications((current) => {
      const alreadyExists = current.some(
        (notification) =>
          notification.id === nextNotification.id ||
          notification.notification_id === nextNotification.notification_id
      );
      if (alreadyExists) {
        return current;
      }
      wasAdded = true;
      return [nextNotification, ...current];
    });
    if (wasAdded) {
      setLocalUnreadCount((count) => count + 1);
    }
  }, [latest_notification]);

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
          // Ignore 404 for FCM-originated items not yet in UserNotification
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

  const handleNotificationPress = useCallback(
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

  const openRelated = useCallback(() => {
    if (!selected) return;
    const rideId =
      selected.related_ride_id ??
      (selected.action_payload as { rideId?: string } | null)?.rideId;
    if (rideId) {
      closeDetail();
      router.push({
        pathname: "/(app)/ride-details",
        params: { rideId: String(rideId) },
      });
    }
  }, [closeDetail, selected]);

  const markEverythingRead = useCallback(async () => {
    await apiClient.patch("notifications/read-all");
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, is_read: true }))
    );
    setLocalUnreadCount(0);
    dispatch(setUnreadCount(0));
  }, [dispatch]);

  const emptyState = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Ionicons name="notifications-outline" size={46} color="#9CA3AF" />
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptySubtitle}>
          Ride updates and alerts will appear here
        </Text>
      </View>
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: InboxNotification }) => (
      <Pressable style={styles.row} onPress={() => handleNotificationPress(item)}>
        <View
          style={[
            styles.readIndicator,
            item.is_read ? styles.readIndicatorRead : styles.readIndicatorUnread,
          ]}
        />
        <View
          style={[
            styles.card,
            item.is_read ? styles.cardRead : styles.cardUnread,
          ]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.timeText}>
              {formatRelativeTime(item.delivered_at || item.created_at)}
            </Text>
          </View>
          <Text style={styles.cardMessage} numberOfLines={2}>
            {item.message}
          </Text>
        </View>
      </Pressable>
    ),
    [handleNotificationPress]
  );

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator size="large" color="#2E7D52" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: 8,
            paddingHorizontal: 20,
          },
        ]}
      >
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

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          notifications.length === 0
            ? [
                styles.emptyList,
                { paddingBottom: 96 + insets.bottom, paddingHorizontal: 16 },
              ]
            : [
                styles.listContent,
                { paddingBottom: 96 + insets.bottom, paddingHorizontal: 16 },
              ]
        }
        ListEmptyComponent={emptyState}
        refreshing={refreshing}
        onRefresh={onRefresh}
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
              <Text style={styles.modalTitle} numberOfLines={2}>
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
              {formatRelativeTime(selected?.delivered_at || selected?.created_at)}
            </Text>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <Text style={styles.modalMessage}>{selected?.message || ""}</Text>
            </ScrollView>
            {(() => {
              const rideId =
                selected?.related_ride_id ??
                (selected?.action_payload as { rideId?: string } | null)?.rideId;
              const canOpenRide = Boolean(
                rideId &&
                  (selected?.screen === "ride" ||
                    selected?.action_type === "open_ride" ||
                    !selected?.screen)
              );
              if (!canOpenRide) return null;
              return (
                <TouchableOpacity onPress={openRelated} style={styles.modalPrimaryButton}>
                  <Text style={styles.modalPrimaryButtonText}>Open ride</Text>
                </TouchableOpacity>
              );
            })()}
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
            ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
            : "No unread notifications"}
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
    paddingBottom: 12,
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
    alignItems: "flex-end",
  },
  markAllText: {
    color: "#2E7D52",
    fontSize: 14,
    fontWeight: "700",
  },
  listContent: {
    paddingTop: 16,
  },
  emptyList: {
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 12,
  },
  readIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginTop: 16,
    marginRight: 12,
    borderWidth: 2,
  },
  readIndicatorUnread: {
    backgroundColor: "#2E7D52",
    borderColor: "#2E7D52",
  },
  readIndicatorRead: {
    backgroundColor: "#FFFFFF",
    borderColor: "#9CA3AF",
  },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
  },
  cardUnread: {
    backgroundColor: "#F0FFF4",
  },
  cardRead: {
    backgroundColor: "#FFFFFF",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  timeText: {
    color: "#6B7280",
    fontSize: 12,
  },
  cardMessage: {
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
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
    maxHeight: WINDOW_HEIGHT * 0.85,
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
    maxHeight: WINDOW_HEIGHT * 0.55,
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
