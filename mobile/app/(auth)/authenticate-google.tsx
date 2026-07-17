import {
  ActivityIndicator,
  BackHandler,
  Text,
  TouchableOpacity,
} from "react-native";
import { Country, State } from "country-state-city";
import React, { useCallback, useContext, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "../context";
import AuthForm from "@/components/AuthForm";
import { AuthState } from "@/store/AuthSlice";
import { Dropdown } from "react-native-element-dropdown";
import { PROFILE_UPDATE } from "@/constants";
import { queueLocationDisclosureIfNeeded } from "@/utils/locationDisclosure";
import PhoneInput from "@perttu/react-native-phone-number-input";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";
import { verticalScale } from "@/constants/Metrics";

const Tab = ["Authenticate"];

interface SProps {
  placeholder: string;
  data: Array<{ label: string; value: string }>;
  onChange: (val: string) => void;
  value: string;
}

const SelectItem = ({
  placeholder,
  data = [],
  onChange,
  value = "",
}: SProps) => {
  return (
    <Dropdown
      style={tw.style(
        `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
        {
          fontFamily: "RobotoMedium",
        }
      )}
      mode="modal"
      data={data}
      value={value}
      placeholder={placeholder}
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
      placeholderStyle={tw.style(`text-[#D0D0D0] text-[16px]`, {
        fontFamily: "RobotoMedium",
      })}
      containerStyle={tw.style(`text-black text-xs shadow-none border mt-1`)}
      onChange={(item) => {
        console.log(item?.value);
        onChange(item?.value);
      }}
    />
  );
};

const renderDropdownImage = () => {
  return (
    <AntDesign
      name="down"
      size={18}
      style={tw`border-r border-[#DDDDDD] pr-1.5`}
      color="black"
    />
  );
};

const AuthenticateGoogle = () => {
  const { registration } = useSelector(AuthState);
  const router = useRouter();
  const { apiConfig } = useContext(AppContext);
  const params = useLocalSearchParams();

  const [current, setCurrent] = useState(Tab[0]);
  const [loading, setLoading] = useState(false);
  const phoneInput = useRef<PhoneInput>(null);
  const [state, setState] = useState({
    country: "Nigeria",
    state: "",
  });

  const CountryIndex = Country.getAllCountries().find(
    (i) => i.name === state.country
  );
  const States =
    CountryIndex === undefined
      ? [{ name: "Please Select a Country" }]
      : State.getStatesOfCountry(CountryIndex?.isoCode);

  const handleSubmit = () => {
    let num = phoneInput?.current?.getNumberAfterPossiblyEliminatingZero()
      ?.formattedNumber as string;

    let isValidNumber = phoneInput?.current?.isValidNumber(num);

    if (!isValidNumber)
      return showMessage({
        type: "warning",
        message: "Please enter a valid phone number",
      });

    if (state.country === "")
      return showMessage({
        type: "warning",
        message: "Select a country",
      });

    if (state.state === "")
      return showMessage({
        type: "warning",
        message: "Select a state",
      });

    let data = {
      phone_number: num.replace(/\+/g, ""),
      ...state,
      ...params,
    };

    setLoading(true);
    console.log(PROFILE_UPDATE, data);
    axios
      .post(PROFILE_UPDATE, data, apiConfig)
      .then(async ({ data }) => {
        // console.log(data, "done");
        showMessage({
          type: "success",
          message: data.message,
        });
        if (registration?.type === "1") {
          await queueLocationDisclosureIfNeeded("rider");
        }
        router.navigate(registration?.type === "1" ? "/" : "/driverinfo");
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
          showMessage({
            type: "danger",
            message: err?.response?.data?.error,
          });
        }
      })
      .finally(() => setLoading(false));
  };

  useFocusEffect(
    useCallback(() => {
      const backAction = () => {
        router.navigate("/");
        return true;
      };

      const backHandler = BackHandler.addEventListener(
        "hardwareBackPress",
        backAction
      );

      return () => backHandler.remove();
    }, [])
  );

  return (
    <AuthForm current={current} setCurrent={setCurrent} Tab={Tab}>
      <PhoneInput
        ref={phoneInput}
        defaultCode="NG"
        layout="first"
        containerStyle={tw.style(
          `flex-row items-center gap-x-2 border border-[#b8b8b8] rounded-[8px] overflow-hidden`,
          { height: verticalScale(40) }
        )}
        codeTextStyle={tw.style(`h-full text-[15px]`, {
          fontFamily: "RobotoMedium",
        })}
        textInputProps={{
          placeholder: "Your mobile number",
          placeholderTextColor: "#D0D0D0",
        }}
        textInputStyle={tw.style(`h-full text-[15px] `, {
          fontFamily: "RobotoMedium",
        })}
        textContainerStyle={tw`bg-white`}
        renderDropdownImage={renderDropdownImage()}
        flagButtonStyle={tw`flex-row items-center pl-5`}
        filterProps={{ placeholder: "Search country" }}
      />

      <SelectItem
        placeholder="Country"
        value={state.country}
        onChange={(country) => setState((prev) => ({ ...prev, country }))}
        data={Country.getAllCountries().map(({ name }) => ({
          label: name,
          value: name,
        }))}
      />

      <SelectItem
        placeholder="State"
        value={state.state}
        onChange={(state) => setState((prev) => ({ ...prev, state }))}
        data={States.map(({ name }) => ({
          label: name,
          value: name,
        }))}
      />

      <TouchableOpacity
        onPress={handleSubmit}
        style={tw.style(
          `flex-row justify-center items-center bg-base-green rounded-[8px] mt-12`,
          { height: verticalScale(40) }
        )}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text
            style={tw.style(`text-white text-base`, {
              fontFamily: "RobotoBold",
            })}
          >
            Update
          </Text>
        )}
      </TouchableOpacity>
    </AuthForm>
  );
};

export default AuthenticateGoogle;
