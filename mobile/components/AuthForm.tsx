import {
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { WINDOW_WIDTH, verticalScale } from "@/constants/Metrics";

import React from "react";
import tw from "@/lib/tailwind";

interface Props {
  Tab?: string[];
  children: React.ReactNode;
  current: string;
  setCurrent: React.Dispatch<React.SetStateAction<string>>;
  height?: number;
  footer?: React.ReactNode;
}

const AuthForm = ({
  Tab,
  children,
  current,
  setCurrent,
  height = 290,
  footer = <></>,
}: Props) => {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ImageBackground
          source={require("@/assets/images/register-bg.png")}
          style={tw.style(`flex-1 flex-col pb-[90px] text-white bg-white`, {
            width: WINDOW_WIDTH,
          })}
        >
          <StatusBar barStyle="light-content" />

          <View>
            <Image
              source={require("@/assets/images/auth.png")}
              resizeMode="cover"
              style={tw.style({
                width: WINDOW_WIDTH,
                height: verticalScale(height),
              })}
            />
          </View>

          <View
            style={tw.style(
              `bg-white py-3 px-5 mx-4 -mt-[140px] rounded  text-white`,
              {
                // height: verticalScale(height),
                shadowColor: "#000",
                shadowOffset: {
                  width: 0,
                  height: 2,
                },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
                elevation: 8,
              }
            )}
          >
            {Tab && (
              <View
                style={tw.style(
                  `flex-row justify-center pb-2 gap-x-[90px] border-b border-[#8E8E9340] w-full`
                )}
              >
                {Tab.map((item) => (
                  <Pressable key={item} onPress={() => setCurrent(item)}>
                    <Text
                      style={tw.style(
                        `text-xl`,
                        item === current ? "text-[#262628]" : "text-[#C8C7CC]",
                        {
                          fontFamily:
                            item === current ? "RobotoMedium" : "RobotoRegular",
                        }
                      )}
                    >
                      {item}
                    </Text>
                    {item === current && (
                      <View
                        style={tw`w-[35px] h-[5px] mt-[3px] bg-base-green rounded-xl self-center`}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            )}

            <View style={tw`my-4 flex-col gap-y-5`}>{children}</View>
          </View>

          {footer}
        </ImageBackground>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};

export default AuthForm;
