import React, { useState, useEffect, useContext } from "react";
import {
  ImageBackground,
  StatusBar,
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
import { getErrorMessage } from "@/utils/errorHandler";
import { TOPUP, INITIATE_PAYMENT, WITHDRAWAL, DRIVER_EARNINGS } from "@/constants";
import apiClient from "@/utils/apiClient";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";

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
  const [refreshing, setRefreshing] = useState(false);
  const [topupModal, setTopupModal] = useState(false);
  const [topupMethod, setTopupMethod] = useState<"dva" | "card">("dva");
  const [cardAmount, setCardAmount] = useState("");
  const [cardLoading, setCardLoading] = useState(false);
  const [bankAmount, setBankAmount] = useState("");
  const [bankLoading, setBankLoading] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawDetails, setWithdrawDetails] = useState<any>({});

  useEffect(() => {
    fetchTransactions();
    fetchWithdrawDetails();
  }, []);

  const fetchWithdrawDetails = async () => {
    try {
      const { data } = await axios.get(DRIVER_EARNINGS, apiConfig);
      if (data?.data) {
        setWithdrawDetails(data.data);
      }
    } catch (error: any) {
      console.log("Error fetching withdraw details:", error);
    }
  };

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
      // Silently handle 404 errors
      if (error?.response?.status === 404) {
        console.log('Resource not found (404) - silently handling');
        return;
      }
      // Use centralized error handler to extract safe string message
      const errorMessage = getErrorMessage(error, 'An error occurred. Please try again.');
      showMessage({
        type: "danger",
        message: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchTransactions(), getCurrentUser()]);
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
        INITIATE_PAYMENT,
        { amount, type: "topup" },
        apiConfig
      );

      if (data?.data?.payment_url) {
        const canOpen = await Linking.canOpenURL(data.data.payment_url);
        if (canOpen) {
          await Linking.openURL(data.data.payment_url);
          showMessage({
            type: "info",
            message: "Complete payment in the browser. Your wallet will be updated automatically.",
          });
          setCardAmount("");
          setTopupModal(false);
        } else {
          showMessage({
            type: "danger",
            message: "Could not open payment page",
          });
        }
      } else {
        showMessage({
          type: "danger",
          message: data?.message || "Payment initialization failed",
        });
      }
    } catch (error: any) {
      console.log("Error initializing payment:", error);
      // Use centralized error handler to extract safe string message
      const errorMessage = getErrorMessage(error, 'Could not initialize payment');
      showMessage({
        type: "danger",
        message: errorMessage,
      });
    } finally {
      setCardLoading(false);
    }
  };

  const handleBankTopup = async () => {
    const amount = parseFloat(bankAmount);
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

    setBankLoading(true);
    try {
      const { data } = await axios.post(
        TOPUP,
        { amount, method: "bank_transfer" },
        apiConfig
      );

      showMessage({
        type: "success",
        message: data?.message || "Top-up request submitted. Balance will be updated after verification.",
      });
      setBankAmount("");
      setTopupModal(false);
      onRefresh();
    } catch (error: any) {
      console.log("Error submitting bank transfer:", error);
      // Use centralized error handler to extract safe string message
      const errorMessage = getErrorMessage(error, 'Could not submit top-up request');
      showMessage({
        type: "danger",
        message: errorMessage,
      });
    } finally {
      setBankLoading(false);
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
      return <AntDesign name="arrowdown" size={20} color="#3C8F7C" />;
    } else if (type === "withdrawal") {
      return <AntDesign name="arrowup" size={20} color="#F31717" />;
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
          <Text
            style={tw.style(`text-white text-4xl mb-4`, {
              fontFamily: "RobotoBold",
            })}
          >
            ₦{parseFloat(user?.profile?.balance || "0").toLocaleString()}
          </Text>
          <View style={tw`flex-row gap-x-3`}>
            <TouchableOpacity
              onPress={() => setTopupModal(true)}
              style={tw`flex-1 bg-white py-3 rounded-lg`}
            >
              <Text
                style={tw.style(`text-center text-base-green text-base`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Top Up
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setWithdrawModal(true)}
              style={tw`flex-1 bg-white py-3 rounded-lg border border-base-green`}
            >
              <Text
                style={tw.style(`text-center text-base-green text-base`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Withdraw
              </Text>
            </TouchableOpacity>
          </View>
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
      {topupModal && (
        <View
          style={tw`absolute inset-0 bg-black/50 justify-end`}
          onTouchEnd={() => setTopupModal(false)}
        >
          <View
            style={tw`bg-white rounded-t-[40px] px-4 pt-6 pb-8 max-h-[70%]`}
            onTouchEnd={(e) => e.stopPropagation()}
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
                onPress={() => setTopupModal(false)}
                style={tw`h-[34px] w-[34px] items-center justify-center bg-black rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

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
                <View style={tw`mb-4`}>
                  <Text
                    style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Enter Amount
                  </Text>
                  <TextInput
                    style={tw.style(
                      `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                      {
                        fontFamily: "RobotoMedium",
                      }
                    )}
                    value={bankAmount}
                    onChangeText={(text) => setBankAmount(text.replace(/[^0-9.]/g, ""))}
                    placeholder="₦0.00"
                    placeholderTextColor="#D0D0D0"
                    keyboardType="numeric"
                  />
                </View>

                <View style={tw`bg-gray-50 rounded-lg p-4 mb-4`}>
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
                      {user?.profile?.topup_bank_name || "N/A"}
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
                      {user?.profile?.topup_account_name || "N/A"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={tw`flex-row items-center justify-between py-2`}
                    onPress={async () => {
                      const accountNumber =
                        user?.profile?.topup_account_number;
                      if (accountNumber) {
                        await Clipboard.setStringAsync(accountNumber);
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
                        {user?.profile?.topup_account_number || "N/A"}
                      </Text>
                      {user?.profile?.topup_account_number && (
                        <Feather name="copy" size={18} color="#3C8F7C" />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={handleBankTopup}
                  disabled={bankAmount.length === 0 || bankLoading}
                  style={tw.style(
                    `bg-base-green py-3.5 rounded-lg`,
                    (bankAmount.length === 0 || bankLoading) && "opacity-50"
                  )}
                >
                  {bankLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-center text-base text-white`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Submit Top-up Request
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      {/* Withdrawal Modal */}
      {withdrawModal && (
        <View
          style={tw`absolute inset-0 bg-black/50 justify-end`}
          onTouchEnd={() => setWithdrawModal(false)}
        >
          <View
            style={tw`bg-white rounded-t-[40px] px-4 pt-6 pb-8 max-h-[70%]`}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <View
              style={tw`flex-row items-center justify-between mb-5`}
            >
              <Text
                style={tw.style(`text-xl text-black`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Withdraw Funds
              </Text>
              <TouchableOpacity
                onPress={() => setWithdrawModal(false)}
                style={tw`h-[34px] w-[34px] items-center justify-center bg-black rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            {withdrawDetails?.driver_account_number ? (
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
                    style={tw.style(
                      `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                      {
                        fontFamily: "RobotoMedium",
                      }
                    )}
                    value={withdrawAmount}
                    onChangeText={(text) => setWithdrawAmount(text.replace(/[^0-9.]/g, ""))}
                    placeholder="₦0.00"
                    placeholderTextColor="#D0D0D0"
                    keyboardType="numeric"
                  />
                </View>

                <View style={tw`bg-gray-50 rounded-lg p-4 mb-4`}>
                  <Text
                    style={tw.style(`text-sm text-[#8F92A1] mb-3`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Withdrawal Details
                  </Text>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Bank Name
                    </Text>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {withdrawDetails?.driver_bank_name || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row items-center justify-between mb-2`}>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Account Name
                    </Text>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {withdrawDetails?.driver_account_name || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoRegular",
                      })}
                    >
                      Account Number
                    </Text>
                    <Text
                      style={tw.style(`text-sm text-black`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      {withdrawDetails?.driver_account_number || "N/A"}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={handleWithdraw}
                  disabled={withdrawAmount.length === 0 || withdrawLoading}
                  style={tw.style(
                    `bg-base-green py-3.5 rounded-lg`,
                    (withdrawAmount.length === 0 || withdrawLoading) && "opacity-50"
                  )}
                >
                  {withdrawLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-center text-base text-white`, {
                        fontFamily: "RobotoMedium",
                      })}
                    >
                      Withdraw
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={tw`py-8 items-center`}>
                  <Feather name="alert-circle" size={48} color="#F31717" />
                  <Text
                    style={tw.style(`text-base text-black mt-4 text-center`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    No bank account added
                  </Text>
                  <Text
                    style={tw.style(`text-sm text-[#8F92A1] mt-2 text-center px-4`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Please add your bank account details in Daily Activities to withdraw funds
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setWithdrawModal(false);
                    router.push("/(driver)/dailyActivities");
                  }}
                  style={tw`bg-base-green py-3.5 rounded-lg`}
                >
                  <Text
                    style={tw.style(`text-center text-base text-white`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Add Bank Account
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </ImageBackground>
  );
};

export default WalletScreen;
