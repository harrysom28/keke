import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";

import tw from "@/lib/tailwind";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Text>This screen doesn't exist.</Text>
        <Pressable onPress={() => router.back()} style={styles.link}>
          <Text style={tw`text-blue-300`}>Go to previous screen!</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
