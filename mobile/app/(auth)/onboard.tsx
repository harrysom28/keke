import {
  Animated,
  Image,
  ImageBackground,
  Pressable,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
} from "react-native";
import { WINDOW_WIDTH, verticalScale } from "@/constants/Metrics";
import { useEffect, useRef, useState } from "react";

import { AntDesign } from "@expo/vector-icons";
import GestureRecognizer from "react-native-swipe-gestures";
import tw from "@/lib/tailwind";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const Pages = [
  {
    img: require("@/assets/images/onboard-1.png"),
    title: "Get there fast with our rides",
    text: "Want a hassle-free ride? Our improved trains would take you to your destination in no time. Simple, classy, affordable, and fast! ",
  },
  {
    img: require("@/assets/images/onboard-2.png"),
    title: "Multiplied Earnings",
    text: "With Keke app, you can get extra incentives on a daily basis by running in-app  tasks and challenges uploaded .",
  },
  {
    img: require("@/assets/images/onboard-3.png"),
    title: "Monitor your trip",
    text: "Share your real-time location with friends and families. Receive updates about how close you are to your location.",
  },
];

const Onboard = () => {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Smooth fade and slide animation
    slideAnim.setValue(0);
    opacityAnim.setValue(0);
    
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index]);

  const handleNext = () => {
    if (Pages.length - 1 > index) {
      // Smooth slide out to left, then slide in from right
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SCREEN_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
      setIndex((prev) => ++prev);
        slideAnim.setValue(SCREEN_WIDTH);
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      router.push("/register");
    }
  };

  const handlePrev = () => {
    if (index > 0 && index <= Pages.length - 1) {
      // Smooth slide out to right, then slide in from left
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
      setIndex((prev) => --prev);
        slideAnim.setValue(-SCREEN_WIDTH);
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  };

  return (
    <GestureRecognizer
      onSwipeLeft={handleNext}
      onSwipeRight={handlePrev}
      config={{
        velocityThreshold: 0.2,
        directionalOffsetThreshold: 50,
        gestureIsolationThreshold: 10,
      }}
      style={{
        flex: 1,
      }}
    >
      <ImageBackground
        source={require("@/assets/images/onboard-bg.png")}
        style={tw.style(
          `flex-1 flex-col justify-between py-[70px] bg-white text-white`,
          {
            width: WINDOW_WIDTH,
          }
        )}
      >
        <Animated.View
          style={{
            transform: [{ translateX: slideAnim }],
            opacity: opacityAnim,
          }}
        >
          <StatusBar barStyle="dark-content" />

          <View style={tw`self-center`}>
            <Image
              resizeMode="contain"
              source={require("@/assets/images/onboard-logo.png")}
              style={tw`w-[160px] h-[60px]`}
            />
          </View>

          <View style={tw.style(`self-center my-[40px]`)}>
            <Image
              source={Pages[index].img}
              resizeMode="contain"
              style={tw.style({
                width: WINDOW_WIDTH,
                height: verticalScale(200),
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
                style={tw.style(`text-base-green text-[32px] text-center`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {Pages[index].title}
              </Text>
              <Text
                style={tw.style(
                  `text-base-green text-base text-center w-[90%] mt-1`,
                  { fontFamily: "RobotoRegular" }
                )}
              >
                {Pages[index].text}
              </Text>
            </View>
          </View>
        </Animated.View>
        <View
          style={tw.style(
            `flex-col justify-between px-11 absolute bottom-6 left-0 right-0`,
            { height: verticalScale(120) }
          )}
        >
          <View style={tw`self-center flex-row items-center gap-x-[32px]`}>
            {Pages.map((item, idx) => (
              <Pressable
                key={item.text}
                onPress={() => {
                  if (idx !== index) {
                    if (idx > index) {
                      // Moving forward
                      Animated.parallel([
                        Animated.timing(slideAnim, {
                          toValue: -SCREEN_WIDTH,
                          duration: 250,
                          useNativeDriver: true,
                        }),
                        Animated.timing(opacityAnim, {
                          toValue: 0,
                          duration: 250,
                          useNativeDriver: true,
                        }),
                      ]).start(() => {
                        setIndex(idx);
                        slideAnim.setValue(SCREEN_WIDTH);
                        Animated.parallel([
                          Animated.timing(slideAnim, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(opacityAnim, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                        ]).start();
                      });
                    } else {
                      // Moving backward
                      Animated.parallel([
                        Animated.timing(slideAnim, {
                          toValue: SCREEN_WIDTH,
                          duration: 250,
                          useNativeDriver: true,
                        }),
                        Animated.timing(opacityAnim, {
                          toValue: 0,
                          duration: 250,
                          useNativeDriver: true,
                        }),
                      ]).start(() => {
                        setIndex(idx);
                        slideAnim.setValue(-SCREEN_WIDTH);
                        Animated.parallel([
                          Animated.timing(slideAnim, {
                            toValue: 0,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                          Animated.timing(opacityAnim, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                          }),
                        ]).start();
                      });
                    }
                  }
                }}
                style={tw.style(
                  `w-[16px] h-[16px] rounded-full`,
                  idx === index ? "bg-base-green" : "bg-[#D9D9D9]"
                )}
              />
            ))}
          </View>

          <View style={tw`flex-row justify-between items-center`}>
            <TouchableOpacity onPress={() => router.push("/register")}>
              <Text
                style={tw.style(`text-black text-sm pr-4`, {
                  fontFamily: "RobotoBold",
                })}
              >
                Skip
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleNext}
              style={tw`bg-base-green p-3 rounded-full items-center justify-center`}
              activeOpacity={0.7}
            >
              <AntDesign name="right" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </GestureRecognizer>
  );
};

export default Onboard;
