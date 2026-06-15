import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { TouchableOpacity } from "react-native-gesture-handler";
import React, { memo, useContext, useEffect, useState } from "react";

import { AirbnbRating } from "react-native-ratings";
import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { CREATE_REVIEW } from "@/constants";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { getErrorMessage } from "@/utils/errorHandler";

interface Props {
  visible: boolean;
  rideId: string;
  passengerName?: string;
  onClose: () => void;
}

const RATING_LABELS = ["Bad", "Poor", "OK", "Great", "Excellent"];

const RateRiderModal = ({ visible, rideId, passengerName, onClose }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(5);
      setReview("");
    }
  }, [visible]);

  const submit = () => {
    if (!rideId) {
      onClose();
      return;
    }
    setLoading(true);
    axios
      .post(
        CREATE_REVIEW,
        {
          rideId,
          rating,
          review: review.trim().length > 0 ? review.trim() : RATING_LABELS[rating - 1],
        },
        apiConfig,
      )
      .then(({ data }) => {
        showMessage({ type: "success", message: data?.message ?? "Thanks for your feedback" });
        onClose();
      })
      .catch((err) => {
        showMessage({ type: "danger", message: getErrorMessage(err, "Could not submit review.") });
      })
      .finally(() => setLoading(false));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={tw`flex-1 flex-col justify-end bg-[#1919194D]`}>
          <View style={tw`bg-white px-6 pt-6 pb-10 rounded-t-[32px]`}>
            <View style={tw`flex-row items-center justify-between mb-2`}>
              <Text style={tw.style(`text-lg text-[#242E42]`, { fontFamily: "RobotoBold" })}>
                Rate your passenger
              </Text>
              <TouchableOpacity
                onPress={onClose}
                style={tw`h-9 w-9 flex-col items-center justify-center bg-black rounded-full`}
              >
                <AntDesign name="close" size={20} color="white" />
              </TouchableOpacity>
            </View>

            <AirbnbRating
              count={5}
              showRating={false}
              defaultRating={rating}
              size={28}
              selectedColor="#3C8F7C"
              starContainerStyle={tw`flex-row items-center gap-x-3 mt-4 mb-3 self-center`}
              onFinishRating={setRating}
            />
            <Text style={tw.style(`text-center text-base text-[#2A2A2A] mb-1`, { fontFamily: "RobotoBold" })}>
              {RATING_LABELS[rating - 1]}
            </Text>
            <Text style={tw.style(`text-center text-sm text-[#8E8E93] mb-4`, { fontFamily: "RobotoMedium" })}>
              How was your trip with {passengerName || "your passenger"}?
            </Text>

            <TextInput
              value={review}
              onChangeText={setReview}
              style={tw.style(`h-[96px] text-base p-3 text-black border border-[#B8B8B8] rounded-[8px]`, {
                fontFamily: "RobotoRegular",
                verticalAlign: "top",
              })}
              placeholder="Add a comment (optional)"
              placeholderTextColor="#D0D0D0"
              multiline
            />

            <TouchableOpacity
              onPress={submit}
              disabled={loading}
              style={tw`mt-5 w-full py-3.5 bg-base-green rounded-[8px]`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={tw.style(`text-base text-center text-white`, { fontFamily: "RobotoMedium" })}>
                  Submit
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default memo(RateRiderModal);
