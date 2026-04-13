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

// ─── MessageItem ─────────────────────────────────────────────────────────────

interface MProps {
  isOwner: boolean;
  item: {
    message: string;
    created_at?: string;
    createdAt?: string;
    date?: string;
  };
  showAvatar: boolean;
  driverImage?: string;
}

const MessageItem = ({ isOwner, item, showAvatar, driverImage }: MProps) => {
  const time = formatTime(
    item?.created_at || item?.createdAt || item?.date || ""
  );

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
            {isOwner && (
              <Text style={styles.checkmark}> ✓✓</Text>
            )}
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
  };
}

function DriverChatModalContent({ visible, onClose, data }: Readonly<Props>) {
  const insets = useCombinedSafeInsets();
  const { user } = useSelector(AuthState);
  const { apiConfig } = useContext(AppContext);
  const [chats, setChats] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
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
        {/* Top inset on white chrome only — avoids a gray band under status bar / notch */}
        <View style={[styles.headerSafe, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.backBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </TouchableOpacity>

            <View style={styles.headerMeta}>
              <View style={styles.avatarWrap}>
                {data?.image ? (
                  <Image source={{ uri: data.image }} style={styles.headerAvatar} />
                ) : (
                  <View style={styles.headerAvatarFallback}>
                    <Ionicons name="person" size={20} color="#fff" />
                  </View>
                )}
                <View style={styles.onlineDot} />
              </View>
              <View style={styles.headerTextBlock}>
                <Text style={styles.headerName} numberOfLines={1}>
                  {data?.name || "Driver"}
                </Text>
                <Text style={styles.headerStatus}>In your ride</Text>
              </View>
            </View>

            <View style={{ width: 40 }} />
          </View>

          <View style={styles.divider} />
        </View>

        {/* ── Messages ── */}
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#2D7A4F" />
          </View>
        ) : chats.length === 0 ? (
          <View style={[styles.scrollContent, styles.scrollCentered]}>
            <EmptyState name={data?.name} />
          </View>
        ) : (
          <FlatList
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            inverted={true}
            initialNumToRender={20}
            windowSize={5}
            removeClippedSubviews={true}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            data={[...chats].reverse()}
            keyExtractor={(item, index) =>
              String((item as any)?.message_id || (item as any)?._id || index)
            }
            ListFooterComponent={
              chats.length > 0 ? (
                <Text style={styles.dateSeparator}>
                  {formatSectionDate(
                    (chats[0] as any)?.created_at ||
                      (chats[0] as any)?.createdAt ||
                      (chats[0] as any)?.date ||
                      new Date()
                  )}
                </Text>
              ) : null
            }
            renderItem={({ item, index }) => {
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
          />
        )}

        {/* ── Input bar ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={keyboardOffset}
        >
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={1000}
              style={styles.textInput}
              placeholder="Message your driver…"
              placeholderTextColor="#9CA3AF"
              returnKeyType="send"
              onSubmitEditing={sendChat}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={sendChat}
              disabled={!message.trim() || sending}
              style={[
                styles.sendBtn,
                (!message.trim() || sending) && styles.sendBtnDisabled,
              ]}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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

  // ── header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
  headerMeta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  headerTextBlock: {
    alignItems: "center",
    minWidth: 0,
    maxWidth: "100%",
  },
  headerName: {
    fontSize: 16,
    fontFamily: "RobotoBold",
    color: "#111827",
    textAlign: "center",
  },
  headerStatus: {
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#22C55E",
    marginTop: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
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

  // ── date separator
  dateSeparator: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "RobotoRegular",
    color: "#9CA3AF",
    marginBottom: 16,
    marginTop: 4,
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
    color: "#2D7A4F",
    fontSize: 11,
  },

  // ── input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    gap: 10,
  },
  textInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    backgroundColor: "#F3F4F6",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 12 : 10,
    paddingBottom: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    fontFamily: "RobotoRegular",
    color: "#111827",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2D7A4F",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  sendBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
});
