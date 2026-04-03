import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useTranslation } from "react-i18next";
import { showMessage } from "react-native-flash-message";

import i18n, {
  applyLanguageAndRtl,
  normalizeLanguageCode,
  type SupportedLanguage,
} from "@/lib/i18n";
import tw from "@/lib/tailwind";

type LangRow = { code: SupportedLanguage; native: string };

const NATIVE_LABELS: Record<SupportedLanguage, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  ha: "Hausa",
  ig: "Igbo",
  yo: "Yorùbá",
};

const CODES: SupportedLanguage[] = ["en", "fr", "es", "ar", "ha", "ig", "yo"];

const LanguageSettingsScreen = () => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<SupportedLanguage>(() =>
    normalizeLanguageCode(i18n.language)
  );
  const [busyCode, setBusyCode] = useState<SupportedLanguage | null>(null);

  const rows = useMemo<LangRow[]>(
    () =>
      CODES.map((code) => ({
        code,
        native: NATIVE_LABELS[code],
      })),
    []
  );

  const handleSelect = useCallback(
    async (code: SupportedLanguage) => {
      if (code === selected || busyCode != null) return;
      setBusyCode(code);
      try {
        await applyLanguageAndRtl(code);
        setSelected(code);
        showMessage({
          type: "success",
          message: t("language.saved"),
        });
      } catch {
        showMessage({
          type: "danger",
          message: t("language.save_failed"),
        });
      } finally {
        setBusyCode(null);
      }
    },
    [busyCode, selected, t]
  );

  const busy = busyCode != null;

  return (
    <ImageBackground
      style={tw.style(`bg-white`, { flex: 1 })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between w-[75%]`}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={tw`bg-black p-1 rounded-full`}
            disabled={busy}
          >
            <AntDesign name="left" size={24} color="white" />
          </TouchableOpacity>
          <Text
            style={tw.style(`text-white text-2xl`, {
              fontFamily: "RobotoBold",
            })}
          >
            {t("language.title")}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={tw`px-6 py-4`}>
        <Text
          style={tw.style(`text-base text-[#8F92A1] mb-4`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {t("language.subtitle")}
        </Text>

        <View style={tw`bg-white rounded-[12px] overflow-hidden`}>
          {rows.map((item, index) => (
            <TouchableOpacity
              key={item.code}
              onPress={() => handleSelect(item.code)}
              disabled={busy}
              style={tw.style(
                `flex-row items-center justify-between px-5 py-4`,
                index !== rows.length - 1 && `border-b border-[#EFEFF4]`
              )}
            >
              <View style={tw`flex-1 pr-2`}>
                <Text
                  style={tw.style(`text-[17px] text-black`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  {t(`language.names.${item.code}`)}
                </Text>
                <Text
                  style={tw.style(`text-sm text-[#8F92A1] mt-1`, {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  {item.native}
                </Text>
              </View>
              {busyCode === item.code ? (
                <ActivityIndicator size="small" color="#3C8F7C" />
              ) : (
                selected === item.code && (
                  <AntDesign name="check" size={20} color="#3C8F7C" />
                )
              )}
            </TouchableOpacity>
          ))}
        </View>

        <Text
          style={tw.style(`text-sm text-[#8F92A1] mt-6 text-center`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {t("language.note")}
        </Text>
      </ScrollView>
    </ImageBackground>
  );
};

export default LanguageSettingsScreen;
