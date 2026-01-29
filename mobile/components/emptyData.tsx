import { Image, Text, View } from "react-native";

import React from "react";
import tw from "@/lib/tailwind";

interface Props {
  text?: string;
}

const EmptyData = ({ text = "" }: Props) => {
  return (
    <View
      style={tw`flex-col items-center gap-y-4 pt-24 px-4  h-[500px] bg-white rounded-[20px]`}
    >
      {text && (
        <Text
          style={tw.style(`text-2xl text-center`, {
            fontFamily: "RobotoBold",
          })}
        >
          {text}
        </Text>
      )}

      <Image
        source={require("@/assets/images/emergency-not-found.png")}
        style={tw`self-center`}
      />
    </View>
  );
};

export default EmptyData;
