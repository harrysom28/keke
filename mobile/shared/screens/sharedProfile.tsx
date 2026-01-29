import "react-native-reanimated";

import * as Clipboard from "expo-clipboard";

import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather, FontAwesome } from "@expo/vector-icons";
import { AuthState, updateUser } from "@/store/AuthSlice";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { ClipPath, Defs, G, Mask, Path, Rect, Svg } from "react-native-svg";
import { DRIVER_EARNINGS, WITHDRAWAL, INITIATE_PAYMENT } from "@/constants";
import { Linking } from "react-native";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";

import { AppContext } from "@/app/context";
import { Portal } from "@gorhom/portal";
import axios from "axios";
import { router } from "expo-router";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface PRProps {
  show: boolean;
  onClose: () => void;
}

const PaymentReceived = ({ show, onClose }: PRProps) => {
  return (
    <Modal
      visible={show}
      transparent
      onRequestClose={onClose}
      style={tw`flex-1`}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1919194D" />

      <View
        style={tw`flex-1 relative flex-col justify-center px-3.5 bg-[#1919194D]`}
      >
        <View
          style={tw`flex-col justify-center items-center p-7 gap-y-5 h-[460px] bg-white rounded-[12px]`}
        >
          <Image
            resizeMode="contain"
            source={require("@images/check.png")}
            style={tw`w-[122px] h-[122px]`}
          />
          <Text
            style={tw.style(`text-2xl text-black text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Received
          </Text>

          <Text
            style={tw.style(`text-base text-[#A0A0A0] text-center`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Amount sent will reflect on your dashboard once it`s received
          </Text>

          <TouchableOpacity
            onPress={onClose}
            style={tw`self-start w-full mt-5 py-3.5 bg-base-green rounded-[8px]`}
          >
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

interface TProps {
  text: string;
  action: () => void;
  exclude?: boolean;
}

const TapItem = ({ text, action, exclude = false }: TProps) => {
  return (
    <TouchableOpacity
      onPress={action}
      style={tw.style(
        `flex-row items-center justify-between py-3.5`,
        !exclude && `border-b border-[#EFEFF4]`
      )}
    >
      <Text
        style={tw.style(`text-[17px]`, {
          fontFamily: "RobotoRegular",
        })}
      >
        {text}
      </Text>
      <AntDesign name="right" size={16} color="#00000040" />
    </TouchableOpacity>
  );
};

interface Props {
  type: "passenger" | "driver";
}

const SharedProfileScreen = ({ type }: Props) => {
  const { apiConfig, getCurrentUser } = useContext(AppContext);
  const dispatch = useDispatch();
  let isFocused = useIsFocused();
  // Removed bottomSheetRef - using Modal state instead
  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [wloading, setWloading] = useState(false);
  const [withdrawDetails, setWithdrawDetails] = useState({});
  const { user } = useSelector(AuthState);
  const [displayType, setDisplayType] = useState<"withdraw" | "topup">("topup");
  const [topupMethod, setTopupMethod] = useState<"dva" | "card">("dva");
  const [cardAmount, setCardAmount] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [topupDetails, setTopupDetails] = useState<{
    topup_bank_name?: string;
    topup_account_name?: string;
    topup_account_number?: string;
  }>({});
  const [refreshing, setRefreshing] = useState(false);
  const [bottomSheetError, setBottomSheetError] = useState(false);
  const isDriver = type === "driver";

  // Track if bottom sheet failed to render (due to reanimated issue)
  useEffect(() => {
    // If bottom sheet crashes, catch it and set error state
    const timer = setTimeout(() => {
      // This will help detect if the component mounted successfully
      console.log('Profile screen mounted successfully');
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        style={[
          { backgroundColor: "#1919190D" },
          StyleSheet.absoluteFillObject,
        ]}
      />
    ),
    []
  );

  useEffect(() => {
    if (isFocused) {
      // Listener for when the keyboard is hidden
      const keyboardHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          // Do something here when the keyboard is closed
          // Modal handles its own positioning
        }
      );

      // Cleanup the listener on component unmount
      return () => {
        keyboardHideListener.remove();
      };
    }
  }, [isFocused]);

  useEffect(() => {
    if (isFocused) {
      // Refresh user data to get updated balance when screen is focused
      getCurrentUser();
      
      if (type === "driver") {
        axios
          .get(DRIVER_EARNINGS, apiConfig)
          .then(({ data }) => {
            setWithdrawDetails(data?.data);
          })
          .catch((err) => {
            console.log('Driver earnings error:', err?.response?.data);
            const status = err?.response?.status || err?.status;
            
            // Silently handle 401 errors - token refresh should happen automatically via API client
            if (status === 401) {
              console.log('Authentication error (401) - token refresh should handle this');
              return;
            }
            
            // Silently handle 404 errors (driver profile not found, etc.)
            if (status === 404) {
              console.log('Resource not found (404) - silently handling');
              return;
            }
            
            // Use centralized error handler to extract safe string message
            const errorMessage = getErrorMessage(err);
            safeShowMessage({
              type: "danger",
              message: errorMessage,
            });
          });
      }
    }
  }, [isFocused]);

  // Topup details are already available in user profile from Redux (fetched via getCurrentUser)
  // No need for a separate API call - the backend doesn't have a GET /api/user/profile/topup endpoint
  // The UI already falls back to user?.profile?.topup_* if topupDetails is empty
  useEffect(() => {
    // Sync topup details from Redux user profile when modal opens for topup
    if (displayType === "topup" && !isDriver && user?.profile) {
      // Update topupDetails from user profile if available
      if (user.profile.topup_bank_name || user.profile.topup_account_name || user.profile.topup_account_number) {
        setTopupDetails({
          topup_bank_name: user.profile.topup_bank_name,
          topup_account_name: user.profile.topup_account_name,
          topup_account_number: user.profile.topup_account_number,
        });
      }
    }
  }, [displayType, isDriver, user?.profile]);

  const handleWithdraw = () => {
    setWloading(true);
    axios
      .post(WITHDRAWAL, { amount }, apiConfig)
      .then(({ data }) => {
        // console.log(data);
        setAmount("");
                    setModal(false);
        safeShowMessage({
          type: "success",
          message: `${data?.message}`,
        });
      })
      .catch((err) => {
        console.log('Withdrawal error:', err?.response?.data);
        const status = err?.response?.status || err?.status;
        
        // Silently handle 401 errors - token refresh should happen automatically via API client
        if (status === 401) {
          console.log('Authentication error (401) - token refresh should handle this');
          return;
        }
        
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err);
        safeShowMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => setWloading(false));
  };


  return (
    <>
      <PaymentReceived show={modal} onClose={() => setModal(false)} />
      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={tw`bg-[#3C8F7CE6] h-[115px] flex-col items-center justify-end py-5`}
        >
          <Text
            style={tw.style(`text-center text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            User Profile
          </Text>
        </View>

        <ScrollView 
          style={tw`flex-1 px-4`} 
          contentContainerStyle={tw`pb-8`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                getCurrentUser();
                // Wait a bit for the API call to complete
                setTimeout(() => {
                  setRefreshing(false);
                }, 1000);
              }}
              tintColor={tw.color("base-green")}
            />
          }
        >
          <View style={tw`flex-row items-center justify-between my-3.5`}>
            <View style={tw`flex-row items-center gap-x-2.5`}>
              {user?.profile?.image ? (
                <Image
                  source={{ uri: user.profile.image }}
                  style={tw`w-[56px] h-[56px] rounded-full`}
                />
              ) : (
                <View style={tw`w-[56px] h-[56px] rounded-full bg-gray-200`} />
              )}
              <View>
                <Text style={tw.style(`text-lg`, { fontFamily: "RobotoBold" })}>
                  Hello{" "}
                  {user && user?.profile?.name
                    ? user?.profile?.name.split(" ")[0]
                    : ""}
                  ,
                </Text>
                <Text
                  style={tw.style(`text-sm text-[#8F92A1]`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  Your available balance
                </Text>
              </View>
            </View>
            <View>
              <Text
                style={tw.style(`text-2xl text-right`, {
                  fontFamily: "RobotoBold",
                })}
              >
                ₦{user?.profile?.balance}
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/dailyActivities")}
                style={{ display: isDriver ? "flex" : "none" }}
              >
                <Text
                  style={tw.style(
                    `text-sm text-base-green text-right underline`,
                    {
                      fontFamily: "RobotoBlack",
                    }
                  )}
                >
                  View Details
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={tw`py-4 flex-row bg-base-green rounded-[20px]`}>
            {isDriver && (
              <TouchableOpacity
                onPress={() => {
                  setDisplayType("withdraw");
                  setModal(true);
                }}
                style={tw`flex-col items-center w-[33.33%]`}
              >
                <Svg width={37} height={37} viewBox="0 0 37 37" fill="none">
                  <Path
                    d="M24.5488 4.53638L30.5974 10.585L24.5488 16.6336"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M30.5967 10.585H6.40234"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M12.4509 31.7551L6.40234 25.7065L12.4509 19.658"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M6.40234 25.7065H30.5967"
                    stroke="white"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>

                <Text
                  style={tw.style(`text-white text-sm text-center`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Withdraw
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                if (user?.profile?.phone) {
                  setDisplayType("topup");
                  setModal(true);
                } else {
                  safeShowMessage({
                    type: "danger",
                    message:
                      "Add your phone number in your profile to enable topup feature",
                    duration: 5000,
                  });
                }
              }}
              style={tw.style(
                `flex-col items-center border-white`,
                isDriver
                  ? "w-[33.33%] border-l-2 border-r-2"
                  : "w-[50%] border-r-2"
              )}
            >
              <Svg width="37" height="37" viewBox="0 0 37 37" fill="none">
                <G clip-path="url(#clip0_271_25478)">
                  <Path
                    d="M29.1366 7.1709H7.58853C5.3963 7.1709 3.61914 8.94805 3.61914 11.1403V25.8837C3.61914 28.076 5.3963 29.8531 7.58853 29.8531H29.1366C31.3289 29.8531 33.106 28.076 33.106 25.8837V11.1403C33.106 8.94805 31.3289 7.1709 29.1366 7.1709Z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <Path
                    d="M3.24023 13.9756H32.7271"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <Mask
                    id="path-3-outside-1_271_25478"
                    maskUnits="userSpaceOnUse"
                    x="27.3262"
                    y="24.0728"
                    width="12"
                    height="12"
                    fill="black"
                  >
                    <Rect
                      fill="white"
                      x="27.3262"
                      y="24.0728"
                      width="12"
                      height="12"
                    />
                    <Path
                      fill-rule="evenodd"
                      clip-rule="evenodd"
                      d="M34.2407 26.0728H31.9724V28.719H29.3262V30.9872H31.9724V33.6335H34.2407V30.9872H36.8869V28.719H34.2407V26.0728Z"
                    />
                  </Mask>
                  <Path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M34.2407 26.0728H31.9724V28.719H29.3262V30.9872H31.9724V33.6335H34.2407V30.9872H36.8869V28.719H34.2407V26.0728Z"
                    fill="white"
                  />
                  <Path
                    d="M31.9724 26.0728V24.0728H29.9724V26.0728H31.9724ZM34.2407 26.0728H36.2407V24.0728H34.2407V26.0728ZM31.9724 28.719V30.719H33.9724V28.719H31.9724ZM29.3262 28.719V26.719H27.3262V28.719H29.3262ZM29.3262 30.9872H27.3262V32.9872H29.3262V30.9872ZM31.9724 30.9872H33.9724V28.9872H31.9724V30.9872ZM31.9724 33.6335H29.9724V35.6335H31.9724V33.6335ZM34.2407 33.6335V35.6335H36.2407V33.6335H34.2407ZM34.2407 30.9872V28.9872H32.2407V30.9872H34.2407ZM36.8869 30.9872V32.9872H38.8869V30.9872H36.8869ZM36.8869 28.719H38.8869V26.719H36.8869V28.719ZM34.2407 28.719H32.2407V30.719H34.2407V28.719ZM31.9724 28.0728H34.2407V24.0728H31.9724V28.0728ZM33.9724 28.719V26.0728H29.9724V28.719H33.9724ZM29.3262 30.719H31.9724V26.719H29.3262V30.719ZM31.3262 30.9872V28.719H27.3262V30.9872H31.3262ZM31.9724 28.9872H29.3262V32.9872H31.9724V28.9872ZM33.9724 33.6335V30.9872H29.9724V33.6335H33.9724ZM34.2407 31.6335H31.9724V35.6335H34.2407V31.6335ZM32.2407 30.9872V33.6335H36.2407V30.9872H32.2407ZM36.8869 28.9872H34.2407V32.9872H36.8869V28.9872ZM34.8869 28.719V30.9872H38.8869V28.719H34.8869ZM34.2407 30.719H36.8869V26.719H34.2407V30.719ZM32.2407 26.0728V28.719H36.2407V26.0728H32.2407Z"
                    fill="#3C8F7C"
                    mask="url(#path-3-outside-1_271_25478)"
                  />
                  <Path
                    d="M12.6914 21.6309H9.28906V23.0485H12.6914V21.6309Z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </G>
                <Defs>
                  <ClipPath id="clip0_271_25478">
                    <Rect
                      width="36.2915"
                      height="36.2915"
                      fill="white"
                      transform="translate(0.216797 0.366211)"
                    />
                  </ClipPath>
                </Defs>
              </Svg>

              <Text
                style={tw.style(`text-white text-sm text-center`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Top Up
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                const route = isDriver 
                  ? "/(driver)/(tabs)/(profile)/wallet"
                  : "/(app)/(tabs)/(profile)/wallet";
                router.push(route);
              }}
              style={tw.style(
                `flex-col items-center`,
                isDriver ? "w-[33.33%]" : "w-[50%]"
              )}
            >
              <Svg width="37" height="37" viewBox="0 0 37 37" fill="none">
                <Path
                  d="M18.6406 12.4634V19.268L24.6892 21.5363"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Path
                  d="M6.4082 18.5119C6.4082 15.5777 7.43152 12.7353 9.30188 10.4744C11.1722 8.21356 13.7725 6.67576 16.6548 6.12593C19.537 5.57611 22.5208 6.0487 25.0921 7.46228C27.6634 8.87586 29.6612 11.1419 30.7414 13.8701C31.8216 16.5983 31.9164 19.6178 31.0097 22.4084C30.103 25.199 28.2514 27.5861 25.774 29.1583C23.2965 30.7306 20.3483 31.3896 17.4372 31.0218C14.5261 30.6541 11.8344 29.2826 9.82573 27.1436"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <Path
                  d="M9.56641 16.9998L6.54211 20.0241L3.51782 16.9998"
                  fill="white"
                />
                <Path
                  d="M9.56641 16.9998L6.54211 20.0241L3.51782 16.9998L9.56641 16.9998Z"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>

              <Text
                style={tw.style(`text-white text-sm text-center`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Wallet
              </Text>
            </TouchableOpacity>
          </View>

          <View style={tw`my-2`}>
            <TapItem
              text="Account Settings"
              action={() => router.push(`/(profile)/account`)}
            />
            <TapItem 
              text="Language" 
              action={() => {
                // Navigate based on user type
                const route = isDriver 
                  ? "/(driver)/(tabs)/(profile)/language"
                  : "/(app)/(tabs)/(profile)/language";
                router.push(route);
              }} 
            />
            <TapItem
              text="Invite a Friend"
              action={() => router.push(`/(profile)/invite`)}
            />
            <TapItem
              text="Emergency Contact"
              action={() => router.push(`/(profile)/emergency`)}
              exclude
            />
          </View>

          <View style={tw`my-2`}>
            <TapItem 
              text="Clear cache" 
              action={() => {
                Alert.alert(
                  "Clear Cache",
                  "This will clear all cached data including recent places and app cache. This action cannot be undone. Continue?",
                  [
                    {
                      text: "Cancel",
                      style: "cancel",
                    },
                    {
                      text: "Clear",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          // Clear places cache
                          const { placesCache } = await import("@/utils/cache");
                          placesCache.clear();
                          
                          // Clear AsyncStorage (except auth data)
                          const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
                          const keys = await AsyncStorage.getAllKeys();
                          const keysToRemove = keys.filter(
                            (key) => !key.startsWith("persist:")
                          );
                          await AsyncStorage.multiRemove(keysToRemove);
                          
                          safeShowMessage({
                            type: "success",
                            message: "Cache cleared successfully",
                          });
                        } catch (error) {
                          console.log("Error clearing cache:", error);
                          safeShowMessage({
                            type: "danger",
                            message: "Failed to clear cache",
                          });
                        }
                      },
                    },
                  ]
                );
              }} 
            />
            <TapItem 
              text="Terms & Privacy Policy" 
              action={() => {
                // Navigate based on user type
                const route = isDriver 
                  ? "/(driver)/(tabs)/(profile)/terms"
                  : "/(app)/(tabs)/(profile)/terms";
                router.push(route);
              }} 
            />
            <TapItem 
              text="Contact us" 
              action={() => {
                // Navigate based on user type
                const route = isDriver 
                  ? "/(driver)/(tabs)/(profile)/contact"
                  : "/(app)/(tabs)/(profile)/contact";
                router.push(route);
              }} 
              exclude 
            />
          </View>

        </ScrollView>
      </ImageBackground>

      <Modal
        visible={modal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModal(false)}
      >
        <Pressable
          style={tw`flex-1 bg-black/50 justify-end`}
          onPress={() => setModal(false)}
        >
          <Pressable
            style={tw`bg-white rounded-t-[40px] px-4 pt-6 pb-8 max-h-[55%]`}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={tw.style(
                `flex-row items-center bg-[#F6F6F6] justify-between w-[99%] mb-5 py-3 px-4 rounded-t-[16px]`,
                {
                  elevation: 5,
                }
              )}
            >
              <Text
                style={tw.style(`text-xl text-black text-center basis-[90%]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {displayType === "withdraw" ? "Withdrawal" : "Top Up"}
              </Text>
              <TouchableOpacity
                onPress={() => setModal(false)}
                style={tw`h-[34px] w-[34px] flex-col items-center justify-center bg-black p-1 rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>
            {displayType === "withdraw" && (
            <View
              style={tw`flex-row items-center justify-between mt-4`}
            >
              <View style={tw``}>
                <Text
                  style={tw.style(`text-[14px] text-[#8F92A1]`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  Total Balance
                </Text>
                <Text
                  style={tw.style(`text-[24px] text-black`, {
                    fontFamily: "RobotoBlack",
                  })}
                  numberOfLines={1}
                >
                  ₦{user?.profile?.balance}
                </Text>
              </View>
              <View
                style={tw.style(`flex-row gap-x-2 items-center`, {
                  display: withdrawDetails?.driver_account_number
                    ? "flex"
                    : "none",
                })}
              >
                <FontAwesome
                  name="bank"
                  size={12}
                  style={tw`self-start p-2 bg-base-green  rounded-full`}
                  color="white"
                />
                <View>
                  <Text
                    style={tw.style(`text-base text-[#343434]`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {withdrawDetails?.driver_bank_name}
                  </Text>
                  <Text
                    style={tw.style(`text-[12px] text-[#989898]`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    A/No: {withdrawDetails?.driver_account_number}
                  </Text>
                </View>
              </View>
            </View>
          )}
          <ScrollView
            style={tw.style(displayType === "withdraw" ? `mt-5` : `mt-8`)}
            showsVerticalScrollIndicator={false}
          >
            {displayType === "withdraw" ? (
              <>
                <View style={tw`my-3`}>
                  <Text
                    style={tw.style(`text-sm mb-1`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Input amount
                  </Text>
                  <TextInput
                    style={tw.style(
                      `text-base px-4 py-2 text-black border border-[#B8B8B8] rounded-[8px]`,
                      {
                        fontFamily: "RobotoMedium",
                      }
                    )}
                    value={amount}
                    onChangeText={(text) => setAmount(text)}
                    placeholder="₦"
                    placeholderTextColor="black"
                  />
                </View>

                <Pressable
                  disabled={amount.length === 0}
                  onPress={() => {
                    if (withdrawDetails?.driver_account_number) {
                      handleWithdraw();
                    } else {
                      safeShowMessage({
                        type: "warning",
                        message: "Please add bank details in order to withdraw",
                      });
                    }
                  }}
                  style={tw.style(
                    `bg-base-green  py-3.5`,
                    displayType === "withdraw" ? `mt-7` : `mt-8`
                  )}
                >
                  {wloading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-center text-base text-white`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Withdraw
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                {/* Top-up Method Selection */}
                <View style={tw`flex-row gap-x-2 mb-6`}>
                  <Pressable
                    onPress={() => setTopupMethod("dva")}
                    style={tw.style(
                      `flex-1 py-3 rounded-lg border-2 items-center`,
                      topupMethod === "dva"
                        ? "border-base-green bg-green-50"
                        : "border-gray-200 bg-white"
                    )}
                  >
                    <Text
                      style={tw.style(
                        `text-base`,
                        topupMethod === "dva"
                          ? "text-base-green"
                          : "text-gray-600",
                        { fontFamily: "RobotoBold" }
                      )}
                    >
                      Bank Transfer
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTopupMethod("card")}
                    style={tw.style(
                      `flex-1 py-3 rounded-lg border-2 items-center`,
                      topupMethod === "card"
                        ? "border-base-green bg-green-50"
                        : "border-gray-200 bg-white"
                    )}
                  >
                    <Text
                      style={tw.style(
                        `text-base`,
                        topupMethod === "card"
                          ? "text-base-green"
                          : "text-gray-600",
                        { fontFamily: "RobotoBold" }
                      )}
                    >
                      Card Payment
                    </Text>
                  </Pressable>
                </View>

                {/* DVA (Bank Transfer) Option */}
                {topupMethod === "dva" && (
                  <>
                    <View
                      style={tw`flex-row items-center justify-between py-3.5 border-b border-[#EFEFF4]`}
                    >
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        Bank Name
                      </Text>
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        {topupDetails?.topup_bank_name || user?.profile?.topup_bank_name || "N/A"}
                      </Text>
                    </View>
                    <View
                      style={tw`flex-row items-center justify-between py-3.5 border-b border-[#EFEFF4]`}
                    >
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        Account Name
                      </Text>
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        {topupDetails?.topup_account_name || user?.profile?.topup_account_name || "N/A"}
                      </Text>
                    </View>
                    <View
                      style={tw`flex-row items-center justify-between py-3.5 border-b border-[#EFEFF4]`}
                    >
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        Account Number
                      </Text>
                      <TouchableOpacity
                        style={tw`flex-row items-center gap-x-2`}
                        onPress={async () => {
                          const accountNumber = topupDetails?.topup_account_number || user?.profile?.topup_account_number;
                          if (accountNumber && accountNumber !== "N/A") {
                            await Clipboard.setStringAsync(accountNumber);
                            safeShowMessage({ type: "info", message: "Copied!" });
                          }
                        }}
                      >
                        <Text
                          style={tw.style(`text-[17px] text-black`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          {topupDetails?.topup_account_number || user?.profile?.topup_account_number || "N/A"}
                        </Text>
                        {(topupDetails?.topup_account_number || user?.profile?.topup_account_number) && (
                          <Feather name="copy" size={18} color="black" />
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {/* Card Payment Option */}
                {topupMethod === "card" && (
                  <>
                    <View style={tw`my-3`}>
                      <Text
                        style={tw.style(`text-sm mb-1`, {
                          fontFamily: "RobotoMedium",
                        })}
                      >
                        Enter Amount
                      </Text>
                      <TextInput
                        style={tw.style(
                          `text-base px-4 py-2 text-black border border-[#B8B8B8] rounded-[8px]`,
                          {
                            fontFamily: "RobotoMedium",
                          }
                        )}
                        value={cardAmount}
                        onChangeText={(text) => setCardAmount(text)}
                        placeholder="₦"
                        placeholderTextColor="black"
                        keyboardType="numeric"
                      />
                    </View>

                    <Pressable
                      disabled={cardAmount.length === 0 || cardLoading}
                      onPress={async () => {
                        const amount = parseFloat(cardAmount);
                        if (isNaN(amount) || amount <= 0) {
                          safeShowMessage({
                            type: "warning",
                            message: "Please enter a valid amount",
                          });
                          return;
                        }

                        setCardLoading(true);
                        try {
                          const { data } = await axios.post(
                            INITIATE_PAYMENT,
                            { amount },
                            apiConfig
                          );

                          if (data?.data?.payment_url) {
                            const canOpen = await Linking.canOpenURL(
                              data.data.payment_url
                            );
                            if (canOpen) {
                              await Linking.openURL(data.data.payment_url);
                            } else {
                              safeShowMessage({
                                type: "danger",
                                message: "Could not open payment page",
                              });
                            }
                          } else {
                            safeShowMessage({
                              type: "danger",
                              message: data?.message || "Payment initialization failed",
                            });
                          }
                        } catch (err: any) {
                          console.log('Payment initialization error:', err?.response?.data);
                          const status = err?.response?.status || err?.status;
                          
                          // Silently handle 401 errors - token refresh should happen automatically via API client
                          if (status === 401) {
                            console.log('Authentication error (401) - token refresh should handle this');
                            return;
                          }
                          
                          // Use centralized error handler to extract safe string message
                          const errorMessage = getErrorMessage(err);
                          safeShowMessage({
                            type: "danger",
                            message: errorMessage,
                          });
                        } finally {
                          setCardLoading(false);
                        }
                      }}
                      style={tw.style(
                        `bg-base-green py-3.5 rounded-lg mt-4`,
                        (cardAmount.length === 0 || cardLoading) && "opacity-50"
                      )}
                    >
                      {cardLoading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text
                          style={tw.style(`text-center text-base text-white`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          Pay with Card
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}
              </>
            )}
          </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default SharedProfileScreen;
