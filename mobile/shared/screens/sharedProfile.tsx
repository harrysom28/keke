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
import { DRIVER_EARNINGS, WITHDRAWAL, INITIATE_WALLET_TOPUP } from "@/constants";
import apiClient from "@/utils/apiClient";
import { PaymentWebViewModal } from "@/components/PaymentWebViewModal";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusRefresh } from "@/hooks/useFocusRefresh";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

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

/** Format account number with spaces for readability (e.g. 9329273487 → 9329 2734 87) */
function formatAccountNumber(value: string | number | undefined): string {
  if (value == null) return "";
  const s = String(value).replace(/\s/g, "");
  if (s.length <= 4) return s;
  const chunks: string[] = [];
  for (let i = 0; i < s.length; i += 4) {
    chunks.push(s.slice(i, i + 4));
  }
  return chunks.join(" ");
}

const TapItem = ({ text, action, exclude = false }: TProps) => {
  return (
    <TouchableOpacity
      onPress={action}
      activeOpacity={0.7}
      style={tw.style(
        `flex-row items-center justify-between py-4 min-h-[52px]`,
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
  const insets = useSafeAreaInsets();
  const { apiConfig, getCurrentUser } = useContext(AppContext);
  const dispatch = useDispatch();
  let isFocused = useIsFocused();
  const refreshProfileOnFocus = useFocusRefresh(120_000);
  // Removed bottomSheetRef - using Modal state instead
  const [modal, setModal] = useState(false);
  const [amount, setAmount] = useState("");
  const [wloading, setWloading] = useState(false);
  const [withdrawDetails, setWithdrawDetails] = useState<{
    driver_bank_name?: string;
    driver_account_number?: string;
    withdrawable_balance?: number;
    wallet?: { withdrawableBalance?: number };
  }>({});
  const { user } = useSelector(AuthState);
  const [displayType, setDisplayType] = useState<"withdraw" | "topup">("topup");
  const [topupMethod, setTopupMethod] = useState<"dva" | "card">("dva");
  const [cardAmount, setCardAmount] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [pendingPaymentUrl, setPendingPaymentUrl] = useState<string | null>(null);
  const [pendingTopupReference, setPendingTopupReference] = useState<string | null>(null);
  const [paymentWebViewUrl, setPaymentWebViewUrl] = useState<string | null>(null);
  const [paymentWebViewRef, setPaymentWebViewRef] = useState<string | null>(null);
  const topupAmountRef = useRef<TextInput>(null);
  const initialBalanceRef = useRef<string | undefined>(undefined);
  const [topupDetails, setTopupDetails] = useState<{
    topup_bank_name?: string;
    topup_account_name?: string;
    topup_account_number?: string;
    topup_reference?: string;
  }>({});
  const [showPaymentReceived, setShowPaymentReceived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bottomSheetError, setBottomSheetError] = useState(false);
  const walletModalKeyboardInset = useKeyboardInset(modal);
  const isDriver = type === "driver";
  const profileData = (user?.profile || {}) as Record<string, any>;
  const formattedWalletBalance = (() => {
    const raw = user?.profile?.balance ?? 0;
    const num = typeof raw === "number" ? raw : parseFloat(String(raw));
    if (!Number.isFinite(num)) return "0";
    // Naira amounts should be whole numbers; round to remove float artifacts.
    return Math.round(num).toLocaleString();
  })();
  const transferAccountNumber =
    topupDetails?.topup_account_number ??
    profileData.topup_account_number ??
    profileData.account_number ??
    profileData.accountNumber ??
    profileData.bank_account?.account_number ??
    "";
  const transferBankName =
    topupDetails?.topup_bank_name ??
    profileData.topup_bank_name ??
    profileData.bank_name ??
    profileData.bankName ??
    profileData.bank_account?.bank_name ??
    "";
  const transferAccountName =
    topupDetails?.topup_account_name ??
    profileData.topup_account_name ??
    profileData.account_name ??
    profileData.accountName ??
    profileData.bank_account?.account_name ??
    "";
  const transferReference =
    topupDetails?.topup_reference ??
    profileData.topup_reference ??
    "";

  const closeModalWithBlur = () => {
    topupAmountRef.current?.blur();
    Keyboard.dismiss();
    setModal(false);
  };

  useEffect(() => {
    if (initialBalanceRef.current != null && user?.profile?.balance !== undefined) {
      const initial = parseFloat(initialBalanceRef.current) || 0;
      const current = parseFloat(String(user.profile.balance)) || 0;
      if (current > initial && initialBalanceRef.current !== String(user.profile.balance)) {
        console.log("✅ Balance updated! Old:", initialBalanceRef.current, "New:", user.profile.balance);
        safeShowMessage({
          type: "success",
          message: `Payment successful! Balance updated to ₦${current.toLocaleString()}`,
          duration: 4000,
        });
        initialBalanceRef.current = undefined;
      }
    }
  }, [user?.profile?.balance]);

  const handleCardTopup = async () => {
    const amount = parseFloat(cardAmount);
    if (isNaN(amount) || amount <= 0) {
      safeShowMessage({
        type: "warning",
        message: "Please enter a valid amount",
      });
      return;
    }
    if (amount < 100) {
      safeShowMessage({
        type: "warning",
        message: "Minimum top-up amount is ₦100",
      });
      return;
    }
    setCardLoading(true);
    try {
      const { data } = await axios.post(
        INITIATE_WALLET_TOPUP,
        { amount, type: "topup" },
        apiConfig
      );

      console.log("Payment response:", data);

      if (data?.data?.payment_url) {
        const paymentUrl = data.data.payment_url;
        const reference = data.data.reference || null;
        setCardAmount("");
        setCardLoading(false);
        setPendingPaymentUrl(paymentUrl);
        setPendingTopupReference(reference);
        closeModalWithBlur();
      } else {
        safeShowMessage({
          type: "danger",
          message: data?.message || "Payment initialization failed",
        });
        setCardLoading(false);
      }
    } catch (err: any) {
      console.log("Payment initialization error:", err?.response?.data);
      const status = err?.response?.status || err?.status;
      if (status === 401) {
        console.log("Authentication error (401) - token refresh should handle this");
        setCardLoading(false);
        return;
      }
      const errorMessage = getErrorMessage(err);
      safeShowMessage({
        type: "danger",
        message: errorMessage,
      });
      setCardLoading(false);
    }
  };

  const handleModalDismiss = () => {
    if (pendingPaymentUrl) {
      const url = pendingPaymentUrl;
      const ref = pendingTopupReference;
      setPendingPaymentUrl(null);
      setPendingTopupReference(null);
      console.log("📱 Modal dismissed, opening payment in WebView:", url);
      initialBalanceRef.current = user?.profile?.balance;
      setTimeout(() => {
        setPaymentWebViewUrl(url);
        setPaymentWebViewRef(ref);
      }, 300);
    }
  };

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
    refreshProfileOnFocus(() => {
      // Refresh user data to get updated balance when screen is focused
      getCurrentUser();

      if (type === "driver") {
        apiClient
          .get("driver/earnings")
          .then(({ data }) => {
            setWithdrawDetails(data?.data);
          })
          .catch((err) => {
            console.log("Driver earnings error:", err?.response?.data);
            const status = err?.response?.status || err?.status;

            // Silently handle 401 errors - token refresh should happen automatically via API client
            if (status === 401) {
              console.log("Authentication error (401) - token refresh should handle this");
              return;
            }

            // Silently handle 404 errors (driver profile not found, etc.)
            if (status === 404) {
              console.log("Resource not found (404) - silently handling");
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
    });
  }, [isFocused, type, refreshProfileOnFocus]);

  // Topup details are already available in user profile from Redux (fetched via getCurrentUser)
  // No need for a separate API call - the backend doesn't have a GET /api/user/profile/topup endpoint
  // The UI already falls back to user?.profile?.topup_* if topupDetails is empty
  useEffect(() => {
    // Sync topup details from Redux user profile when modal opens for topup
    if (displayType === "topup" && !isDriver && user?.profile) {
      const profile = user.profile as Record<string, unknown>;
      if (profile.topup_bank_name || profile.topup_account_name || profile.topup_account_number || profile.topup_reference) {
        setTopupDetails({
          topup_bank_name: profile.topup_bank_name as string,
          topup_account_name: profile.topup_account_name as string,
          topup_account_number: profile.topup_account_number as string,
          topup_reference: profile.topup_reference as string,
        });
      }
    }
  }, [displayType, isDriver, user?.profile]);

  const handleWithdraw = () => {
    const numAmount = parseFloat(String(amount).replace(/,/g, ""));
    if (!numAmount || numAmount <= 0) {
      safeShowMessage({ type: "danger", message: "Enter a valid amount" });
      return;
    }
    setWloading(true);
    apiClient
      .post("user/balance/withdraw", { amount: numAmount })
      .then(({ data }) => {
        setAmount("");
        setModal(false);
        safeShowMessage({ type: "success", message: data?.message ?? "Withdrawal submitted" });
        // Refresh earnings so balance and withdraw details are up to date
        if (type === "driver") {
          apiClient.get("driver/earnings").then(({ data: res }) => setWithdrawDetails(res?.data)).catch(() => {});
        }
      })
      .catch((err) => {
        const errorMessage = getErrorMessage(err);
        safeShowMessage({ type: "danger", message: errorMessage });
      })
      .finally(() => setWloading(false));
  };


  return (
    <>
      <PaymentReceived
        show={showPaymentReceived}
        onClose={() => {
          setShowPaymentReceived(false);
          getCurrentUser();
        }}
      />
      <ImageBackground
        style={tw`flex-1 bg-[#F7FAF7]`}
        source={require("@images/pattern-bg.png")}
        imageStyle={{ opacity: 0.06 }}
      >
        <StatusBar barStyle="light-content" />
        <View
          style={[
            tw`bg-[#3C8F7C] pb-5 px-4`,
            { paddingTop: insets.top + 16 },
          ]}
        >
          <Text
            style={tw.style(`text-center text-white text-xl`, { fontFamily: "RobotoBold" })}
          >
            User Profile
          </Text>
        </View>

        <ScrollView
          style={tw`flex-1`}
          contentContainerStyle={[
            tw`px-4 flex-grow`,
            { paddingBottom: 40 + Math.max(insets.bottom, 0) },
          ]}
          showsVerticalScrollIndicator={false}
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
          {/* Wallet card: greeting, balance, and top-up bank details */}
          <View style={tw`-mt-2 overflow-hidden rounded-2xl border border-base-green/15 bg-white shadow-sm shadow-black/5`}>
            {/* Balance row */}
            <View style={tw`flex-row items-center justify-between px-4 pt-4 pb-3`}>
              <View style={tw`flex-row items-center gap-x-3`}>
                {user?.profile?.image && String(user.profile.image).trim() ? (
                  <Image
                    source={{ uri: String(user.profile.image).trim() }}
                    style={tw`w-12 h-12 rounded-full`}
                  />
                ) : (
                  <View style={tw`w-12 h-12 rounded-full bg-gray-200`} />
                )}
                <View>
                  <Text style={tw.style(`text-base text-[#166534]`, { fontFamily: "RobotoBold" })}>
                    Hello {user?.profile?.name ? user.profile.name.split(" ")[0] : ""},
                  </Text>
                  <Text style={tw.style(`text-xs text-[#6B7280]`, { fontFamily: "RobotoRegular" })}>
                    Available balance
                  </Text>
                </View>
              </View>
              <View style={tw`items-end`}>
                <Text style={tw.style(`text-2xl text-[#166534]`, { fontFamily: "RobotoBold" })}>
                  ₦{formattedWalletBalance}
                </Text>
                {isDriver ? (
                  <TouchableOpacity onPress={() => router.push("/(driver)/dailyActivities")}>
                    <Text style={tw.style(`text-xs text-base-green underline`, { fontFamily: "RobotoMedium" })}>
                      View Details
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {(transferAccountNumber || profileData.wallet_account_number || transferReference) ? (
              <View style={tw`border-t border-[#E5E7EB] bg-[#FAFFFA] px-4 py-3.5`}>
                <Text style={tw.style(`text-[11px] text-[#6B7280] uppercase tracking-wider mb-2`, { fontFamily: "RobotoMedium" })}>
                  Account number
                </Text>
                <TouchableOpacity
                  onPress={async () => {
                    const acct =
                      transferAccountNumber ||
                      profileData.wallet_account_number ||
                      transferReference;
                    if (acct) {
                      await Clipboard.setStringAsync(String(acct));
                      safeShowMessage({ type: "info", message: "Account number copied!" });
                    }
                  }}
                  style={tw`flex-row items-center justify-between`}
                  activeOpacity={0.8}
                >
                  <Text
                    style={tw.style(`text-lg text-[#166534] tracking-[2px]`, { fontFamily: "RobotoBold" })}
                  >
                    {formatAccountNumber(
                      (transferAccountNumber ||
                        profileData.wallet_account_number ||
                        transferReference) as string | number | undefined
                    )}
                  </Text>
                  <View style={tw`p-2 rounded-lg bg-base-green/10`}>
                    <Feather name="copy" size={18} color="#166534" />
                  </View>
                </TouchableOpacity>
                {transferBankName ? (
                  <Text style={tw.style(`text-xs text-[#6B7280] mt-2`, { fontFamily: "RobotoRegular" })}>
                    {String(transferBankName ?? "")}
                    {transferAccountName
                      ? ` · ${String(transferAccountName)}`
                      : ""}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={tw`mt-3 py-3 flex-row bg-base-green rounded-xl`}>
            {isDriver && (
              <TouchableOpacity
                onPress={() => {
                  setDisplayType("withdraw");
                  setModal(true);
                }}
                style={tw`flex-col items-center justify-center w-[33.33%] gap-y-1.5`}
              >
                <Svg width={28} height={28} viewBox="0 0 37 37" fill="none">
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

                <Text style={tw.style(`text-white text-xs text-center`, { fontFamily: "RobotoMedium" })}>
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
                `flex-col items-center justify-center border-white gap-y-1.5`,
                isDriver
                  ? "w-[33.33%] border-l border-r border-white/40"
                  : "w-[50%] border-r border-white/40"
              )}
            >
              <Svg width={28} height={28} viewBox="0 0 37 37" fill="none">
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

              <Text style={tw.style(`text-white text-xs text-center`, { fontFamily: "RobotoMedium" })}>
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
                `flex-col items-center justify-center gap-y-1.5`,
                isDriver ? "w-[33.33%]" : "w-[50%]"
              )}
            >
              <Svg width={28} height={28} viewBox="0 0 37 37" fill="none">
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

              <Text style={tw.style(`text-white text-xs text-center`, { fontFamily: "RobotoMedium" })}>
                Wallet
              </Text>
            </TouchableOpacity>
          </View>

          <View style={tw`mt-6 rounded-2xl bg-white border border-[#E5E7EB] overflow-hidden px-4`}>
            <Text style={tw.style(`text-xs text-[#6B7280] uppercase tracking-wider pt-4 pb-2`, { fontFamily: "RobotoMedium" })}>
              Account
            </Text>
            <TapItem
              text="Account Settings"
              action={() => router.push(isDriver ? "/(driver)/(tabs)/(profile)/account" : "/(app)/(tabs)/(profile)/account")}
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
              action={() => router.push(isDriver ? "/(driver)/(tabs)/(profile)/invite" : "/(app)/(tabs)/(profile)/invite")}
            />
            <TapItem
              text="Emergency Contact"
              action={() =>
                router.push(
                  isDriver
                    ? "/(driver)/(tabs)/(profile)/emergency"
                    : "/(app)/(tabs)/(profile)/emergency"
                )
              }
              exclude
            />
            <Text style={tw.style(`text-xs text-[#6B7280] uppercase tracking-wider pt-5 pb-2`, { fontFamily: "RobotoMedium" })}>
              Support & legal
            </Text>
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
        onRequestClose={closeModalWithBlur}
        onDismiss={handleModalDismiss}
      >
        <View style={tw`flex-1`}>
          <Pressable
            style={tw`flex-1 bg-black/50`}
            onPress={closeModalWithBlur}
          />
          <View
            style={[
              tw`absolute bottom-0 left-0 right-0 bg-white rounded-t-[40px] px-4 pt-6 pb-8`,
              { maxHeight: "60%", marginBottom: walletModalKeyboardInset },
            ]}
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
                onPress={closeModalWithBlur}
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
                  Available to withdraw
                </Text>
                <Text
                  style={tw.style(`text-[24px] text-black`, {
                    fontFamily: "RobotoBlack",
                  })}
                  numberOfLines={1}
                >
                  ₦{Number(
                    withdrawDetails?.withdrawable_balance ??
                      withdrawDetails?.wallet?.withdrawableBalance ??
                      (user?.profile as Record<string, unknown>)?.withdrawable_balance ??
                      user?.profile?.balance ??
                      0
                  ).toLocaleString()}
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
            contentContainerStyle={tw.style(`pb-6`)}
            showsVerticalScrollIndicator={true}
            keyboardShouldPersistTaps="handled"
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
                    {!transferAccountNumber && !transferBankName ? (
                      <View style={tw`mb-4 p-3 bg-amber-50 rounded-lg border border-amber-200`}>
                        <Text style={tw.style(`text-sm text-amber-800`, { fontFamily: "RobotoMedium" })}>
                          Bank transfer details are not configured yet. Please contact support to enable this feature.
                        </Text>
                      </View>
                    ) : (
                      <>
                    <Text
                      style={tw.style(`text-[13px] text-[#6B7280] mb-3`, { fontFamily: "RobotoRegular" })}
                    >
                      Transfer to the account below and use the reference when making the transfer so we can match your payment.
                    </Text>
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
                        {transferBankName || "N/A"}
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
                        {transferAccountName || "N/A"}
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
                          if (transferAccountNumber) {
                            await Clipboard.setStringAsync(String(transferAccountNumber));
                            safeShowMessage({ type: "info", message: "Copied!" });
                          }
                        }}
                      >
                        <Text
                          style={tw.style(`text-[17px] text-black`, {
                            fontFamily: "RobotoRegular",
                          })}
                        >
                          {transferAccountNumber || "N/A"}
                        </Text>
                        {transferAccountNumber ? (
                          <Feather name="copy" size={18} color="black" />
                        ) : null}
                      </TouchableOpacity>
                    </View>
                    <View
                      style={tw`flex-row items-center justify-between py-3.5 border-b border-[#EFEFF4]`}
                    >
                      <Text
                        style={tw.style(`text-[17px] text-black`, {
                          fontFamily: "RobotoRegular",
                        })}
                      >
                        Reference (use when transferring)
                      </Text>
                      <TouchableOpacity
                        style={tw`flex-row items-center gap-x-2`}
                        onPress={async () => {
                          const ref = transferReference != null ? String(transferReference) : "";
                          if (ref) {
                            await Clipboard.setStringAsync(ref);
                            safeShowMessage({ type: "info", message: "Copied!" });
                          }
                        }}
                      >
                        <Text
                          style={tw.style(`text-[17px] text-base-green font-semibold`, {
                            fontFamily: "RobotoBold",
                          })}
                        >
                          {String(transferReference || "N/A")}
                        </Text>
                        {!!transferReference && (
                          <Feather name="copy" size={18} color="#22c55e" />
                        )}
                      </TouchableOpacity>
                    </View>
                      </>
                    )}
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
                        ref={topupAmountRef}
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
                      onPress={handleCardTopup}
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
          </View>
        </View>
      </Modal>

      <PaymentWebViewModal
        visible={!!paymentWebViewUrl}
        onClose={() => {
          setPaymentWebViewUrl(null);
          setPaymentWebViewRef(null);
        }}
        paymentUrl={paymentWebViewUrl ?? ""}
        referenceFromInit={paymentWebViewRef}
        initialBalance={user?.profile?.balance}
        getCurrentUser={getCurrentUser}
        showMessage={safeShowMessage}
      />
    </>
  );
};

export default SharedProfileScreen;
