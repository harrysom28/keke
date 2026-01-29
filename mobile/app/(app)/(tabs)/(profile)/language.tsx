import React, { useState, useEffect } from "react";
import {
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import tw from "@/lib/tailwind";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showMessage } from "react-native-flash-message";

const LANGUAGE_STORAGE_KEY = "@keke_app_language";

interface Language {
  code: string;
  name: string;
  nativeName: string;
}

const languages: Language[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "ha", name: "Hausa", nativeName: "Hausa" },
  { code: "ig", name: "Igbo", nativeName: "Igbo" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
];

const LanguageScreen = () => {
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  useEffect(() => {
    loadSelectedLanguage();
  }, []);

  const loadSelectedLanguage = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (savedLanguage) {
        setSelectedLanguage(savedLanguage);
      }
    } catch (error) {
      console.log("Error loading language:", error);
    }
  };

  const handleLanguageSelect = async (languageCode: string) => {
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode);
      setSelectedLanguage(languageCode);
      showMessage({
        type: "success",
        message: "Language preference saved",
      });
    } catch (error) {
      console.log("Error saving language:", error);
      showMessage({
        type: "danger",
        message: "Failed to save language preference",
      });
    }
  };

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between w-[75%]`}>
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
            Language
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={tw`px-6 py-4`}>
        <Text
          style={tw.style(`text-base text-[#8F92A1] mb-4`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Select your preferred language
        </Text>

        <View style={tw`bg-white rounded-[12px] overflow-hidden`}>
          {languages.map((language, index) => (
            <TouchableOpacity
              key={language.code}
              onPress={() => handleLanguageSelect(language.code)}
              style={tw.style(
                `flex-row items-center justify-between px-5 py-4`,
                index !== languages.length - 1 && `border-b border-[#EFEFF4]`
              )}
            >
              <View style={tw`flex-1`}>
                <Text
                  style={tw.style(`text-[17px] text-black`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  {language.name}
                </Text>
                <Text
                  style={tw.style(`text-sm text-[#8F92A1] mt-1`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {language.nativeName}
                </Text>
              </View>
              {selectedLanguage === language.code && (
                <AntDesign name="check" size={20} color="#3C8F7C" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text
          style={tw.style(`text-sm text-[#8F92A1] mt-6 text-center`, {
            fontFamily: "RobotoRegular",
          })}
        >
          Note: Some features may not be available in all languages
        </Text>
      </ScrollView>
    </ImageBackground>
  );
};

export default LanguageScreen;
