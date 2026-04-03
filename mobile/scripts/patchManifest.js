const fs = require("fs");
const path = require("path");

// Load .env from mobile/ so EXPO_PUBLIC_MAPS_DISPLAY_KEY is available
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^\s*EXPO_PUBLIC_MAPS_DISPLAY_KEY\s*=\s*(.+?)\s*$/);
    if (match) {
      const value = match[1].replace(/^["']|["']$/g, "").trim();
      process.env.EXPO_PUBLIC_MAPS_DISPLAY_KEY = value;
    }
  });
}

const androidDir = path.join(__dirname, "../android");
const manifestPath = path.join(
  androidDir,
  "app/src/main/AndroidManifest.xml"
);

// Write local.properties so Gradle finds the Android SDK (avoids "SDK location not found")
const sdkPath = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (sdkPath) {
  const localPropsPath = path.join(androidDir, "local.properties");
  const sdkDir = path.resolve(sdkPath).replace(/\\/g, "/");
  fs.writeFileSync(
    localPropsPath,
    `sdk.dir=${sdkDir}\n`,
    "utf8"
  );
  console.log("✅ local.properties written (sdk.dir from ANDROID_HOME/ANDROID_SDK_ROOT).");
} else {
  console.warn(
    "⚠️  ANDROID_HOME not set. Set it to your Android SDK path (e.g. ~/Library/Android/sdk) or the build will fail."
  );
}

let manifest = fs.readFileSync(manifestPath, "utf8");

// Ensure tools namespace exists
if (!manifest.includes('xmlns:tools="http://schemas.android.com/tools"')) {
  manifest = manifest.replace(
    "<manifest",
    '<manifest xmlns:tools="http://schemas.android.com/tools"'
  );
}

// Helper to patch meta-data tag with tools:replace
function addToolsReplace(name, replaceAttr) {
  const regex = new RegExp(
    `<meta-data[^>]*android:name="${name}"([^>]*)/>`,
    "g"
  );
  manifest = manifest.replace(regex, (match, group) => {
    if (match.includes("tools:replace")) return match; // already patched
    return match.replace(
      group,
      `${group} tools:replace="android:${replaceAttr}"`
    );
  });
}

// Inject Google Maps API key so the map displays on Android (Expo prebuild often leaves a placeholder)
const mapsKey =
  process.env.EXPO_PUBLIC_MAPS_DISPLAY_KEY ||
  process.env.EXPO_PUBLIC_ANDROID_MAPS_DISPLAY_KEY ||
  "";
if (mapsKey) {
  const apiKeyRegex = /(<meta-data\s+android:name="com\.google\.android\.geo\.API_KEY"\s+android:value=")[^"]*("\/>)/;
  if (apiKeyRegex.test(manifest)) {
    manifest = manifest.replace(apiKeyRegex, `$1${mapsKey}$2`);
    console.log("✅ AndroidManifest.xml: Google Maps API key injected.");
  }
} else {
  console.warn(
    "⚠️  EXPO_PUBLIC_MAPS_DISPLAY_KEY not set in .env – map may not display on Android. Add it and re-run prebuild + patch."
  );
}

// Firebase/notification tools:replace
addToolsReplace(
  "com.google.firebase.messaging.default_notification_channel_id",
  "value"
);
addToolsReplace(
  "com.google.firebase.messaging.default_notification_color",
  "resource"
);
addToolsReplace(
  "expo.modules.notifications.default_notification_color",
  "resource"
);

fs.writeFileSync(manifestPath, manifest);
console.log("✅ AndroidManifest.xml patched successfully.");
