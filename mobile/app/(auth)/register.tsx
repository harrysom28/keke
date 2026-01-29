import {
  Image,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { WINDOW_WIDTH, verticalScale } from "@/constants/Metrics";

import tw from "@/lib/tailwind";
import { useRouter } from "expo-router";

const Register = () => {
  const router = useRouter();

  return (
    <ImageBackground
      source={require("@/assets/images/register-bg.png")}
      style={tw.style(`flex-1 flex-col gap-y-5 py-[90px] text-white bg-white`, {
        width: WINDOW_WIDTH,
      })}
    >
      <StatusBar barStyle="dark-content" />

      <View style={tw.style(`self-center my-[40px]`)}>
        <Image
          source={require("@/assets/images/onboard-4.png")}
          resizeMode="contain"
          style={tw.style({
            width: WINDOW_WIDTH,
            height: verticalScale(260),
          })}
        />
      </View>

      <View
        style={tw.style(` flex-row  text-white`, {
          width: WINDOW_WIDTH,
        })}
      >
        <View style={tw.style(`flex-col  px-[18px] w-full items-center`)}>
          <Text
            style={tw.style(`text-[#2a2a2a] text-2xl text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Welcome to Keke
          </Text>
          <Text
            style={tw.style(`text-[#A0A0A0] text-lg text-center w-[90%] mt-1`, {
              fontFamily: "RobotoMedium",
            })}
          >
            Choose your location to start finding the keke around you
          </Text>
        </View>
      </View>

      <View style={tw`flex-col gap-y-5 px-6 mt-10`}>
        <TouchableOpacity
          onPress={() => router.push("/usertype")}
          style={tw`bg-base-green py-4 rounded-[8px]`}
        >
          <Text
            style={tw.style(`text-white text-base text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Create an account
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/login")}
          style={tw`border border-base-green py-4 rounded-[8px]`}
        >
          <Text
            style={tw.style(`text-base-green text-base text-center`, {
              fontFamily: "RobotoBold",
            })}
          >
            Log In
          </Text>
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
};

export default Register;
