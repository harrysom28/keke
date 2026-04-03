import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import React, { useContext, useState } from "react";

import { AirbnbRating } from "react-native-ratings";
import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { CREATE_REVIEW } from "@/constants";
import { IARide } from "@/app/(app)/(tabs)/(home)/home";
import { TRide } from "@/types";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";

interface LProps {
  value: string;
  show: boolean;
  onClose: () => void;
  editable?: boolean;
  onChange?: (text: string) => void;
}

const TextModal = ({
  onClose,
  show,
  value,
  editable = false,
  onChange,
}: LProps) => {
  const screenHeight = Dimensions.get("window").height;
  const modalMaxHeight = Math.min(screenHeight * 0.7, screenHeight - 140);

  return (
    <Modal
      style={tw`flex-1`}
      visible={show}
      transparent
      onRequestClose={onClose}
    >
      <StatusBar backgroundColor="#1919194D" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={tw`flex-1 flex-col justify-end bg-[#1919194D]`}>
          <View
            style={tw.style(`bg-white px-6 py-11 rounded-t-[40px]`, {
              maxHeight: modalMaxHeight,
            })}
          >
            <View
              style={tw.style(
                `flex-row items-center bg-[#F6F6F6] w-[99%] py-3 px-4 mb-6 rounded-t-[16px]`,
                {
                  elevation: 5,
                }
              )}
            >
              <Text
                style={tw.style(
                  `basis-[88%] text-center text-xl text-[#242E42]`,
                  {
                    fontFamily: "RobotoRegular",
                  }
                )}
              >
                Give tips
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={tw`h-[39px] w-[39px] flex-col items-center justify-center bg-black p-1 rounded-full`}
              >
                <AntDesign name="close" size={24} color="white" />
              </TouchableOpacity>
            </View>
            <View style={tw`my-4`}>
              <Text
                style={tw.style(`text-sm mb-2`, { fontFamily: "RobotoMedium" })}
              >
                Input amount
              </Text>
              <TextInput
                value={value}
                onChangeText={onChange}
                style={tw.style(
                  `text-base px-4 py-2 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoMedium",
                  }
                )}
                placeholder="₦99"
                placeholderTextColor="black"
                keyboardType="numeric"
              />
            </View>

            <Pressable onPress={onClose} style={tw`bg-base-green mt-8`}>
              <Text
                style={tw.style(`text-center text-base text-white py-3.5`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Confirm
              </Text>
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

interface Props {
  // bottomSheetRef: React.RefObject<BottomSheetMethods>;
  temp: TRide;
  action: () => void;
}

let Tips: Array<string> = ["0", "5", "10", "15", "20"];
let Ratings: Array<string> = ["Bad", "Poor", "OK", "Great", "Excellent"];

const ReviewSheet = ({ temp, action }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const dispatch = useDispatch();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [tip, setTip] = useState<string>(Tips[0]);
  const [show, setShow] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const CreateReview = () => {
    setLoading(true);
    const data = {
      driver_id: temp?.driver_id,
      rating,
      review: review.length > 0 ? review : Ratings[rating - 1],
      tip,
    };
    axios
      .post(CREATE_REVIEW, data, apiConfig)
      .then(({ data }) => {
        showMessage({ type: "success", message: data?.message });
        action();
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
        if (err?.response?.data?.error) {
          const errorMessage = typeof err?.response?.data?.error === 'string' 
            ? err.response.data.error 
            : (err.response.data.error?.message || err.response.data.message || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <>
      <TextModal
        show={show}
        onClose={() => setShow(false)}
        value={tip}
        onChange={(text) => setTip(text)}
      />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={tw`flex-1`}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={tw`pb-6`}
          >
            <AirbnbRating
              count={5}
              showRating={false}
              defaultRating={rating}
              size={24}
              selectedColor="#3C8F7C"
              starContainerStyle={tw`flex-row items-center gap-x-4 mt-3 mb-5`}
              onFinishRating={setRating}
            />
            <Text
              style={tw.style(`text-center text-xl text-[#2A2A2A]`, {
                fontFamily: "RobotoBold",
              })}
            >
              {Ratings[rating - 1]}
            </Text>
            <Text
              style={tw.style(`text-center text-xl text-[#B8B8B8]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              You rated {temp?.driver?.driver_name} {rating} star(s)
            </Text>

            <KeyboardAvoidingView behavior="height">
              <TextInput
                value={review}
                onChangeText={(text) => setReview(text)}
                style={tw.style(
                  `h-[118px] text-base my-5 p-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoRegular",
                    verticalAlign: "top",
                  }
                )}
                placeholder="Write your text"
                placeholderTextColor="#D0D0D0"
                multiline
              />
            </KeyboardAvoidingView>

            <Text
              style={tw.style(`text-center text-xl text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Give some tips to Sergio Ramasis
            </Text>

            <View style={tw`flex-row justify-between items-center my-5`}>
              {Tips.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setTip(item)}
                  style={tw.style(
                    `flex-col items-center justify-center h-[50px] w-[50px] border rounded-[4px]`,
                    item === tip ? `border-base-green` : `border-[#DDDDDD]`
                  )}
                >
                  <Text>₦{item}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable onPress={() => setShow(true)}>
              <Text
                style={tw.style(`text-center text-sm text-base-green`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Enter other amount
              </Text>
            </Pressable>

            <Pressable
              onPress={CreateReview}
              style={tw`mt-8 bg-base-green py-4 rounded`}
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
        </View>
      </TouchableWithoutFeedback>
    </>
  );
};

export default ReviewSheet;
