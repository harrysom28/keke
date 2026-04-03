import React, { useState, useEffect, useRef, useContext, useCallback } from "react";
import {
  ImageBackground,
  Keyboard,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { AntDesign, Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import tw from "@/lib/tailwind";
import { AppContext } from "@/app/context";
import { useSelector } from "react-redux";
import { AuthState } from "@/store/AuthSlice";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { INITIATE_WALLET_TOPUP } from "@/constants";
import apiClient from "@/utils/apiClient";
import * as Clipboard from "expo-clipboard";
import { PaymentWebViewModal } from "@/components/PaymentWebViewModal";

interface Transaction {
  payment_id: string;
  amount: number;
  method: string;
  status: string;
  type: "topup" | "withdrawal" | "payment" | "refund";
  created_at: string;
  description?: string;
}

const WalletScreen = () => {
  const { apiConfig, getCurrentUser } = useContext(AppContext);
  const { user } = useSelector(AuthState);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [walletSummaryLoading, setWalletSummaryLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupMethod, setTopupMethod] = useState<"dva" | "card">("dva");
  const [cardAmount, setCardAmount] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [pendingPaymentUrl, setPendingPaymentUrl] = useState<string | null>(null);
  const [pendingTopupReference, setPendingTopupReference] = useState<string | null>(null);
  const [paymentWebViewUrl, setPaymentWebViewUrl] = useState<string | null>(null);
  const [paymentWebViewRef, setPaymentWebViewRef] = useState<string | null>(null);
  const [walletAvailableBalance, setWalletAvailableBalance] = useState<number | null>(null);
  const [walletHeldBalance, setWalletHeldBalance] = useState<number>(0);
  const topupAmountRef = useRef<TextInput>(null);
  const initialBalanceRef = useRef<string | undefined>(undefined);

  const closeTopupModal = () => {
    topupAmountRef.current?.blur();
    Keyboard.dismiss();
    setTopupModal(false);
  };

  useEffect(() => {
    void Promise.all([fetchTransactions(), fetchWalletSummary()]);
  }, []);
  const fetchWalletSummary = async () => {
    setWalletSummaryLoading(true);
    try {
      const { data } = await apiClient.get("wallet");
      const walletData = data?.data || {};
      const available = Number(walletData.availableBalance ?? walletData.balance ?? 0);
      const held = Number(walletData.heldBalance ?? 0);
      setWalletAvailableBalance(Number.isFinite(available) ? available : 0);
      setWalletHeldBalance(Number.isFinite(held) ? held : 0);
    } catch (error) {
      if (error?.response?.data?.message) {
        showMessage({ type: "danger", message: String(error.response.data.message) });
      }
    } finally {
      setWalletSummaryLoading(false);
    }
  };


  useEffect(() => {
    if (initialBalanceRef.current != null && user?.profile?.balance !== undefined) {
      const initial = parseFloat(initialBalanceRef.current) || 0;
      const current = parseFloat(String(user.profile.balance)) || 0;
      if (current > initial && initialBalanceRef.current !== String(user.profile.balance)) {
        console.log("✅ Balance updated! Old:", initialBalanceRef.current, "New:", user.profile.balance);
        showMessage({
          type: "success",
          message: `Payment successful! Balance updated to ₦${current.toLocaleString()}`,
          duration: 4000,
        });
        initialBalanceRef.current = undefined;
      }
    }
  }, [user?.profile?.balance]);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("user/payments", {
        params: { limit: 50 },
      });
      if (data?.data?.payments) {
        // Transform payments to include type
        const transformed = data.data.payments.map((payment: any) => ({
          ...payment,
          type: payment.ride_id
            ? "payment"
            : payment.amount > 0
            ? "topup"
            : "withdrawal",
          description: payment.ride_id
            ? "Ride Payment"
            : payment.amount > 0
            ? "Wallet Top-up"
            : "Withdrawal",
        }));
        setTransactions(transformed);
      }
    } catch (error: any) {
      console.log("Error fetching transactions:", error);
      if (error?.response?.data?.message) {
        showMessage({
          type: "danger",
          message: error.response.data.message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTransactions(), fetchWalletSummary(), getCurrentUser()]);
    setRefreshing(false);
  };

  const handleCardTopup = async () => {
    const amount = parseFloat(cardAmount);
    if (isNaN(amount) || amount <= 0) {
      showMessage({
        type: "warning",
        message: "Please enter a valid amount",
      });
      return;
    }

    if (amount < 100) {
      showMessage({
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
        closeTopupModal();
      } else {
        showMessage({
          type: "danger",
          message: data?.message || "Payment initialization failed",
        });
        setCardLoading(false);
      }
    } catch (error: any) {
      console.log("Error initializing payment:", error);
      showMessage({
        type: "danger",
        message: error?.response?.data?.message || "Could not initialize payment",
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTransactionIcon = (type: string, method: string) => {
    if (type === "topup" || type === "refund") {
      return <AntDesign name="arrow-down" size={20} color="#3C8F7C" />;
    } else if (type === "withdrawal") {
      return <AntDesign name="arrow-up" size={20} color="#F31717" />;
    } else {
      return <Feather name="credit-card" size={20} color="#8F92A1" />;
    }
  };

  const getTransactionColor = (type: string) => {
    if (type === "topup" || type === "refund") {
      return "#3C8F7C";
    } else if (type === "withdrawal") {
      return "#F31717";
    } else {
      return "#8F92A1";
    }
  };

  const renderTransaction = ({ item }: { item: Transaction }) => {
    const isPositive = item.type === "topup" || item.type === "refund";
    const amountColor = isPositive ? "#3C8F7C" : "#F31717";
    const amountPrefix = isPositive ? "+" : "-";

    return (
      <View
        style={tw`flex-row items-center justify-between py-4 border-b border-[#EFEFF4]`}
      >
        <View style={tw`flex-row items-center flex-1`}>
          <View
            style={tw.style(
              `w-10 h-10 rounded-full items-center justify-center`,
              {
                backgroundColor: isPositive ? "#3C8F7C20" : "#F3171720",
              }
            )}
          >
            {getTransactionIcon(item.type, item.method)}
          </View>
          <View style={tw`ml-3 flex-1`}>
            <Text
              style={tw.style(`text-base text-black`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {item.description ||
                (item.type === "topup"
                  ? "Wallet Top-up"
                  : item.type === "withdrawal"
                  ? "Withdrawal"
                  : item.type === "payment"
                  ? "Ride Payment"
                  : "Refund")}
            </Text>
            <Text
              style={tw.style(`text-sm text-[#8F92A1] mt-1`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {formatDate(item.created_at)}
            </Text>
            <Text
              style={tw.style(`text-xs text-[#8F92A1] mt-1`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {item.method === "stripe" || item.method === "card"
                ? "Card Payment"
                : item.method === "bank_transfer"
                ? "Bank Transfer"
                : item.method === "wallet"
                ? "Wallet"
                : item.method}
              {item.status === "pending" && " • Pending"}
            </Text>
          </View>
        </View>
        <View style={tw`items-end`}>
          <Text
            style={tw.style(`text-base`, {
              color: amountColor,
              fontFamily: "RobotoBold",
            })}
          >
            {amountPrefix}₦{item.amount.toLocaleString()}
          </Text>
          {item.status === "pending" && (
            <View
              style={tw`mt-1 px-2 py-0.5 bg-yellow-100 rounded-full`}
            >
              <Text
                style={tw.style(`text-xs text-yellow-700`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Pending
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const displayedAvailableBalance =
    walletAvailableBalance !== null
      ? walletAvailableBalance
      : parseFloat(user?.profile?.balance || "0");
  const transferUserData = (user?.profile || {}) as Record<string, any>;
  const transferAccountNumber =
    transferUserData.topup_account_number ??
    transferUserData.account_number ??
    transferUserData.accountNumber ??
    transferUserData.bank_account?.account_number ??
    "";
  const transferBankName =
    transferUserData.topup_bank_name ??
    transferUserData.bank_name ??
    transferUserData.bankName ??
    transferUserData.bank_account?.bank_name ??
    "";
  const transferAccountName =
    transferUserData.topup_account_name ??
    transferUserData.account_name ??
    transferUserData.accountName ??
    transferUserData.bank_account?.account_name ??
    "";

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between`}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={tw`bg-black p-1 rounded-full`}
          >
            <AntDesign name="left" size={24} color="white" />
          </TouchableOpacity>
          <Text
            style={tw.style(`text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            Wallet
          </Text>
          <View style={tw`w-10`} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={tw`px-6 py-4 pb-8`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tw.color("base-green")}
          />
        }
      >
        {/* Balance Card */}
        <View
          style={tw.style(
            `bg-base-green rounded-[20px] p-6 mb-6`,
            {
              elevation: 4,
            }
          )}
        >
          <Text
            style={tw.style(`text-white text-sm mb-2`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Available Balance
          </Text>
          {walletSummaryLoading ? (
            <View style={tw`py-2 mb-4`}>
              <ActivityIndicator color="white" size="small" />
            </View>
          ) : (
            <Text
              style={tw.style(`text-white text-4xl mb-4`, {
                fontFamily: "RobotoBold",
              })}
            >
              ₦{displayedAvailableBalance.toLocaleString()}
            </Text>
          )}
          {walletHeldBalance > 0 ? (
            <Text
              style={tw.style(`text-white text-xs mb-3`, {
                fontFamily: "RobotoRegular",
              })}
            >
              ₦{walletHeldBalance.toLocaleString()} is currently held for active or scheduled rides
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={() => setTopupModal(true)}
            style={tw`bg-white py-3 rounded-lg`}
          >
            <Text
              style={tw.style(`text-center text-base-green text-base`, {
                fontFamily: "RobotoBold",
              })}
            >
              Top Up Wallet
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={tw`flex-row gap-x-3 mb-6`}>
          <TouchableOpacity
            onPress={() => {
              setTopupMethod("card");
              setTopupModal(true);
            }}
            style={tw`flex-1 bg-white rounded-lg p-4 items-center border border-[#EFEFF4]`}
          >
            <Feather name="credit-card" size={24} color="#3C8F7C" />
            <Text
              style={tw.style(`text-sm text-black mt-2`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Card Payment
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setTopupMethod("dva");
              setTopupModal(true);
            }}
            style={tw`flex-1 bg-white rounded-lg p-4 items-center border border-[#EFEFF4]`}
          >
            <Feather name="credit-card" size={24} color="#3C8F7C" />
            <Text
              style={tw.style(`text-sm text-black mt-2`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Bank Transfer
            </Text>
          </TouchableOpacity>
        </View>

        {/* Transaction History */}
        <View style={tw`mb-4`}>
          <Text
            style={tw.style(`text-lg text-black mb-4`, {
              fontFamily: "RobotoBold",
            })}
          >
            Transaction History
          </Text>
          {loading && transactions.length === 0 ? (
            <View style={tw`py-8 items-center`}>
              <ActivityIndicator color={tw.color("base-green")} size="large" />
            </View>
          ) : transactions.length === 0 ? (
            <View style={tw`py-8 items-center`}>
              <Feather name="inbox" size={48} color="#8F92A1" />
              <Text
                style={tw.style(`text-base text-[#8F92A1] mt-4`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                No transactions yet
              </Text>
            </View>
          ) : (
            <View style={tw`bg-white rounded-lg overflow-hidden`}>
              <FlatList
                data={transactions}
                renderItem={renderTransaction}
                keyExtractor={(item) => item.payment_id}
                scrollEnabled={false}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Top-up Modal */}
      <Modal
        visible={topupModal}
        transparent
        animationType="slide"
        onRequestClose={closeTopupModal}
        onDismiss={handleModalDismiss}
      >
        <View style={tw`flex-1 justify-end`}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
            onPress={closeTopupModal}
          />
          <View
            style={[tw`bg-white rounded-t-[40px] px-4 pt-6 pb-8`, { maxHeight: '60%' }]}
          >
            <View
              style={tw`flex-row items-center justify-between mb-5`}
            >
              <Text
                style={tw.style(`text-xl text-black`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Top Up Wallet
              </Text>
              <TouchableOpacity
                onPress={closeTopupModal}
                style={tw`h-[34px] w-[34px] items-center justify-center bg-black rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={tw`pb-6`}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
            {/* Method Selection */}
            <View style={tw`flex-row gap-x-2 mb-6`}>
              <TouchableOpacity
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
              </TouchableOpacity>
              <TouchableOpacity
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
              </TouchableOpacity>
            </View>

            {topupMethod === "card" ? (
              <>
                <View style={tw`mb-4`}>
                  <Text
                    style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Enter Amount
                  </Text>
                  <TextInput
                    ref={topupAmountRef}
                    style={tw.style(
                      `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                      {
                        fontFamily: "RobotoMedium",
                      }
                    )}
                    value={cardAmount}
                    onChangeText={(text) => setCardAmount(text.replace(/[^0-9.]/g, ""))}
                    placeholder="₦0.00"
                    placeholderTextColor="#D0D0D0"
                    keyboardType="numeric"
                  />
                </View>
                <TouchableOpacity
                  onPress={handleCardTopup}
                  disabled={cardAmount.length === 0 || cardLoading}
                  style={tw.style(
                    `bg-base-green py-3.5 rounded-lg`,
                    (cardAmount.length === 0 || cardLoading) && "opacity-50"
                  )}
                >
                  {cardLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-center text-base text-white`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Pay with Card
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={tw`bg-gray-50 rounded-lg p-4 mb-4`}>
                  <Text
                    style={tw.style(`text-xs text-[#6B7280] mb-2`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Include your unique reference when making the transfer so we can match your payment.
                  </Text>
                  <Text
                    style={tw.style(`text-sm text-[#8F92A1] mb-3`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Transfer to this account:
                  </Text>
                  <View
                    style={tw`flex-row items-center justify-between py-2 border-b border-gray-200`}
                  >
                    <Text
                      style={tw.style(`text-base text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Bank Name
                    </Text>
                    <Text
                      style={tw.style(`text-base text-black`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {transferBankName || "N/A"}
                    </Text>
                  </View>
                  <View
                    style={tw`flex-row items-center justify-between py-2 border-b border-gray-200`}
                  >
                    <Text
                      style={tw.style(`text-base text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Account Name
                    </Text>
                    <Text
                      style={tw.style(`text-base text-black`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {transferAccountName || "N/A"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={tw`flex-row items-center justify-between py-2`}
                    onPress={async () => {
                      if (transferAccountNumber) {
                        await Clipboard.setStringAsync(String(transferAccountNumber));
                        showMessage({ type: "info", message: "Account number copied!" });
                      }
                    }}
                  >
                    <Text
                      style={tw.style(`text-base text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Account Number
                    </Text>
                    <View style={tw`flex-row items-center gap-x-2`}>
                      <Text
                        style={tw.style(`text-base text-black`, {
                          fontFamily: "RobotoMedium",
                        })}
                      >
                        {transferAccountNumber || "N/A"}
                      </Text>
                      {transferAccountNumber ? (
                        <Feather name="copy" size={18} color="#3C8F7C" />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </View>
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
        onRefresh={onRefresh}
        showMessage={showMessage}
      />
    </ImageBackground>
  );
};

export default WalletScreen;
