import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BottomSheet, { BottomSheetMethods } from "@devvie/bottom-sheet";
import {
  DRIVER_ACCEPT_RIDE,
  DRIVER_COMPLETE_RIDE,
  DRIVER_CONFIRM_PAYMENT,
  DRIVER_PAY_CHANGE,
  DRIVER_REJECT_RIDE,
  DRIVER_START_RIDE,
} from "@/constants";
import { Defs, Line, LinearGradient, Path, Stop, Svg } from "react-native-svg";
import React, {
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AppContext } from "@/app/context";
import DriverChatModal from "@/shared/modal/driverChat";
import { Ionicons } from "@expo/vector-icons";
import { MapArrowSvg } from "@/svg";
import RequestChangeModal from "./new-ride/payChangeSheet";
import { TDriverActiveRide } from "@/types";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { getErrorMessage } from "@/utils/errorHandler";
import tw from "@/lib/tailwind";
import { useFocusEffect } from "expo-router";

interface Props {
  bottomSheetRef: RefObject<BottomSheetMethods>;
  data: Partial<TDriverActiveRide>;
  isActive: boolean;
  getActiveRide: () => void;
  /** Wall-clock ms when the sequential offer expires (Bolt-style window). */
  offerDeadlineMs?: number | null;
  onOfferExpired?: () => void;
}

