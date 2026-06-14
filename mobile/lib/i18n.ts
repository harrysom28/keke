import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { DevSettings, I18nManager } from "react-native";

import ar from "@/locales/ar.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";
import ha from "@/locales/ha.json";
import ig from "@/locales/ig.json";
import yo from "@/locales/yo.json";

export const LANGUAGE_KEY = "@app_language";
/** Previous key — migrated on read */
export const LANGUAGE_KEY_LEGACY = "@keke_app_language";

const SUPPORTED = ["en", "fr", "es", "ar", "ha", "ig", "yo"] as const;
export type SupportedLanguage = (typeof SUPPORTED)[number];

export function normalizeLanguageCode(code: string | undefined | null): SupportedLanguage {
  if (!code) return "en";
  const base = code.split("-")[0]?.toLowerCase() ?? "en";
  return (SUPPORTED.includes(base as SupportedLanguage) ? base : "en") as SupportedLanguage;
}

/**
 * Device locale without `expo-localization` (requires a native rebuild to link).
 * Hermes provides `Intl`; falls back to English.
 */
function getDeviceLanguageCodeFallback(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale && typeof locale === "string") {
      return locale.split("-")[0] ?? "en";
    }
  } catch {
    /* ignore */
  }
  return "en";
}

export async function loadSavedLanguage(): Promise<SupportedLanguage> {
  let saved = await AsyncStorage.getItem(LANGUAGE_KEY);
  if (saved == null) {
    const legacy = await AsyncStorage.getItem(LANGUAGE_KEY_LEGACY);
    if (legacy != null) {
      saved = legacy;
      await AsyncStorage.setItem(LANGUAGE_KEY, legacy);
    }
  }
  const device = getDeviceLanguageCodeFallback();
  return normalizeLanguageCode(saved ?? device);
}

export async function saveLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_KEY, normalizeLanguageCode(lang));
}

/** Full JS reload so RTL applies (Arabic). Production preview/APK builds must not call DevSettings.reload (unstable / no-op). */
export function reloadAppForLayoutDirection(): void {
  if (__DEV__) {
    DevSettings.reload();
  }
}

export async function applyLanguageAndRtl(code: string): Promise<void> {
  const normalized = normalizeLanguageCode(code);
  await saveLanguage(normalized);
  await i18n.changeLanguage(normalized);

  const shouldRtl = normalized === "ar";
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== shouldRtl) {
    I18nManager.forceRTL(shouldRtl);
    reloadAppForLayoutDirection();
  }
}

/** Call once on app boot: restore saved (or device) language and align RTL without extra reload when already correct. */
export async function bootstrapI18n(): Promise<void> {
  const lang = await loadSavedLanguage();
  await i18n.changeLanguage(lang);
  const shouldRtl = lang === "ar";
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== shouldRtl) {
    I18nManager.forceRTL(shouldRtl);
    reloadAppForLayoutDirection();
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    es: { translation: es },
    ar: { translation: ar },
    ha: { translation: ha },
    ig: { translation: ig },
    yo: { translation: yo },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  compatibilityJSON: "v4",
});

export default i18n;
