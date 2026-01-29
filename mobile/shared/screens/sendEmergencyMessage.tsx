import {
  ActivityIndicator,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { GET_EMERGENCY_CONTACT, SEND_EMERGENCY_MESSAGE } from "@/constants";
import React, { useContext, useEffect, useState } from "react";
import Svg, { Circle, Path } from "react-native-svg";

import { AppContext } from "@/app/context";
import { AppDetailsState } from "@/store/AppSlice";
import { Dropdown } from "react-native-element-dropdown";
import FormInput from "@/components/formInput";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useSelector } from "react-redux";

const SendEmergencyMessage = () => {
  const { ride } = useSelector(AppDetailsState);
  const { apiConfig } = useContext(AppContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sloading, setSLoading] = useState(false);
  const [state, setState] = useState({
    id: "",
    live_location: ride?.utils?.user_location?.name,
    message: "Please Send Help!!!",
  });

  let isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      axios
        .get(GET_EMERGENCY_CONTACT, apiConfig)
        .then(({ data }) => {
          // console.log(data?.data);
          setData(data?.data);
        })
        .catch((err) => {
          console.log(err?.response?.data);
          if (err?.response?.data?.message) {
            showMessage({
              type: "danger",
              message: err?.response?.data.message,
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused]);

  const handleSubmit = () => {
    if (state.id === "" || state.live_location === "" || state.message === "")
      return showMessage({
        type: "warning",
        message: "Please fill in all required fields",
      });
    console.log(state);

    setSLoading(true);
    axios
      .post(SEND_EMERGENCY_MESSAGE, state, apiConfig)
      .then(({ data }) => {
        showMessage({
          type: "success",
          message: data.message,
        });
        setState((prev) => ({ ...prev, id: "" }));
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "warning",
            message: err?.response?.data.message,
          });
        }
        if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'An error occurred');
          showMessage({
            type: "warning",
            message: errorMessage,
          });
        }
      })
      .finally(() => setSLoading(false));
  };

  return (
    <ImageBackground
      style={tw.style(`px-6 bg-white`, {
        flex: 1,
        paddingTop: StatusBar.currentHeight,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <TouchableOpacity style={tw`my-2`} onPress={() => router.back()}>
        <Svg width="39" height="39" viewBox="0 0 39 39" fill="none">
          <Circle cx="19.5" cy="19.5" r="19.5" fill="#212121" />
          <Path
            d="M29 19H9"
            stroke="#FBFBFB"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M19 29L9 19L19 9"
            stroke="#FBFBFB"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </TouchableOpacity>
      <View style={tw`flex-col gap-y-3 my-7`}>
        <Text
          style={tw.style(`text-base text-center`, {
            fontFamily: "RobotoBold",
          })}
        >
          Live Location
        </Text>
        <Text
          style={tw.style(`text-sm text-center my-4 text-[#898989]`, {
            fontFamily: "RobotoMedium",
          })}
        >
          {ride?.utils?.user_location?.name}
        </Text>
        <Dropdown
          style={tw.style(
            `text-[16px] text-black px-5 h-[60px] border border-[#B8B8B8] rounded-[8px]`,
            {
              fontFamily: "RobotoMedium",
            }
          )}
          mode="modal"
          value={state.id}
          data={
            data.length > 0
              ? data?.map((item) => ({
                  label: item?.name,
                  value: item?.contact_id,
                }))
              : [{ label: "No data available", value: "" }]
          }
          search={false}
          maxHeight={300}
          labelField={"label"}
          valueField={"value"}
          itemTextStyle={tw.style(`text-black text-sm`, {
            fontFamily: "RobotoMedium",
          })}
          selectedTextStyle={tw.style(`text-black text-sm`, {
            fontFamily: "RobotoMedium",
          })}
          placeholderStyle={tw.style(`text-[#D0D0D0] text-[14px]`, {
            fontFamily: "RobotoRegular",
          })}
          containerStyle={tw.style(
            `text-black text-xs shadow-none border mt-1`
          )}
          placeholder={"Select a contact"}
          onChange={(item) => {
            console.log(item);
            setState({
              ...state,
              id: item?.value,
            });
          }}
        />

        <Text
          style={tw.style(`text-[13px] text-[#898989]`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Note: Your Live location will be Attacted Alongside your message
        </Text>
        <FormInput
          value={state.message}
          onChangeText={(message) => setState((prev) => ({ ...prev, message }))}
          height={118}
          placeholder="Send Help, Hun"
          multiline
        />
      </View>
      <TouchableOpacity
        onPress={handleSubmit}
        style={tw`flex-row justify-center bg-base-error w-full py-4 rounded-[8px]`}
      >
        {sloading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text
            style={tw.style(`text-white text-base`, {
              fontFamily: "RobotoBold",
            })}
          >
            Send Message
          </Text>
        )}
      </TouchableOpacity>
    </ImageBackground>
  );
};

export default SendEmergencyMessage;
