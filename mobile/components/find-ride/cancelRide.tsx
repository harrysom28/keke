import {
  ActivityIndicator,
  Dimensions,
  Image,
  ImageBackground,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";

import Checkbox from "expo-checkbox";
import FlashMessage from "react-native-flash-message";
import { ScrollView } from "react-native-gesture-handler";
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from "react-native-safe-area-context";
import { useCombinedSafeInsets } from "@/hooks/useCombinedSafeInsets";
import tw from "@/lib/tailwind";
import apiClient from "@/utils/apiClient";

const Checks = [
  "Waiting for long time",
  "Unable to contact driver",
  "Driver declined to go to destination",
  "Driver declined to come to pickup",
  "Wrong address shown",
  "Price out of my budget",
];

interface CProps {
  item: string;
  isChecked: boolean;
  setChecked: () => void;
}

const CheckItem = ({ item, isChecked, setChecked }: CProps) => {
  return (
    <Pressable
      style={tw.style(
        `flex-row items-center gap-x-3.5 py-4 px-2.5 rounded-[8px] border `,
        isChecked ? `border-base-green` : `border-[#D0D0D0]`
      )}
      onPress={setChecked}
    >
      <Checkbox
        style={tw`text-base-green border border-[#D0D0D0]`}
        value={isChecked}
      />
      <Text
        style={tw.style("text-lg text-[#000000CF]", {
          fontFamily: "RobotoMedium",
        })}
      >
        {item}
      </Text>
    </Pressable>
  );
};

const CancelPrompt = ({
  setPrompt,
  setShow,
  clear,
}: {
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  setPrompt: React.Dispatch<React.SetStateAction<boolean>>;
  clear: () => void;
}) => {
  const screenHeight = Dimensions.get("window").height;
  const cardMaxHeight = Math.min(screenHeight * 0.8, screenHeight - 120);

  const Return = () => {
    setPrompt(false);
    setShow(false);
    clear();
  };
  return (
    <View
      style={tw`flex-1 flex-col justify-center items-center absolute bg-[#1919194D] z-10 inset-0`}
    >
      <View
        style={tw.style(`flex-col gap-y-6 w-[90%] p-2.5 bg-white rounded-[8px]`, {
          maxHeight: cardMaxHeight,
        })}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={tw`gap-y-6`}
        >
          <MaterialIcons
            onPress={Return}
            name="close"
            size={24}
            style={tw`self-end`}
            color="#5A5A5A"
          />

          <Image
            source={require("@images/sad-emoji.png")}
            style={tw`w-[106px] h-[106px] self-center`}
          />
          <Text
            style={tw.style(`text-xl text-center`, {
              fontFamily: "RobotoMedium",
            })}
          >
            We're so sad about your cancellation
          </Text>
          <Text
            style={tw.style(`text-base text-center text-[#898989]`, {
              fontFamily: "RobotoMedium",
            })}
          >
            We will continue to improve our service & satify you on the next trip.
          </Text>
          <Pressable onPress={Return} style={tw` bg-base-green py-4 rounded`}>
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Back Home
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
};

interface CRProps {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  rideId?: string;
  action: (
    data: { reason: string; description: string },
    loading: React.Dispatch<React.SetStateAction<boolean>>,
    executable: () => void,
    showError: (text: string) => void
  ) => void;
  clear: () => void;
}

function CancelRideModalInner({
  show,
  rideId,
  setShow,
  action,
  clear,
}: CRProps) {
  const [checked, setChecked] = useState(Checks[0]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [feeCheck, setFeeCheck] = useState<{
    fee_applies: boolean;
    fee_amount: number;
    fee_reason?: string | null;
  } | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const fRef = useRef<FlashMessage>(null);
  const insets = useCombinedSafeInsets();

  useEffect(() => {
    if (!show || !rideId) {
      setFeeCheck(null);
      return;
    }
    setFeeLoading(true);
    apiClient
      .get(`booking/cancel-ride/preview?rideId=${encodeURIComponent(rideId)}`)
      .then(({ data }) => setFeeCheck(data?.data ?? null))
      .catch(() => setFeeCheck(null))
      .finally(() => setFeeLoading(false));
  }, [show, rideId]);

  const showError = (text: string) => {
    fRef.current?.showMessage({ type: "danger", message: text });
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <FlashMessage
        ref={fRef}
        position="top"
        floating
        style={{
          elevation: 1000,
          marginTop: insets.top + 8,
          zIndex: 1000000,
        }}
        duration={3000}
        titleStyle={{ fontFamily: "RobotoMedium", textAlign: "center" }}
      />
      {prompt && (
        <CancelPrompt setPrompt={setPrompt} setShow={setShow} clear={clear} />
      )}
      <ImageBackground
        style={tw.style(`flex-1`, {
          paddingTop: insets.top + 8,
          paddingLeft: 24 + insets.left,
          paddingRight: 24 + insets.right,
          paddingBottom: Math.max(insets.bottom, 8),
        })}
        source={require("@images/pattern-bg.png")}
      >
        <View style={tw`flex-row items-center justify-between w-[70%]`}>
          <TouchableOpacity
            onPress={() => setShow(false)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons
              name="arrow-back-outline"
              size={24}
              style={tw`bg-black p-1 rounded-full`}
              color="white"
            />
          </TouchableOpacity>
          <Text style={tw.style("text-2xl", { fontFamily: "RobotoBold" })}>
            Cancel Ride
          </Text>
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{
              paddingBottom: Math.max(insets.bottom + 24, 40),
            }}
          >
          <Text
            style={tw.style("text-base text-[#000000A1] my-5", {
              fontFamily: "RobotoMedium",
            })}
          >
            Please select the reason of cancellation.
          </Text>

          {feeLoading ? (
            <View style={tw`mb-4 items-center py-2`}>
              <ActivityIndicator size="small" color={tw.color("base-green")} />
            </View>
          ) : null}

          {feeCheck?.fee_applies ? (
            <View
              style={tw`flex-row items-start gap-x-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4`}
            >
              <Ionicons
                name="warning"
                size={20}
                color="#DC2626"
                style={tw`mt-0.5 shrink-0`}
              />
              <View style={tw`flex-1`}>
                <Text
                  style={tw.style(`text-sm text-red-700`, { fontFamily: "RobotoMedium" })}
                >
                  Cancellation fee: ₦{feeCheck.fee_amount.toLocaleString()}
                </Text>
                <Text
                  style={tw.style(`text-xs text-red-600 mt-0.5`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {feeCheck.fee_reason ||
                    "The driver is already on the way to your location"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={tw`flex-col gap-y-4`}>
            {Checks.map((item) => (
              <CheckItem
                key={item}
                item={item}
                isChecked={checked === item}
                setChecked={() => setChecked(item)}
              />
            ))}
          </View>

          <TextInput
            value={description}
            onChangeText={(text) => setDescription(text)}
            style={tw.style(
              `h-[118px] border border-base-green p-4 my-4 rounded-[8px]`,
              { verticalAlign: "top", fontFamily: "RobotoMedium" }
            )}
            placeholder="Notes"
            multiline
          />

          <Pressable
            onPress={() =>
              action(
                { reason: checked, description },
                setLoading,
                () => setPrompt(true),
                showError
              )
            }
            style={tw`mb-8 bg-base-green py-4 rounded`}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-base text-center text-white`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Submit
              </Text>
            )}
          </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </ImageBackground>
    </>
  );
}

export default function CancelRideModal({
  show,
  setShow,
  rideId,
  action,
  clear,
}: Readonly<CRProps>) {
  return (
    <Modal
      visible={show}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === "android"}
      onRequestClose={() => setShow(false)}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <CancelRideModalInner
          show={show}
          rideId={rideId}
          setShow={setShow}
          action={action}
          clear={clear}
        />
      </SafeAreaProvider>
    </Modal>
  );
}
