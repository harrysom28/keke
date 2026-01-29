import {
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AppDetailsState, setSubscriptionUtils } from "@/store/AppSlice";
import { CREATE_CHAT, RETRIEVE_CHAT } from "@/constants";
import React, { useContext, useEffect, useRef, useState } from "react";
import Svg, { Path } from "react-native-svg";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { AuthState } from "@/store/AuthSlice";
import FlashMessage from "react-native-flash-message";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import axios from "axios";
import tw from "@/lib/tailwind";
import usePusherChannel from "@/hooks/usePusherChannel";

interface MProps {
  isOwner: boolean;
  item: {
    message: string;
    date: string;
  };
  data: {
    id: string;
    name: string;
    image: string;
  };
}

const MessageItem = ({ isOwner = false, item, data }: MProps) => {
  return (
    <View style={tw`mb-1.5`}>
      <Pressable
        style={tw.style(
          isOwner ? `flex-row-reverse` : `flex-row`,
          `items-start gap-x-2 py-1`
        )}
      >
        {!isOwner && (
          <Image
            source={{
              uri: data?.image,
            }}
            style={tw`h-[40px] w-[40px] rounded-full border-2 border-base-green`}
          />
        )}
        <View
          style={tw.style(
            `max-w-[80%] px-4 py-3`,
            isOwner
              ? `bg-base-green rounded-l-[20px] rounded-br-[20px]`
              : `bg-[#E8E8E8] rounded-r-[20px] rounded-bl-[20px]`
          )}
        >
          <Text
            style={tw.style(
              `text-base leading-5`,
              isOwner ? `text-white` : `text-[#1F2937]`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
          >
            {item?.message}
          </Text>
        </View>
      </Pressable>
      <Text
        style={tw.style(
          `px-2 text-[#717171] text-xs mt-1`,
          isOwner ? `text-right` : `text-left pl-[52px]`,
          { fontFamily: "RobotoRegular" }
        )}
      >
        {item?.date}
      </Text>
    </View>
  );
};

interface Props {
  visible: boolean;
  onClose: () => void;
  data: {
    id: string; // user_id (for display)
    rideId?: string; // ride_id (for API calls)
    name: string;
    image: string;
  };
}

export default function DriverChatModal({
  visible,
  onClose,
  data,
}: Readonly<Props>) {
  const dispatch = useDispatch();
  const { user } = useSelector(AuthState);
  const { subscription } = useSelector(AppDetailsState);
  const { apiConfig } = useContext(AppContext);
  const [chats, setChats] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const flashMessageRef = useRef<FlashMessage | null>(null);

  // Use ride-specific channel if rideId is available
  const channelName = data?.rideId ? `private-ride-${data.rideId}` : null;

  usePusherChannel({
    channel: channelName || 'private-chat', // Fallback to prevent errors
    visible: visible && !subscription.chat && !!data?.rideId && !!channelName,
    onSubscriptionSucceeded: () => {
      dispatch(setSubscriptionUtils({ chat: true }));
    },
    onEvent: (event) => {
      console.log(`Event received: ${event}`);
      if (event?.data) {
        setChats((prev) => [...prev, event.data]);
      }
    },
  });

  const sendChat = () => {
    if (!data?.rideId) {
      flashMessageRef.current?.showMessage({
        type: "danger",
        message: "Ride ID is required to send messages",
      });
      return;
    }

    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      flashMessageRef.current?.showMessage({
        type: "warning",
        message: "Please enter a message",
      });
      return;
    }

    setSending(true);
    axios
      .post(CREATE_CHAT, { rideId: data.rideId, message: trimmedMessage }, apiConfig)
      .then(({ data }) => {
        setChats((prev) => [...prev, data?.data?.message || data?.data]);
        setMessage("");
      })
      .catch((err) => {
        console.log(err?.response?.data, "ear");
        if (err?.response?.data?.message) {
          const message = err.response.data.message;
          // Handle specific error messages
          if (message.includes('No driver assigned')) {
            flashMessageRef.current?.showMessage({
              type: "warning",
              message: "Please wait for a driver to accept your ride before sending messages.",
            });
          } else {
            flashMessageRef.current?.showMessage({
              type: "danger",
              message: message,
            });
          }
        } else if (err?.response?.data?.error) {
          flashMessageRef.current?.showMessage({
            type: "danger",
            message: err?.response?.data.error,
          });
        } else {
          flashMessageRef.current?.showMessage({
            type: "danger",
            message: "Something went wrong! Check your internet connection",
          });
        }
      })
      .finally(() => setSending(false));
  };

  const getAllChats = () => {
    if (!data?.rideId) {
      console.warn("No rideId provided for chat");
      return;
    }

    setLoading(true);
    axios
      .get(RETRIEVE_CHAT + data.rideId, apiConfig)
      .then(({ data }) => {
        // Backend returns { data: { messages: [...], pagination: {...} } }
        const messages = data?.data?.messages || data?.data || [];
        setChats(messages);
      })
      .catch((err) => {
        console.log(err?.response?.data, "ear");
        if (err?.response?.data?.message) {
          flashMessageRef.current?.showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        } else if (err?.response?.data?.error) {
          flashMessageRef.current?.showMessage({
            type: "danger",
            message: err?.response?.data.error,
          });
        } else {
          flashMessageRef.current?.showMessage({
            type: "danger",
            message: "Something went wrong! Check your internet connection",
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (visible) {
      getAllChats();
    }
  }, [visible]);
  return (
    <Modal visible={visible}>
      <ImageBackground
        style={tw.style(`bg-white px-4 flex-1`)}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar backgroundColor="white" />
        <FlashMessage
          ref={flashMessageRef}
          position="top"
          floating
          style={{
            elevation: 1000,
            marginTop: StatusBar.currentHeight,
            zIndex: 1000000,
          }}
          duration={3000}
          titleStyle={{ fontFamily: "RobotoMedium", textAlign: "center" }}
        />
        <View style={tw.style(`flex-row items-center justify-between px-4 pt-2 pb-3`, {
          paddingTop: (StatusBar.currentHeight || 0) + 8,
        })}>
          <View style={tw`flex-row items-center gap-x-3.5 flex-1`}>
            <Image
              source={{
                uri: data?.image,
              }}
              style={tw`h-[40px] w-[40px] rounded-full border-2 border-base-green`}
            />
            <Text
              style={tw.style(`text-xl`, {
                fontFamily: "RobotoBold",
              })}
            >
              {data?.name}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={tw.style(`h-[36px] w-[36px] flex-col items-center justify-center bg-black rounded-full`, {
              marginRight: 4,
            })}
            activeOpacity={0.7}
          >
            <AntDesign name="close" size={22} color="white" />
          </TouchableOpacity>
        </View>

        <View style={tw`flex-1`}>
          <ScrollView
            style={tw`flex-1 px-2`}
            ref={scrollViewRef}
            onContentSizeChange={() =>
              scrollViewRef.current?.scrollToEnd({ animated: true })
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tw`pb-4`}
          >
            {loading ? (
              <ActivityIndicator
                style={tw`mt-[70%]`}
                size="large"
                color={tw.color("base-green")}
              />
            ) : (
              <View style={tw`flex-col gap-y-2`}>
                {chats.map((item) => {
                  // Format date from backend (created_at) to display format
                  const formatDate = (dateString: string | Date) => {
                    if (!dateString) return '';
                    const date = new Date(dateString);
                    const now = new Date();
                    const diffMs = now.getTime() - date.getTime();
                    const diffMins = Math.floor(diffMs / 60000);
                    
                    if (diffMins < 1) return 'Just now';
                    if (diffMins < 60) return `${diffMins}m ago`;
                    const diffHours = Math.floor(diffMins / 60);
                    if (diffHours < 24) return `${diffHours}h ago`;
                    const diffDays = Math.floor(diffHours / 24);
                    if (diffDays < 7) return `${diffDays}d ago`;
                    return date.toLocaleDateString();
                  };

                  return (
                    <MessageItem
                      key={item?.message_id || item?._id}
                      item={{
                        message: item?.message || '',
                        date: item?.date || formatDate(item?.created_at || item?.createdAt),
                      }}
                      data={data}
                      isOwner={item?.is_sender || item?.sender?.user_id === user?.profile?.user_id || item?.sender_id === user?.profile?.user_id}
                    />
                  );
                })}
              </View>
            )}
          </ScrollView>
        </View>
      </ImageBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
        style={tw.style(
          `flex-row items-center justify-between px-4 pb-4 pt-3 bg-white border-t border-gray-200`
        )}
      >
        <View style={tw`flex-1 mr-3`}>
          <TextInput
            value={message}
            onChangeText={(text) => setMessage(text)}
            multiline
            maxLength={1000}
            style={tw.style(
              `border border-[#B8B8B8] text-black text-base rounded-[12px] py-3 px-4 min-h-[48px] max-h-[100px]`,
              {
                fontFamily: "RobotoRegular",
                fontSize: 16,
              }
            )}
            placeholder="Type your message..."
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <TouchableOpacity 
          disabled={message.trim().length === 0 || sending} 
          onPress={sendChat}
          style={tw.style(
            `h-[48px] w-[48px] rounded-full items-center justify-center`,
            message.trim().length === 0 
              ? `bg-gray-300` 
              : `bg-base-green`
          )}
          activeOpacity={0.7}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons 
              name="send" 
              size={22} 
              color={message.trim().length === 0 ? "#9CA3AF" : "white"} 
            />
          )}
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}
