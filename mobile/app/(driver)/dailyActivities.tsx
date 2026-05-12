import { ADD_BANK_ACCOUNT, BANK_DIRECTORY_NG, BANK_DIRECTORY_NG_FALLBACK, BANK_RESOLVE_ACCOUNT, BANK_RESOLVE_ACCOUNT_FALLBACK, DRIVER_EARNINGS } from "@/constants";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather, FontAwesome } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AppContext } from "../context";
import { Dropdown } from "react-native-element-dropdown";
import { Portal } from "@gorhom/portal";
import { TDriverStats } from "@/types";
import axios, { isAxiosError } from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { AuthState } from "@/store/AuthSlice";

interface IProps {
  placeholder?: string;
  label: string;
  secure?: boolean;
  type?: KeyboardTypeOptions;
  value: string;
  onChange: (text: string) => void;
  maxLength?: number;
  editable?: boolean;
  hideLabel?: boolean;
}

function InputItem({
  type = "default",
  label = "",
  placeholder = "",
  secure = false,
  value,
  onChange,
  maxLength,
  editable = true,
  hideLabel = false,
}: Readonly<IProps>) {
  const [show, setShow] = useState(secure);
  return (
    <View style={tw`relative`}>
      {!hideLabel ? (
        <Text
          style={tw.style(`text-[13px] text-black mb-[2px]`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {label}
        </Text>
      ) : null}
      <BottomSheetTextInput
        keyboardType={type}
        editable={editable}
        maxLength={maxLength}
        style={tw.style(
          `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
          {
            fontFamily: "RobotoMedium",
          }
        )}
        placeholder={placeholder}
        placeholderTextColor="#D0D0D0"
        secureTextEntry={show}
        value={value}
        onChangeText={onChange}
      />
      {secure && (
        <Pressable
          onPress={() => setShow((prev) => !prev)}
          style={tw`absolute top-3.5 right-4`}
        >
          <Feather name={show ? "eye" : "eye-off"} size={16} color="#414141" />
        </Pressable>
      )}
    </View>
  );
}

const DailyActivities = () => {
  let isFocused = useIsFocused();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [modal, setModal] = useState(false);

  const { apiConfig } = useContext(AppContext);
  const { token } = useSelector(AuthState);
  const [loading, setLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [data, setData] = useState<Partial<TDriverStats>>({});

  type NgBank = { code: string; name: string; slug?: string | null };
  const [ngBanks, setNgBanks] = useState<NgBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksUnavailable, setBanksUnavailable] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);

  const [changed, setChanged] = useState(false);
  const [state, setState] = useState({
    bank_code: "",
    bank_name: "",
    account_name: "",
    account_number: "",
  });

  const latestFormRef = useRef(state);
  latestFormRef.current = state;

  const authHeaders = useCallback(
    () => ({
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }),
    [token]
  );

  const fetchNigerianBanks = useCallback(async () => {
    if (!token) return;
    setBanksLoading(true);
    const urls = [BANK_DIRECTORY_NG, BANK_DIRECTORY_NG_FALLBACK];
    try {
      let body: {
        data?: { banks?: NgBank[]; unavailable?: boolean };
        message?: string;
      } | null = null;
      for (let i = 0; i < urls.length; i++) {
        try {
          const r = await axios.get(urls[i], authHeaders());
          body = r.data;
          break;
        } catch (err) {
          const status = isAxiosError(err) ? err.response?.status : 0;
          if (status === 404 && i < urls.length - 1) continue;
          throw err;
        }
      }
      const list = body?.data?.banks;
      const unavailable = Boolean(body?.data?.unavailable);
      if (Array.isArray(list) && list.length > 0) {
        setNgBanks(list);
        setBanksUnavailable(false);
      } else {
        setNgBanks([]);
        setBanksUnavailable(unavailable || true);
        showMessage({
          type: "warning",
          message:
            typeof body?.message === "string" && body.message.trim()
              ? body.message.trim()
              : "Could not load the bank list. Check your connection or try again.",
        });
      }
    } catch (err) {
      setNgBanks([]);
      setBanksUnavailable(true);
      showMessage({
        type: "danger",
        message: getErrorMessage(err, "Could not load banks."),
      });
    } finally {
      setBanksLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    const digits = state.account_number.replace(/\D/g, "");
    if (!state.bank_code || digits.length !== 10 || !token) {
      setResolveLoading(false);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      const bankCodeAtRequest = state.bank_code;
      const digitsAtRequest = digits;
      const resolveUrls = [BANK_RESOLVE_ACCOUNT, BANK_RESOLVE_ACCOUNT_FALLBACK];
      setResolveLoading(true);

      (async () => {
        try {
          let body: { data?: { account_name?: string } } | null = null;
          for (let i = 0; i < resolveUrls.length; i++) {
            try {
              const r = await axios.post(
                resolveUrls[i],
                { accountNumber: digitsAtRequest, bankCode: bankCodeAtRequest },
                authHeaders()
              );
              body = r.data;
              break;
            } catch (err) {
              const status = isAxiosError(err) ? err.response?.status : 0;
              if (status === 404 && i < resolveUrls.length - 1) continue;
              throw err;
            }
          }
          if (cancelled) return;
          const cur = latestFormRef.current;
          if (
            cur.bank_code !== bankCodeAtRequest ||
            cur.account_number.replace(/\D/g, "") !== digitsAtRequest
          ) {
            return;
          }
          const name = body?.data?.account_name;
          if (typeof name === "string" && name.trim()) {
            setState((prev) => ({ ...prev, account_name: name.trim() }));
          }
        } catch (err) {
          if (cancelled) return;
          const cur = latestFormRef.current;
          if (
            cur.bank_code !== bankCodeAtRequest ||
            cur.account_number.replace(/\D/g, "") !== digitsAtRequest
          ) {
            return;
          }
          setState((prev) => ({ ...prev, account_name: "" }));
          showMessage({
            type: "warning",
            message: getErrorMessage(err, "Could not verify this account number for the selected bank."),
          });
        } finally {
          if (!cancelled) {
            setResolveLoading(false);
          }
        }
      })();
    }, 550);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      setResolveLoading(false);
    };
  }, [state.bank_code, state.account_number, token, authHeaders]);

  const AddBank = () => {
    const digits = state.account_number.replace(/\D/g, "");
    if (!state.bank_name.trim() || digits.length !== 10) {
      showMessage({
        type: "danger",
        message: "Select a bank and enter a 10-digit account number.",
      });
      return;
    }
    if (ngBanks.length > 0 && !state.bank_code) {
      showMessage({ type: "danger", message: "Please select a bank from the list." });
      return;
    }
    if (!state.account_name.trim()) {
      showMessage({
        type: "danger",
        message: "Account name is required. It will appear after your number is verified.",
      });
      return;
    }

    setAddLoading(true);
    axios
      .post(
        ADD_BANK_ACCOUNT,
        {
          bankName: state.bank_name,
          bankCode: state.bank_code || undefined,
          accountName: state.account_name.trim(),
          accountNumber: digits,
        },
        apiConfig
      )
      .then(({ data }) => {
        setChanged((prev) => !prev);
        bottomSheetRef?.current?.close();
        setModal(true);
      })
      .catch((err) => {
        console.log(err?.response?.data);
        const errorMessage = getErrorMessage(err, "An error occurred. Please try again.");
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => setAddLoading(false));
  };

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      axios
        .get(DRIVER_EARNINGS, apiConfig)
        .then(({ data }) => {
          // Ensure we only set valid data, not error objects
          if (data?.data && typeof data.data === 'object' && !data.data.statusCode && !data.data.status) {
            setData(data.data);
          } else {
            // If response contains an error, don't set it in state
            console.warn('Invalid data received from DRIVER_EARNINGS:', data);
            setData({});
          }
        })
        .catch((err) => {
          console.log(err?.response?.data);
          const errorMessage = typeof err?.response?.data?.message === 'string' 
            ? err.response.data.message 
            : String(err.response.data.message || 'An error occurred');
          if (errorMessage && errorMessage !== 'An error occurred') {
            showMessage({
              type: "danger",
              message: errorMessage,
            });
          } else if (err?.response?.data?.error) {
            const errorData = err.response.data.error;
            const extractedErrorMessage = typeof errorData === 'string' 
              ? errorData 
              : (errorData?.message || errorData?.name || 'An error occurred');
            showMessage({
              type: "danger",
              message: extractedErrorMessage,
            });
          } else {
            showMessage({
              type: "danger",
              message: 'An error occurred. Please try again.',
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused, changed]);


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

  const style = {
    container: tw`flex-row justify-between py-3.5 px-5`,
    line: tw`border-b border-[#EFEFF4]`,
    title: tw.style(`text-[14px] text-[#030303]`, {
      fontFamily: "RobotoRegular",
    }),
    text: tw.style(`text-[14px] text-[#030303]`, {
      fontFamily: "RobotoMedium",
    }),
  };

  useEffect(() => {
    if (isFocused) {
      // Listener for when the keyboard is hidden. Snap value MUST match
      // the BottomSheet's `snapPoints` below — gorhom auto-expands the sheet
      // when the keyboard appears, and we restore the same height on dismiss.
      // If snapPoints changes, update this percentage too.
      const keyboardHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          bottomSheetRef?.current?.snapToPosition("68%");
        }
      );

      // Cleanup the listener on component unmount
      return () => {
        keyboardHideListener.remove();
      };
    }
  }, [isFocused]);

  return (
    <>
      <Modal visible={modal} transparent style={tw`flex-1`}>
        <StatusBar backgroundColor={tw.color(`bg-black bg-opacity-30`)} />
        <View
          style={tw`h-full flex-col justify-center items-center bg-black bg-opacity-30 px-6`}
        >
          <View
            style={tw`flex-col gap-y-6 bg-white w-full p-5 h-[460px] rounded-[12px]`}
          >
            <Pressable
              onPress={() => {
                bottomSheetRef?.current?.close();
                setModal(false);
              }}
            >
              <AntDesign
                name="close"
                size={24}
                style={tw`self-end `}
                color="#5A5A5A"
              />
            </Pressable>
            <Image
              resizeMode="contain"
              source={require("@images/check.png")}
              style={tw`w-[122px] h-[122px] my-2 self-center`}
            />
            <Text
              style={tw.style(`text-[24px] text-black text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Congratulations
            </Text>
            <Text
              style={tw.style(`text-[15px] text-[#A0A0A0] text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Account details added
            </Text>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <ImageBackground
          style={tw.style(`bg-white`, {
            flex: 1,
          })}
          source={require("@images/pattern-bg.png")}
        >
          <StatusBar barStyle="light-content" />
          <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5 h-[188px]`)}>
            <View style={tw`flex-row items-center justify-between w-[75%]`}>
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
                Daily Activities
              </Text>
            </View>
          </View>
          <ScrollView
            style={tw`flex-1`}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View>
                <ActivityIndicator color={tw.color("base-green")} size={"large"} />
              </View>
            ) : (
          <View style={tw.style(`-mt-20 z-50 pt-4 pb-8 px-6`)}>
            <View
              style={tw.style(`flex-col px-3.5 py-10 bg-white rounded-[10px]`, {
                elevation: 4,
              })}
            >
              <View
                style={tw`flex-row justify-between pb-3 mb-3 border-b border-[#B8B8B8]`}
              >
                <View style={tw`w-[50%] border-r border-[#B8B8B8]`}>
                  <Text
                    style={tw.style(`text-[14px] text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Earned Today
                  </Text>
                  <Text
                    style={tw.style(`text-[24px] text-black`, {
                      fontFamily: "RobotoBlack",
                    })}
                  >
                    ₦{data?.in_app_payment}
                  </Text>
                </View>
                <View>
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
                  >
                    ₦{data?.total_balance}
                  </Text>
                </View>
              </View>
              <View style={tw`flex-row `}>
                <View style={tw`w-[33.33%]`}>
                  <Text
                    style={tw.style(`text-[13px] text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Total Trips
                  </Text>
                  <Text
                    style={tw.style(`text-[16px] text-black`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {data?.total_trip}
                  </Text>
                </View>
                <View style={tw`w-[33.33%]`}>
                  <Text
                    style={tw.style(`text-[13px] text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Time Online
                  </Text>
                  <Text
                    style={tw.style(`text-[16px] text-black`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {data?.time_online}
                  </Text>
                </View>
                <View style={tw`w-[33.33%]`}>
                  <Text
                    style={tw.style(`text-[13px] text-[#8F92A1]`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Total Distance
                  </Text>
                  <Text
                    style={tw.style(`text-[16px] text-black`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    {typeof data?.total_distance === 'number' ? data.total_distance : (typeof data?.total_distance === 'string' ? parseFloat(data.total_distance) || 0 : 0)} km
                  </Text>
                </View>
              </View>
            </View>

            <View
              style={tw.style(
                `flex-row gap-x-2 items-center bg-white px-5 pt-7 pb-3 -mt-4 rounded-[10px]`,
                {
                  zIndex: -1,
                  elevation: 6,
                  display: data?.driver_account_number ? "flex" : "none",
                }
              )}
            >
              <FontAwesome
                name="bank"
                size={20}
                style={tw`self-start p-2.5 bg-[#3629B7]  rounded-[10px]`}
                color="white"
              />
              <View>
                <Text
                  style={tw.style(`text-[20px] text-[#343434]`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  {data?.driver_bank_name}
                </Text>
                <Text
                  style={tw.style(`text-[12px] text-[#989898]`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  A/No: {data?.driver_account_number}
                </Text>
              </View>
            </View>

            <View style={tw`my-7`}>
              <View style={{ ...style.container, ...style.line }}>
                <Text style={style.title}>Transfer</Text>
                <Text style={style.text}>₦{typeof data?.transfer === 'number' ? data.transfer : (typeof data?.transfer === 'string' ? parseFloat(data.transfer) || 0 : 0)}</Text>
              </View>
              <View style={{ ...style.container, ...style.line }}>
                <Text style={style.title}>Cash Payment</Text>
                <Text style={style.text}>₦{typeof data?.cash_payment === 'number' ? data.cash_payment : (typeof data?.cash_payment === 'string' ? parseFloat(data.cash_payment) || 0 : 0)}</Text>
              </View>
              <View style={{ ...style.container, ...style.line }}>
                <Text style={style.title}>In-App Payment</Text>
                <Text style={style.text}>₦{typeof data?.in_app_payment === 'number' ? data.in_app_payment : (typeof data?.in_app_payment === 'string' ? parseFloat(data.in_app_payment) || 0 : 0)}</Text>
              </View>
              <View style={{ ...style.container }}>
                <Text style={style.title}>Daily Task Completed</Text>
                <Text style={style.text}>₦{typeof data?.daily_task_completed === 'number' ? data.daily_task_completed : (typeof data?.daily_task_completed === 'string' ? parseFloat(data.daily_task_completed) || 0 : 0)}</Text>
              </View>
            </View>

            <Pressable
              onPress={() => {
                setState({
                  bank_code: "",
                  bank_name: "",
                  account_name: "",
                  account_number: "",
                });
                void fetchNigerianBanks();
                bottomSheetRef?.current?.expand();
              }}
              style={tw`bg-base-green py-3.5`}
            >
              <Text
                style={tw.style(`text-[17px] text-white text-center`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Add Bank
              </Text>
            </Pressable>
          </View>
            )}
          </ScrollView>
        </ImageBackground>
      </KeyboardAvoidingView>
      <Portal>
        <BottomSheet
          index={-1}
          snapPoints={["68%"]}
          ref={bottomSheetRef}
          backdropComponent={renderBackdrop}
          handleIndicatorStyle={tw`bg-[#D0D0D0] w-10 h-1 rounded-full`}
          handleStyle={tw`bg-white rounded-t-[40px] pt-3 pb-1`}
          backgroundStyle={tw`bg-white rounded-t-[40px]`}
          style={tw`px-4`}
          //   enablePanDownToClose
        >
          <BottomSheetView style={tw`flex-col px-1 pb-4`}>
            {/* Title row rendered INSIDE the content so it can never overlap
                the form below. Previously this lived in `handleComponent`,
                which @gorhom/bottom-sheet measures with `handleHeight`; even
                with `handleHeight={80}` the dropdown still slid under the
                gray bar, so we render the title as a normal child instead. */}
            <View
              style={tw.style(
                `flex-row items-center bg-[#F6F6F6] justify-between mt-2 mb-4 py-3 px-4 rounded-[16px]`,
                {
                  elevation: 5,
                }
              )}
            >
              {/* Spacer keeps the title visually centered against the close
                  button on the right. */}
              <View style={tw`h-[34px] w-[34px]`} />
              <Text
                style={tw.style(`flex-1 text-xl text-black text-center`, {
                  fontFamily: "RobotoRegular",
                })}
                numberOfLines={1}
              >
                Add Bank
              </Text>
              <TouchableOpacity
                onPress={() => bottomSheetRef?.current?.close()}
                style={tw`h-[34px] w-[34px] flex-col items-center justify-center bg-black p-1 rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <View style={tw`flex-col gap-y-2`}>
              <View style={tw`relative`}>
                <View style={tw`flex-row items-center justify-between mb-[2px]`}>
                  <Text
                    style={tw.style(`text-[13px] text-black`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Select Bank
                  </Text>
                  {banksUnavailable && ngBanks.length === 0 && !banksLoading ? (
                    <TouchableOpacity onPress={() => void fetchNigerianBanks()}>
                      <Text
                        style={tw.style(`text-[13px] text-[#3C8F7C]`, {
                          fontFamily: "RobotoMedium",
                        })}
                      >
                        Retry
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Dropdown
                  style={tw.style(
                    `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
                    {
                      fontFamily: "RobotoMedium",
                    }
                  )}
                  mode="default"
                  search
                  searchPlaceholder="Search bank..."
                  data={
                    ngBanks.length > 0
                      ? ngBanks.map((b) => ({
                          label: b.name,
                          value: b.code,
                        }))
                      : [{ label: banksLoading ? "Loading banks…" : "No banks loaded", value: "__none__" }]
                  }
                  disable={ngBanks.length === 0}
                  maxHeight={280}
                  labelField="label"
                  valueField="value"
                  itemTextStyle={tw.style(`text-black text-sm`, {
                    fontFamily: "RobotoMedium",
                  })}
                  selectedTextStyle={tw.style(`text-black text-sm`, {
                    fontFamily: "RobotoMedium",
                  })}
                  placeholderStyle={tw.style(`text-[#D0D0D0] text-[16px]`, {
                    fontFamily: "RobotoMedium",
                  })}
                  containerStyle={tw.style(`text-black text-xs shadow-none border mt-1`)}
                  placeholder={banksLoading ? "Loading…" : "Choose your bank"}
                  value={state.bank_code}
                  onChange={(item) => {
                    if (item.value === "__none__") return;
                    setState((prev) => ({
                      ...prev,
                      bank_code: item.value,
                      bank_name: item.label,
                      account_name: "",
                    }));
                  }}
                />
              </View>

              <InputItem
                label="Account Number"
                type="number-pad"
                placeholder="10 digits"
                value={state.account_number}
                maxLength={10}
                onChange={(raw) => {
                  const account_number = raw.replace(/\D/g, "").slice(0, 10);
                  setState((prev) => ({
                    ...prev,
                    account_number,
                    account_name: account_number.length === 10 ? prev.account_name : "",
                  }));
                }}
              />

              <View style={tw`relative`}>
                <View style={tw`flex-row items-center justify-between mb-[2px]`}>
                  <Text
                    style={tw.style(`text-[13px] text-black`, {
                      fontFamily: "RobotoMedium",
                    })}
                  >
                    Account Name
                  </Text>
                  {resolveLoading ? (
                    <ActivityIndicator size="small" color={tw.color("base-green")} />
                  ) : null}
                </View>
                <Text
                  style={tw.style(`text-[11px] text-[#8F92A1] mb-1`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  Filled automatically when your account number matches the bank.
                </Text>
                <InputItem
                  hideLabel
                  label="Account name"
                  placeholder="Verified account name"
                  value={state.account_name}
                  onChange={(account_name) =>
                    setState((prev) => ({ ...prev, account_name }))
                  }
                />
              </View>

              <TouchableOpacity
                onPress={AddBank}
                disabled={
                  addLoading ||
                  banksLoading ||
                  (ngBanks.length === 0 && banksUnavailable) ||
                  !state.bank_code ||
                  state.account_number.replace(/\D/g, "").length !== 10 ||
                  !state.account_name.trim()
                }
                style={tw.style(
                  `bg-base-green mt-4 py-3`,
                  (addLoading ||
                    banksLoading ||
                    (ngBanks.length === 0 && banksUnavailable) ||
                    !state.bank_code ||
                    state.account_number.replace(/\D/g, "").length !== 10 ||
                    !state.account_name.trim()) &&
                    "opacity-50"
                )}
              >
                {addLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text
                    style={tw.style(`text-[17px] text-white text-center`, {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Save
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </BottomSheetView>
        </BottomSheet>
      </Portal>
    </>
  );
};

export default DailyActivities;