const NewRide = ({
  bottomSheetRef,
  data,
  isActive,
  getActiveRide,
  offerDeadlineMs = null,
  onOfferExpired,
}: Props) => {
  const { apiConfig } = useContext(AppContext);
  const [loading, setLoading] = useState({
    accept: false,
    start: false,
    reject: false,
    complete: false,
    confirm: false,
    change: false,
  });
  const hasRideStarted = data?.is_ride_started;
  const [show, setShow] = useState<boolean>(false);
  const [chatModal, setChatModal] = useState<boolean>(false);
  const rideId = data?.ride_id ?? data?.rideId ?? '';
  let payment_type = data?.payment_type?.toLocaleLowerCase() as string;
  const leftValue = useRef(new Animated.Value(0)).current;
  const offerExpiredFiredRef = useRef(false);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState<number | null>(null);

  const passengerName =
    data?.passenger?.passenger_name ??
    (data?.passenger as { name?: string } | undefined)?.name ??
    "Passenger";
  const passengerImage =
    data?.passenger?.passenger_image ??
    (data?.passenger as { image?: string } | undefined)?.image;
  const fareDisplay =
    data?.cost ??
    (data?.fare != null ? String(Math.round(Number(data.fare))) : "");

  useEffect(() => {
    offerExpiredFiredRef.current = false;
    if (!offerDeadlineMs) {
      setOfferSecondsLeft(null);
      return;
    }
    const tick = () => {
      const s = Math.max(0, Math.ceil((offerDeadlineMs - Date.now()) / 1000));
      setOfferSecondsLeft(s);
      if (s === 0 && !offerExpiredFiredRef.current) {
        offerExpiredFiredRef.current = true;
        onOfferExpired?.();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offerDeadlineMs, onOfferExpired]);

  const Animate = () => {
    Animated.loop(
      Animated.timing(leftValue, {
        toValue: 280, // New position for `x`
        duration: 2500, // Animation duration in ms
        useNativeDriver: false, // Set to `false` for layout properties like `x`
      }),
      { iterations: -1 } // Infinite iterations
    ).start();
  };

  const handleBack = () => {
    bottomSheetRef?.current?.close();
  };

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        handleBack();
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => {
        backHandler.remove();
      };
    }, [])
  );

  useEffect(() => {
    if (hasRideStarted && !data?.drop_off_completed) {
      Animate();
    } else {
      leftValue.stopAnimation();
      leftValue.setValue(295);
    }
  }, [hasRideStarted]);

  const AcceptRide = () => {
    setLoading((prev) => ({ ...prev, accept: true }));
    axios
      .post(DRIVER_ACCEPT_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        console.log(data);
        getActiveRide();
        showMessage({ type: "success", message: data?.message });
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
      .finally(() => setLoading((prev) => ({ ...prev, accept: false })));
  };
  const RejectRide = () => {
    setLoading((prev) => ({ ...prev, reject: true }));
    axios
      .post(DRIVER_REJECT_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        console.log(data);
        handleBack();
        showMessage({ type: "success", message: data?.message });
        getActiveRide();
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
      .finally(() => setLoading((prev) => ({ ...prev, reject: false })));
  };
  const StartRide = () => {
    setLoading((prev) => ({ ...prev, start: true }));
    axios
      .post(DRIVER_START_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        console.log(data);
        getActiveRide();
        showMessage({ type: "success", message: data?.message });
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
      .finally(() => setLoading((prev) => ({ ...prev, start: false })));
  };
  const CompleteRide = () => {
    setLoading((prev) => ({ ...prev, complete: true }));
    axios
      .post(DRIVER_COMPLETE_RIDE, { rideId }, apiConfig)
      .then(({ data }) => {
        // console.log(data);
        if (payment_type === "wallet") {
          handleBack();
          showMessage({ type: "success", message: data?.message });
        }
        getActiveRide();
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
      .finally(() => setLoading((prev) => ({ ...prev, complete: false })));
  };
  const ConfirmPayment = () => {
    setLoading((prev) => ({ ...prev, confirm: true }));
    axios
      .post(DRIVER_CONFIRM_PAYMENT, { rideId }, apiConfig)
      .then(({ data }) => {
        console.log(data);
        handleBack();
        showMessage({ type: "success", message: data?.message });
        getActiveRide();
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
      .finally(() => setLoading((prev) => ({ ...prev, confirm: false })));
  };

  const PayChange = (amount: string) => {
    setLoading((prev) => ({ ...prev, change: true }));
    axios
      .post(DRIVER_PAY_CHANGE, { rideId, amount }, apiConfig)
      .then(({ data }) => {
        console.log(data);
        showMessage({ type: "success", message: data?.message });
        setShow(false);
      })
      .catch((err) => {
        console.log(DRIVER_PAY_CHANGE, err?.response?.data);
        // Silently handle 404 errors (driver profile not found, etc.)
        if (err?.response?.status === 404) {
          console.log('Resource not found (404) - silently handling');
          return;
        }
        // Use centralized error handler to extract safe string message
        const errorMessage = getErrorMessage(err, 'An error occurred. Please try again.');
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      })
      .finally(() => setLoading((prev) => ({ ...prev, change: false })));
  };

  return (
    <BottomSheet
      height={"80%"}
      ref={bottomSheetRef}
      animationType="spring"
      backdropMaskColor="#19191900"
      openDuration={1000}
      disableKeyboardHandling={false}
      style={tw`gap-y-4 px-6 py-2 rounded-t-[40px] bg-white`}
    >
      <DriverChatModal
        data={{
          id: (data?.passenger?.passenger_id ||
            (data?.passenger as { user_id?: string } | undefined)?.user_id ||
            "") as string,
          rideId: (data?.ride_id ?? data?.rideId) as string,
          name: passengerName,
          image: (passengerImage || "") as string,
        }}
        visible={chatModal}
        onClose={() => setChatModal(false)}
      />
      <RequestChangeModal
        show={show}
        onClose={() => setShow(false)}
        handlePay={(amount) => PayChange(amount)}
        data={data}
        loading={loading.change}
      />
      <View
        style={tw`flex-row items-center justify-between px-4 py-2 bg-black rounded-t-[16px]`}
      >
        <View style={tw`flex-row items-center gap-x-4`}>
          <Image
            source={{
              uri:
                passengerImage ??
                `https://picsum.photos/500/300?random=2`,
            }}
            style={tw.style(
              `h-[48px] w-[48px] rounded-full bg-white border border-white`
            )}
          />
          <View>
            <Text
              style={tw.style(`text-[20px] text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {passengerName}
            </Text>
            {/* <View style={tw`flex-row gap-x-1 items-center`}>
              <AntDesign name="star" size={12} color={tw.color("base-green")} />
              <Text
                style={tw.style(`text-[15px] text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                4.9
              </Text>
            </View> */}
          </View>
        </View>

        <View style={tw`items-end`}>
          {offerSecondsLeft != null && offerSecondsLeft > 0 && !isActive ? (
            <Text
              style={tw.style(`text-xs text-amber-300 mb-1`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {offerSecondsLeft}s to accept
            </Text>
          ) : null}
          <Text
            style={tw.style(`text-xl text-white`, {
              fontFamily: "RobotoMedium",
            })}
          >
            ₦{fareDisplay}
          </Text>
        </View>
      </View>
      <View
        style={tw.style(`flex-row items-start gap-x-2 my-7`, {
          display: hasRideStarted ? "none" : "flex",
        })}
      >
        {MapArrowSvg()}
        <View style={tw`flex-col h-[95px] justify-between w-[88%]`}>
          <View>
            <Text
              style={tw.style(`text-[16px] text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Current location
            </Text>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {data?.origin?.name}
            </Text>
          </View>
          <View>
            <View style={tw`flex-row justify-between`}>
              <Text
                style={tw.style(`text-[16px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Destination
              </Text>
              <Text
                style={tw.style(`text-[16px] text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {data?.arrival_distance}
              </Text>
            </View>
            <Text
              style={tw.style(`text-[12px] text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {data?.destination?.name}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={tw.style(`flex-col gap-y-3 py-4 rounded-[10px]`, {
          display: !hasRideStarted ? "none" : "flex",
        })}
      >
        <View style={tw.style(`flex-col gap-y-3  rounded-[10px] my-11`)}>
          <View style={tw`flex-row justify-between items-center w-full`}>
            <Text
              style={tw.style(`text-[14px] text-black`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {data?.arrival_distance}
            </Text>
            <Text
              style={tw.style(`text-[14px] text-black`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {data?.arrival_time}
            </Text>
          </View>
          <View style={tw`relative`}>
            <Svg width={"100%"} height={5} viewBox="0 0 310 5" fill="none">
              <Line
                x1={2.12}
                y1={2.88}
                x2={307.88}
                y2={2.87997}
                stroke="url(#paint0_linear_538_5518)"
                strokeWidth={4.24}
                strokeLinecap="round"
              />
              <Defs>
                <LinearGradient
                  id="paint0_linear_538_5518"
                  x1={310}
                  y1={5}
                  x2={1.49999}
                  y2={5}
                  gradientUnits="userSpaceOnUse"
                >
                  <Stop stopColor="#3C8F7C" />
                  <Stop offset={1} stopOpacity={0.2} />
                </LinearGradient>
              </Defs>
            </Svg>
            <Animated.View
              style={tw.style(`absolute  -top-[4.5px]`, {
                // transform: [{ translateX:  }], // Apply the translation on X-axis
                left: leftValue,
              })}
            >
              <Svg width={19} height={15} viewBox="0 0 19 15" fill="none">
                <Path
                  d="M17.8066 7.35302C17.8067 7.35307 17.8067 7.35313 17.8068 7.3532L1.2625 13.7162L1.26229 13.7163L1.26276 13.7151L3.71495 7.58962L3.80961 7.35317L3.71497 7.11671L1.26314 0.990265L17.8066 7.35302Z"
                  fill="#3C8F7C"
                  stroke="url(#paint0_linear_538_5521)"
                  strokeWidth={1.27263}
                />
                <Defs>
                  <LinearGradient
                    id="paint0_linear_538_5521"
                    x1={18.7066}
                    y1={7.35374}
                    x2={6.41295}
                    y2={-4.93989}
                    gradientUnits="userSpaceOnUse"
                  >
                    <Stop stopColor="#3C8F7C" />
                    <Stop offset={1} stopOpacity={0.2} />
                  </LinearGradient>
                </Defs>
              </Svg>
            </Animated.View>
          </View>
        </View>
      </View>

      <View style={tw`flex-row justify-between items-center ml-3 mb-5`}>
        <Text
          style={tw.style(`text-sm text-[#5A5A5A] text-center`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Payment type
        </Text>
        <Text
          style={tw.style(`text-lg text-[#030319] text-center uppercase`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {payment_type}
        </Text>
      </View>

      <View style={tw`flex-row items-center justify-center gap-x-8 my-3`}>
        <TouchableOpacity
          onPress={() => {
            let num = data?.passenger?.passenger_phone_number as string;
            if (num.startsWith("0")) {
              Linking.openURL(`tel:${num}`);
            } else {
              Linking.openURL(`tel:+${num}`);
            }
          }}
          style={tw`flex-row items-center gap-x-2`}
        >
          <Ionicons name="call" size={24} color={tw.color("base-green")} />
          <Text
            style={tw.style(`text-[16px] text-[#242E42]`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Call
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setChatModal(true)}
          style={tw`flex-row items-center gap-x-2`}
        >
          <Ionicons
            name="chatbubble-ellipses-sharp"
            size={24}
            color={tw.color("base-green")}
          />
          <Text
            style={tw.style(`text-[16px] text-[#242E42]`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={RejectRide}
          style={tw`flex-row items-center gap-x-2`}
        >
          <Ionicons name="close-circle" size={30} color="black" />
          {loading.reject ? (
            <ActivityIndicator color="#242E42" />
          ) : (
            <Text
              style={tw.style(`text-[16px] text-[#242E42]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Cancel
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={tw`flex-col mt-5 gap-y-4`}>
        {hasRideStarted ? (
          <>
            {data?.drop_off_completed ? (
              <>
                <TouchableOpacity
                  disabled={payment_type === "wallet"}
                  onPress={() => setShow(true)}
                  style={tw.style(
                    `flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`,
                    { opacity: payment_type === "wallet" ? 0 : 1 }
                  )}
                >
                  <Text
                    style={tw.style(`text-base text-white uppercase`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    PAY-CHANGE
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={ConfirmPayment}
                  style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
                >
                  {loading.confirm ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text
                      style={tw.style(`text-base text-white uppercase`, {
                        fontFamily: "RobotoBold",
                      })}
                    >
                      CONFIRM-PAYMENT
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={CompleteRide}
                style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
              >
                {loading.complete ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text
                    style={tw.style(`text-base text-white uppercase`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    drop off
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : isActive ? (
          <TouchableOpacity
            onPress={StartRide}
            style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
          >
            {loading.start ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-base text-white uppercase`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Start Ride
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              onPress={AcceptRide}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 bg-base-green rounded-[8px]`}
            >
              {loading.accept ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={tw.style(`text-base text-white uppercase`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Accept ride
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={RejectRide}
              style={tw`flex-row items-center justify-center gap-x-2 py-3 border border-base-green rounded-[8px]`}
            >
              {loading.reject ? (
                <ActivityIndicator color={tw.color("text-base-green")} />
              ) : (
                <Text
                  style={tw.style(`text-base text-base-green uppercase`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Cancel Ride
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </BottomSheet>
  );
};

export default NewRide;
