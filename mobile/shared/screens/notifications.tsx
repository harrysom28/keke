import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Svg, { ClipPath, Defs, G, Mask, Path, Rect } from "react-native-svg";

import { AppContext } from "@/app/context";
import EmptyData from "@/components/emptyData";
import {
  GET_NOTIFICATIONS,
  MARK_NOTIFICATION_READ,
  MARK_ALL_NOTIFICATIONS_READ,
  DELETE_NOTIFICATION,
} from "@/constants";
import { Portal } from "@gorhom/portal";
import apiClient from "@/utils/apiClient";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface NotificationItem {
  notification_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  related_ride_id?: string | null;
  related_payment_id?: string | null;
}

interface LProps {
  item: NotificationItem;
  showModal: (item: NotificationItem) => void;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const ListItem = ({ item, showModal, onMarkAsRead, onDelete }: LProps) => {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "ride_completed":
      case "payment_completed":
      case "account_verified":
        return "SUCCESS";
      case "ride_cancelled":
      case "driver_cancelled":
      case "payment_failed":
        return "CANCELLED";
      case "promo_code":
        return "PROMOTION";
      case "payment_completed":
      case "ride_requested":
        return "TRANSACTION";
      default:
        return "SUCCESS";
    }
  };

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case "SUCCESS":
        return (
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37256 18.6274 0 12 0C5.37256 0 0 5.37256 0 12C0 18.6274 5.37256 24 12 24ZM18.7803 9.30212L10.1553 17.784C9.86242 18.072 9.38758 18.072 9.09466 17.7839L4.21966 12.9898C3.92678 12.7018 3.92678 12.2348 4.21966 11.9468L5.2803 10.9038C5.57322 10.6158 6.04811 10.6158 6.34098 10.9038L9.625 14.1333L16.659 7.21605C16.9519 6.92798 17.4268 6.92798 17.7197 7.21605L18.7803 8.25908C19.0732 8.5471 19.0732 9.01411 18.7803 9.30212Z"
              fill="#3C8F7C"
            />
          </Svg>
        );
      case "PROMOTION":
        return (
          <Svg width="30" height="30" viewBox="0 0 30 30" fill="none">
            <Mask
              id="mask0_271_24040"
              maskUnits="userSpaceOnUse"
              x="3"
              y="6"
              width="24"
              height="18"
            >
              <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M27 12C27 12.2764 26.7764 12.5 26.5 12.5C25.1216 12.5 24 13.6216 24 15C24 16.3784 25.1216 17.5 26.5 17.5C26.7764 17.5 27 17.7236 27 18V22C27 23.103 26.103 24 25 24H5.00002C3.89695 24 3 23.103 3 22V18C3 17.7236 3.22364 17.5 3.50002 17.5C4.87842 17.5 6 16.3784 6 15C6 13.6216 4.87842 12.5 3.50002 12.5C3.22364 12.5 3 12.2764 3 12V8.00002C3 6.89695 3.89695 6 5.00002 6H25C26.103 6 27 6.89695 27 8.00002V12ZM9.49997 22C9.77634 22 9.99998 21.7764 9.99998 21.5V20.5C9.99998 20.2237 9.77634 20 9.49997 20C9.22359 20 8.99995 20.2237 8.99995 20.5V21.5C8.99995 21.7764 9.22359 22 9.49997 22ZM9.99998 17.5C9.99998 17.7764 9.77634 18 9.49997 18C9.22359 18 8.99995 17.7764 8.99995 17.5V16.5C8.99995 16.2236 9.22359 16 9.49997 16C9.77634 16 9.99998 16.2236 9.99998 16.5V17.5ZM9.49997 14C9.77634 14 9.99998 13.7764 9.99998 13.5V12.5C9.99998 12.2236 9.77634 12 9.49997 12C9.22359 12 8.99995 12.2236 8.99995 12.5V13.5C8.99995 13.7764 9.22359 14 9.49997 14ZM9.99998 9.50002C9.99998 9.77639 9.77634 10 9.49997 10C9.22359 10 8.99995 9.77639 8.99995 9.50002V8.37502C8.99995 8.09864 9.22359 7.875 9.49997 7.875C9.77634 7.875 9.99998 8.09864 9.99998 8.37502V9.50002ZM14 10C12.897 10 12 11.1216 12 12.5C12 13.8784 12.897 15 14 15C15.103 15 16 13.8784 16 12.5C16 11.1216 15.1031 10 14 10ZM13.4995 20C13.4043 20 13.3081 19.9727 13.2227 19.916C12.9927 19.7627 12.9307 19.4527 13.084 19.2226L19.084 10.2226C19.2368 9.99267 19.5459 9.93066 19.7774 10.084C20.0074 10.2373 20.0694 10.5473 19.9161 10.7774L13.9161 19.7774C13.8198 19.9219 13.6612 20 13.4995 20ZM17 17.5C17 18.8784 17.897 20 19 20C20.103 20 21 18.8784 21 17.5C21 16.1216 20.103 15 19 15C17.897 15 17 16.1216 17 17.5Z"
                fill="white"
              />
            </Mask>
            <G mask="url(#mask0_271_24040)">
              <Rect width="30" height="30" fill="#3C8F7C" />
            </G>
          </Svg>
        );
      case "CANCELLED":
        return (
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M0 12C0 5.37321 5.37321 0 12 0C18.6268 0 24 5.37321 24 12C24 18.6268 18.6268 24 12 24C5.37321 24 0 18.6268 0 12ZM17.925 16.3446C17.925 16.2321 17.8821 16.125 17.8018 16.0446L13.7518 11.9786L17.8179 7.96071C17.9839 7.79464 17.9839 7.52143 17.8179 7.35536L16.6607 6.19286C16.5804 6.1125 16.4732 6.06964 16.3607 6.06964C16.2482 6.06964 16.1411 6.1125 16.0607 6.19286L12.0054 10.1946L7.95 6.19286C7.86964 6.1125 7.7625 6.06964 7.65 6.06964C7.5375 6.06964 7.43036 6.1125 7.35 6.19286L6.19286 7.35536C6.02679 7.52143 6.02679 7.79464 6.19286 7.96071L10.2589 11.9786L6.20357 16.05C6.12321 16.125 6.08036 16.2375 6.08036 16.35C6.08036 16.4625 6.12321 16.5696 6.20357 16.65L7.36071 17.8125C7.44107 17.8929 7.55357 17.9357 7.66071 17.9357C7.76786 17.9357 7.88036 17.8982 7.96071 17.8125L12 13.7571L16.0446 17.8071C16.125 17.8875 16.2375 17.9304 16.3446 17.9304C16.4518 17.9304 16.5589 17.8929 16.6446 17.8071L17.8018 16.6446C17.8821 16.5696 17.925 16.4571 17.925 16.3446Z"
              fill="#F31717"
            />
          </Svg>
        );
      case "TRANSACTION":
        return (
          <Svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M0 4C0 1.79086 1.79086 0 4 0H15.8C18.0091 0 19.8 1.79086 19.8 4V4.38009C20.905 4.38009 22 5.48172 22 6.57014V20.03C22 21.1184 21.105 22 20 22H3C1.343 22 0 20.6771 0 19.045V4.38009V4ZM16 13.0407C16 14.1407 16.895 15.0317 18 15.0317C19.105 15.0317 20 14.1407 20 13.0407C20 11.9407 19.105 11.0498 18 11.0498C16.895 11.0498 16 11.9407 16 13.0407ZM3.7 2.19005C2.87157 2.19005 2.2 2.86162 2.2 3.69005V4.38009H17.6V3.69005C17.6 2.86162 16.9284 2.19005 16.1 2.19005H3.7Z"
              fill="#3C8F7C"
            />
          </Svg>
        );
      default:
        return (
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 24C18.6274 24 24 18.6274 24 12C24 5.37256 18.6274 0 12 0C5.37256 0 0 5.37256 0 12C0 18.6274 5.37256 24 12 24ZM18.7803 9.30212L10.1553 17.784C9.86242 18.072 9.38758 18.072 9.09466 17.7839L4.21966 12.9898C3.92678 12.7018 3.92678 12.2348 4.21966 11.9468L5.2803 10.9038C5.57322 10.6158 6.04811 10.6158 6.34098 10.9038L9.625 14.1333L16.659 7.21605C16.9519 6.92798 17.4268 6.92798 17.7197 7.21605L18.7803 8.25908C19.0732 8.5471 19.0732 9.01411 18.7803 9.30212Z"
              fill="#3C8F7C"
            />
          </Svg>
        );
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      });
    } catch {
      return "";
    }
  };

  const iconType = getNotificationIcon(item.type);

  return (
    <TouchableOpacity
      onPress={() => showModal(item)}
      style={tw.style(
        `flex-row items-center gap-x-2.5 px-4 bg-white rounded-lg mb-3`,
        !item.is_read && `bg-green-50 border-l-4 border-base-green`,
        {
          shadowColor: "#000",
          shadowOffset: {
            width: 0,
            height: 2,
          },
          shadowOpacity: 0.1,
          shadowRadius: 3.84,
          elevation: 2,
        }
      )}
    >
      <View
        style={tw`flex-col items-center justify-center h-[45px] w-[45px] bg-[#F1F1F1] rounded-full`}
      >
        {renderIcon(iconType)}
      </View>
      <View style={tw`flex-1 py-3`}>
        <View style={tw`flex-row items-start justify-between mb-1`}>
          <Text
            style={tw.style(`text-base text-[#242E42] flex-1`, {
              fontFamily: "RobotoBold",
            })}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          {!item.is_read && (
            <View
              style={tw`h-2 w-2 bg-base-green rounded-full ml-2 mt-1`}
            />
          )}
        </View>
        <Text
          numberOfLines={2}
          style={tw.style(`text-sm text-[#8F92A1] mb-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {item.message}
        </Text>
        <View style={tw`flex-row items-center justify-between mt-1`}>
          <Text
            style={tw.style(`text-xs text-[#B8B8B8]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {formatDate(item.created_at)}
          </Text>
          <View style={tw`flex-row gap-x-3`}>
            {!item.is_read && (
              <TouchableOpacity
                onPress={() => onMarkAsRead(item.notification_id)}
                style={tw`px-2 py-1`}
              >
                <Text
                  style={tw.style(`text-xs text-base-green`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Mark read
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => onDelete(item.notification_id)}
              style={tw`px-2 py-1`}
            >
              <Ionicons name="trash-outline" size={16} color="#F31717" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

interface ICurrent extends NotificationItem {}

const SharedNotificationsScreen = () => {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [current, setCurrent] = useState<ICurrent | null>(null);
  const { apiConfig, getCurrentUser } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  let isFocused = useIsFocused();

  const fetchNotifications = async () => {
    try {
      const { data: response } = await apiClient.get("user/notifications", {
        params: { limit: 50 },
      });

      if (response?.data) {
        const notifications = response.data.notifications || [];
        setData(Array.isArray(notifications) ? notifications : []);
        setUnreadCount(response.data.unread_count || 0);
      }
    } catch (error: any) {
      console.log("Error fetching notifications:", error);
      setData([]);
      if (error?.response?.data?.message) {
        showMessage({
          type: "danger",
          message: error.response.data.message,
        });
      }
    }
  };

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [isFocused]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleMarkAsRead = async (id: string) => {
    try {
      await apiClient.patch(`${MARK_NOTIFICATION_READ}${id}/read`);
      setData((prev) =>
        prev.map((item) =>
          item.notification_id === id ? { ...item, is_read: true } : item
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      showMessage({
        type: "success",
        message: "Notification marked as read",
      });
    } catch (error: any) {
      console.log("Error marking notification as read:", error);
      if (error?.response?.data?.message) {
        showMessage({
          type: "danger",
          message: error.response.data.message,
        });
      }
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiClient.patch(MARK_ALL_NOTIFICATIONS_READ);
      setData((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadCount(0);
      showMessage({
        type: "success",
        message: "All notifications marked as read",
      });
    } catch (error: any) {
      console.log("Error marking all as read:", error);
      if (error?.response?.data?.message) {
        showMessage({
          type: "danger",
          message: error.response.data.message,
        });
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient.delete(`${DELETE_NOTIFICATION}${id}`);
      setData((prev) => prev.filter((item) => item.notification_id !== id));
      showMessage({
        type: "success",
        message: "Notification deleted",
      });
    } catch (error: any) {
      console.log("Error deleting notification:", error);
      if (error?.response?.data?.message) {
        showMessage({
          type: "danger",
          message: error.response.data.message,
        });
      }
    }
  };

  const showModal = (item: NotificationItem) => {
    setCurrent(item);
    bottomSheetRef?.current?.expand();
    // Auto-mark as read when opened
    if (!item.is_read) {
      handleMarkAsRead(item.notification_id);
    }
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        style={[
          { backgroundColor: "#1919194D" },
          StyleSheet.absoluteFillObject,
        ]}
      />
    ),
    []
  );

  return (
    <>
      <ImageBackground
        style={tw.style(`bg-white`, { flex: 1 })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={tw.style(`flex-row items-end px-6 h-32 bg-base-green py-5`, {
            paddingTop: StatusBar.currentHeight,
          })}
        >
          <View style={tw`flex-row justify-between items-center w-full`}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={tw`bg-black rounded-full p-1`}
            >
              <Ionicons name="arrow-back-outline" size={24} color="white" />
            </TouchableOpacity>
            <Text
              style={tw.style(`text-2xl self-center text-white`, {
                fontFamily: "RobotoBold",
              })}
            >
              Notifications
            </Text>
            {unreadCount > 0 && (
              <TouchableOpacity
                onPress={handleMarkAllAsRead}
                style={tw`bg-white/20 px-3 py-1 rounded-full`}
              >
                <Text
                  style={tw.style(`text-sm text-white`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Mark all read
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {unreadCount > 0 && (
          <View style={tw`bg-base-green/10 px-6 py-2`}>
            <Text
              style={tw.style(`text-sm text-base-green text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {loading && !refreshing ? (
          <View style={tw`flex-1 justify-center items-center`}>
            <ActivityIndicator color={tw.color("base-green")} size="large" />
          </View>
        ) : !data || data.length === 0 ? (
          <View style={tw`flex-1 justify-center items-center px-6`}>
            <EmptyData />
            <Text
              style={tw.style(`text-base text-[#8F92A1] mt-4 text-center`, {
                fontFamily: "RobotoRegular",
              })}
            >
              No notifications yet
            </Text>
          </View>
        ) : (
          <FlatList
            data={data}
            keyExtractor={(item) => item.notification_id}
            renderItem={({ item }) => (
              <ListItem
                item={item}
                showModal={showModal}
                onMarkAsRead={handleMarkAsRead}
                onDelete={handleDelete}
              />
            )}
            contentContainerStyle={tw`px-6 py-4`}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={tw.color("base-green")}
              />
            }
          />
        )}
      </ImageBackground>

      <Portal>
        <BottomSheet
          index={-1}
          snapPoints={["50%"]}
          ref={bottomSheetRef}
          backdropComponent={renderBackdrop}
          handleComponent={() => (
            <BottomSheetView
              style={tw.style(
                `flex-row items-center bg-[#F6F6F6] w-[99%] py-3 rounded-t-[16px]`,
                {
                  shadowColor: "#000",
                  shadowOffset: {
                    width: 0,
                    height: 3,
                  },
                  shadowOpacity: 0.25,
                  shadowRadius: 2.84,
                  elevation: 5,
                }
              )}
            >
              <Text
                style={tw.style(
                  `basis-[85%] pl-10 text-center text-[17px] text-[#242E42]`,
                  {
                    fontFamily: "RobotoBold",
                  }
                )}
              >
                {current?.title || "Notification"}
              </Text>
              <TouchableOpacity
                onPress={() => bottomSheetRef?.current?.close()}
                style={tw`h-[39px] basis-[39px] flex-col items-center justify-center bg-black p-1 rounded-full`}
              >
                <AntDesign name="close" size={24} color="white" />
              </TouchableOpacity>
            </BottomSheetView>
          )}
          style={tw`px-4 pt-4 rounded-t-[40px]`}
          enablePanDownToClose
        >
          <BottomSheetView style={tw`mt-6 px-4 pb-8`}>
            <Text
              style={tw.style(`text-base text-[#242E42] leading-6`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {current?.message || ""}
            </Text>
            {current?.created_at && (
              <Text
                style={tw.style(`text-xs text-[#B8B8B8] mt-4`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {new Date(current.created_at).toLocaleString()}
              </Text>
            )}
            {current?.related_ride_id && (
              <TouchableOpacity
                onPress={() => {
                  bottomSheetRef?.current?.close();
                  router.push("/rides");
                }}
                style={tw`bg-base-green py-3 rounded-lg mt-4`}
              >
                <Text
                  style={tw.style(`text-center text-white`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  View Ride Details
                </Text>
              </TouchableOpacity>
            )}
          </BottomSheetView>
        </BottomSheet>
      </Portal>
    </>
  );
};

export default SharedNotificationsScreen;
