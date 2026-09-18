import { useEffect } from "react";
import { Image, StatusBar, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import * as SplashScreen from "expo-splash-screen";

const BRAND = "#3C8F7C";
const LOGO_SIZE = 176;

function RadarRing({ delayMs }: { delayMs: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      )
    );
  }, [delayMs, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.38 * (1 - progress.value),
    transform: [{ scale: 0.55 + progress.value * 1.15 }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

export default function SplashLoading() {
  const logoScale = useSharedValue(1);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});

    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [logoScale]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.stage}>
        <RadarRing delayMs={0} />
        <RadarRing delayMs={700} />
        <RadarRing delayMs={1400} />
        <Animated.View style={[styles.logoWrap, logoStyle]}>
          <Image
            source={require("@/assets/images/splash-icon-android.png")}
            resizeMode="contain"
            style={styles.logo}
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  stage: {
    width: LOGO_SIZE + 72,
    height: LOGO_SIZE + 72,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    borderWidth: 2,
    borderColor: BRAND,
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
