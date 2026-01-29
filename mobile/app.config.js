// Expo dynamic config to inject native API keys at build time (prebuild/run:android)
// Uses `.env` via @expo/env (already included via Expo CLI toolchain).
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import appJson from "./app.json";

export default ({ config }) => {
  // Load env explicitly because prebuild runs in node context and we want predictable behavior.
  // Prefer `mobile/.env`, but also support `mobile/utils/mobile.env` (used in this repo sometimes).
  const envPaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "utils", "mobile.env"),
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
    }
  }

  const base = appJson?.expo ?? config ?? {};

  // DISPLAY-ONLY key (safe to ship in the app when heavily restricted in Google Cloud Console)
  // Restrict by:
  // - Android app: package name + SHA-1
  // - APIs: Maps SDK for Android only
  const mapsDisplayKey =
    process.env.EXPO_PUBLIC_MAPS_DISPLAY_KEY ||
    process.env.EXPO_PUBLIC_ANDROID_MAPS_DISPLAY_KEY ||
    base?.android?.config?.googleMaps?.apiKey ||
    base?.ios?.config?.googleMapsApiKey ||
    "";

  // Fail fast in dev builds: MapView will crash natively without this key.
  if (!mapsDisplayKey) {
    throw new Error(
      "Missing Maps display key. Set EXPO_PUBLIC_MAPS_DISPLAY_KEY (preferred) or EXPO_PUBLIC_ANDROID_MAPS_DISPLAY_KEY in `mobile/.env` (or `mobile/utils/mobile.env`), then rebuild with `npm run android`."
    );
  }

  return {
    ...base,
    android: {
      ...base.android,
      config: {
        ...(base.android?.config ?? {}),
        googleMaps: {
          ...(base.android?.config?.googleMaps ?? {}),
          apiKey: mapsDisplayKey,
        },
      },
    },
    ios: {
      ...base.ios,
      config: {
        ...(base.ios?.config ?? {}),
        googleMapsApiKey: mapsDisplayKey,
      },
    },
    extra: {
      ...(base.extra ?? {}),
      // Keep empty by default. All Places/Directions/etc are proxied via backend.
      googleMapsApiKey: "",
    },
  };
};

