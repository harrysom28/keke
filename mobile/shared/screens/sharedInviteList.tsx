import { AntDesign, Feather } from "@expo/vector-icons";
import {
  Image,
  ImageBackground,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import React, { useContext, useEffect, useState } from "react";

import { AppContext } from "@/app/context";
import EmptyData from "@/components/emptyData";
import { REFERAL_CODELIST } from "@/constants";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { verticalScale } from "@/constants/Metrics";

interface LProps {
  item: object;
}

function ListItem({ item }: LProps) {
  const verified = true;
  return (
    <View
      style={tw`flex-row gap-x-4 items-center py-2 border-b border-[#EFEFEF]`}
    >
      <Image
        source={{
          uri: item?.referred_user_image,
        }}
        style={tw`h-[48px] w-[48px] rounded-full`}
      />
      <View style={tw`basis-[78%]`}>
        <View style={tw`flex-row justify-between items-center`}>
          <Text
            style={tw.style(`text-[15px] text-center text-[#262628]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item?.referred_user_name}
          </Text>
          <Text
            style={tw.style(`text-[15px] text-center text-base-green`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item?.referred_user_email_phone}
          </Text>
        </View>
        <View style={tw`flex-row justify-between items-center`}>
          <Text
            style={tw.style(`text-[15px] text-center text-base-green`, {
              opacity: verified ? 1 : 0,
              fontFamily: "RobotoRegular",
            })}
          >
            +₦300
          </Text>
          <Text
            style={tw.style(
              `text-[12px] text-center`,
              verified ? `text-base-green` : `text-[#F47960]`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
          >
            {verified ? `Verified` : `Unverified`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const SharedInviteList = () => {
  const { apiConfig } = useContext(AppContext);
  let isFocused = useIsFocused();
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const getReferralCode = () => {
    setLoading(true);
    axios
      .get(REFERAL_CODELIST, apiConfig)
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
  };

  useEffect(() => {
    if (isFocused) {
      getReferralCode();
    }
  }, [isFocused]);

  // const filteredData = data.filter((i) =>
  //   i?.referred_user_name.includes(search)
  // );
  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View
        style={tw.style(`bg-[#3C8F7CE6] px-4 pt-14`, {
          height: verticalScale(145),
        })}
      >
        <View style={tw`flex-row items-center justify-between w-[70%]`}>
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
            Invite Friends
          </Text>
        </View>

        <View style={tw`mt-3.5 relative`}>
          <Feather
            name="search"
            size={20}
            style={tw`absolute top-2 left-5`}
            color="white"
          />
          <TextInput
            style={tw.style(
              `text-[17px] h-[36px] px-14 w-full text-white bg-[#FFFFFF40] rounded-xl`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
            placeholder="Search"
            placeholderTextColor="white"
            value={search}
            onChangeText={(text) => setSearch(text)}
          />
        </View>
      </View>

      {data.length === 0 ? (
        <EmptyData />
      ) : (
        <ScrollView contentContainerStyle={tw`px-7 py-4`}>
          {data.map((item) => (
            <ListItem key={item?.referred_user_email_phone} item={item} />
          ))}
        </ScrollView>
      )}
    </ImageBackground>
  );
};

export default SharedInviteList;
