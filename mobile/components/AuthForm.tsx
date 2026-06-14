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
  cardOverlap?: number;
  centerCard?: boolean;
  footer?: React.ReactNode;
}

const AuthForm = ({
  Tab,
  children,
  current,
  setCurrent,
  height = 290,
  cardOverlap = 140,
  centerCard = false,
  footer = <></>,
}: Props) => {
  const cardStyle = tw.style(`bg-white py-3 px-5 mx-4 rounded text-white`, {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 8,
  });

  const cardContent = (
    <>
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

      <View
        style={tw.style(`flex-col`, centerCard ? `my-3 gap-y-3.5` : `my-4 gap-y-5`)}
      >
        {children}
      </View>
    </>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ImageBackground
          source={require("@/assets/images/register-bg.png")}
          style={tw.style(`flex-1 flex-col text-white bg-white`, {
            width: WINDOW_WIDTH,
            paddingBottom: centerCard ? verticalScale(24) : verticalScale(90),
          })}
        >
          <StatusBar barStyle="light-content" />

          {centerCard ? (
            <>
              <View
                style={tw.style(`absolute top-0 left-0 right-0`, {
                  width: WINDOW_WIDTH,
                })}
              >
                <Image
                  source={require("@/assets/images/auth.png")}
                  resizeMode="cover"
                  style={tw.style({
                    width: WINDOW_WIDTH,
                    height: verticalScale(height),
                  })}
                />
              </View>

              <View style={tw`flex-1 justify-center px-0`}>
                <View style={cardStyle}>{cardContent}</View>
                {footer}
              </View>
            </>
          ) : (
            <>
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
                style={[
                  cardStyle,
                  { marginTop: -verticalScale(cardOverlap) },
                ]}
              >
                {cardContent}
              </View>

              {footer}
            </>
          )}
        </ImageBackground>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
};

export default AuthForm;
