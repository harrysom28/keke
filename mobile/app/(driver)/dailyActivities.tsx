import { ADD_BANK_ACCOUNT, DRIVER_EARNINGS } from "@/constants";
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
  useMemo,
  useRef,
  useState,
} from "react";

import { AppContext } from "../context";
import { Dropdown } from "react-native-element-dropdown";
import { Portal } from "@gorhom/portal";
import { TDriverStats } from "@/types";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface IProps {
  placeholder?: string;
  label: string;
  secure?: boolean;
  type?: KeyboardTypeOptions;
  value: string;
  onChange: (text: string) => void;
}

function InputItem({
  type = "default",
  label = "",
  placeholder = "",
  secure = false,
  value,
  onChange,
}: Readonly<IProps>) {
  const [show, setShow] = useState(secure);
  return (
    <View style={tw`relative`}>
      <Text
        style={tw.style(`text-[13px] text-black mb-[2px]`, {
          fontFamily: "RobotoMedium",
        })}
      >
        {label}
      </Text>
      <BottomSheetTextInput
        keyboardType={type}
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
  const [loading, setLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [data, setData] = useState<Partial<TDriverStats>>({});
  // Static list of Nigerian banks for dropdown (backend BANK_LIST returns driver's saved accounts, not bank list)
  const bankList = useMemo(() => [
    "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank", "First Bank of Nigeria",
    "First City Monument Bank", "Globus Bank", "Guaranty Trust Bank", "Heritage Bank", "Keystone Bank",
    "Kuda Bank", "PalmPay", "Polaris Bank", "Providus Bank", "Stanbic IBTC Bank", "Standard Chartered",
    "Sterling Bank", "SunTrust Bank", "Union Bank of Nigeria", "United Bank for Africa", "Unity Bank",
    "Wema Bank", "Zenith Bank",
  ].map((name) => ({ name })), []);
  const [changed, setChanged] = useState(false);
  const [state, setState] = useState({
    bank_name: "",
    account_name: "",
    account_number: "",
  });

  const AddBank = () => {
    setAddLoading(true);
    axios
      .post(ADD_BANK_ACCOUNT, {
        bankName: state.bank_name,
        accountName: state.account_name,
        accountNumber: state.account_number,
      }, apiConfig)
      .then(({ data }) => {
        setChanged((prev) => !prev);
        bottomSheetRef?.current?.close();
        setModal(true);
      })
      .catch((err) => {
        console.log(err?.response?.data);
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
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
      // Listener for when the keyboard is hidden
      const keyboardHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          // Do something here when the keyboard is closed

          bottomSheetRef?.current?.snapToPosition("52%");
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
          snapPoints={["53%"]}
          ref={bottomSheetRef}
          backdropComponent={renderBackdrop}
          handleComponent={() => (
            <BottomSheetView
              style={tw.style(
                `flex-row items-center bg-[#F6F6F6] justify-between w-[99%] mt-5 py-3 px-4 rounded-t-[16px]`,
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
                Add Bank
              </Text>
              <TouchableOpacity
                onPress={() => bottomSheetRef?.current?.close()}
                style={tw`h-[34px] w-[34px] flex-col items-center justify-center bg-black p-1 rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </BottomSheetView>
          )}
          style={tw`px-4 rounded-t-[40px]`}
          //   enablePanDownToClose
        >
          <BottomSheetView style={tw`flex-col gap-y-2 mt-8`}>
            <View style={tw`relative`}>
              <Text
                style={tw.style(`text-[13px] text-black mb-[2px]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Select Bank Name
              </Text>

              <Dropdown
                style={tw.style(
                  `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoMedium",
                  }
                )}
                mode="default"
                data={
                  bankList.length > 0
                    ? bankList.map((item) => ({
                        label: item.name,
                        value: item.name,
                      }))
                    : [{ label: "No data available", value: "" }]
                }
                // search={false}
                maxHeight={300}
                labelField={"label"}
                valueField={"value"}
                itemTextStyle={tw.style(`text-black text-sm`, {
                  fontFamily: "RobotoMedium",
                })}
                selectedTextStyle={tw.style(`text-black text-sm`, {
                  fontFamily: "RobotoMedium",
                })}
                placeholderStyle={tw.style(`text-[#D0D0D0] text-[16px]`, {
                  fontFamily: "RobotoMedium",
                })}
                containerStyle={tw.style(
                  `text-black text-xs shadow-none border mt-1`
                )}
                placeholder={""}
                value={state.bank_name}
                onChange={(item) => {
                  console.log(item.value);
                  setState((prev) => ({ ...prev, bank_name: item.value }));
                }}
              />
            </View>
            <InputItem
              label="Account Name"
              value={state.account_name}
              onChange={(account_name) =>
                setState((prev) => ({ ...prev, account_name }))
              }
            />
            <InputItem
              label="Account Number"
              value={state.account_number}
              onChange={(account_number) =>
                setState((prev) => ({ ...prev, account_number }))
              }
            />

            <TouchableOpacity
              onPress={AddBank}
              style={tw`bg-base-green mt-4 py-3`}
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
          </BottomSheetView>
        </BottomSheet>
      </Portal>
    </>
  );
};

export default DailyActivities;
