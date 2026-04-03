// Expo dynamic config to inject native API keys at build time (prebuild/run:android)
// Uses `.env` via @expo/env (already included via Expo CLI toolchain).
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import appJson from "./app.json";
import { withPodfile } from "@expo/config-plugins";

/**
 * Fix react-native-maps iOS pod: replace deprecated `react-native-google-maps` with
 * `react-native-maps/Google` (required for react-native-maps 1.27+).
 */
function withMapsPodfileFix(config) {
  return withPodfile(config, async (config) => {
    const podfile = config.modResults.contents;
    const oldLine =
      "  pod 'react-native-google-maps', path: File.dirname(`node --print \"require.resolve('react-native-maps/package.json')\"`)";
    const newLines =
      'rn_maps_path = File.dirname(`node --print "require.resolve(\'react-native-maps/package.json\')"`)\n  pod \'react-native-maps/Google\', :path => rn_maps_path';
    config.modResults.contents = podfile.replace(oldLine, newLines);
    return config;
  });
}

/**
 * Add use_modular_headers! and use_frameworks! :linkage => :static for Firebase Swift pods.
 * Required for FirebaseAuth/FirebaseAuth-Swift.h to be found (react-native-firebase #8215).
 */
function withFirebaseModularHeaders(config) {
  return withPodfile(config, async (config) => {
    let podfile = config.modResults.contents;
    // Insert use_modular_headers! and RNFirebaseAsStaticFramework after the platform line
    if (!podfile.includes("use_modular_headers!")) {
      podfile = podfile.replace(
        /platform :ios,[^\n]+\n/,
        (match) => `${match}use_modular_headers!\n`
      );
    }
    if (!podfile.includes("$RNFirebaseAsStaticFramework")) {
      podfile = podfile.replace(
        /use_modular_headers!\n/,
        "use_modular_headers!\n$RNFirebaseAsStaticFramework = true\n\n"
      );
    }

    // CocoaPods dependency workaround:
    // In this sandbox, `git clone` inside `pod install` can fail when downloading AppAuth-iOS.
    // We override the pod to point at a local vendored copy (stored outside `ios/` so expo
    // prebuild doesn't delete it).
    const appAuthOverrideLine =
      "pod 'AppAuth', :path => File.join(__dir__, '..', 'Vendor', 'AppAuth-iOS-1.7.6')";
    if (!podfile.includes(appAuthOverrideLine)) {
      podfile = podfile.replace(
        /^(\s+)use_react_native!\(/m,
        (match, indent) => `${indent}${appAuthOverrideLine}\n\n${indent}use_react_native!(`
      );
    }

    // Add fixes inside the *existing* `post_install` block.
    // CocoaPods in this repo doesn't allow more than one `post_install` hook.
    const fbNonModularMarker = "# Firebase RNFB non-modular include fix";
    if (!podfile.includes(fbNonModularMarker)) {
      const lines = podfile.split("\n");
      const postInstallStartIdx = lines.findIndex((l) =>
        l.includes("post_install do |installer|")
      );
      if (postInstallStartIdx !== -1) {
        // The post_install block ends at the first Ruby `end` with 2-space indentation.
        let postInstallEndIdx = -1;
        for (let i = postInstallStartIdx + 1; i < lines.length; i++) {
          if (/^  end\s*$/.test(lines[i])) {
            postInstallEndIdx = i;
            break;
          }
        }

        if (postInstallEndIdx !== -1) {
          const insertLines = [
            "    " + fbNonModularMarker,
            "    installer.pods_project.targets.each do |target|",
            "      target.build_configurations.each do |config|",
            "        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'",
            "        if target.name.start_with?('RNFB') || target.name.include?('Firebase')",
            "          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'",
            "          config.build_settings['CLANG_WARN_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'NO'",
            "          config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'",
            "          config.build_settings['OTHER_CPLUSPLUSFLAGS'] = (config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)').to_s + ' -Wno-error=non-modular-include-in-framework-module'",
            "          config.build_settings['OTHER_CFLAGS'] = (config.build_settings['OTHER_CFLAGS'] || '$(inherited)').to_s + ' -Wno-error=non-modular-include-in-framework-module'",
            "        end",
            "",
            "        if target.name == 'RNScreens'",
            "          config.build_settings['GCC_TREAT_WARNINGS_AS_ERRORS'] = 'NO'",
            "        end",
            "",
            "        if target.name.include?('Firebase') || target.name.start_with?('RNFB') || target.name.include?('GTM') || target.name.include?('GoogleSignIn') || target.name.include?('AppAuth')",
            "          config.build_settings['BUILD_LIBRARY_FOR_DISTRIBUTION'] = 'YES'",
            "        end",
            "",
            "        if target.name == 'ExpoModulesCore'",
            "          config.build_settings['DEFINES_MODULE'] = 'YES'",
            "          config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'",
            "          config.build_settings['SWIFT_VERSION'] = '5.0'",
            "          config.build_settings['OTHER_SWIFT_FLAGS'] = '$(inherited) -D EXPO_CONFIGURATION_DEBUG'",
            "        end",
            "      end",
            "    end",
          ];
          // Insert right before the `end` that closes the `post_install` hook.
          lines.splice(postInstallEndIdx, 0, "", ...insertLines, "");
          podfile = lines.join("\n");
        }
      }
    }
    // Add use_frameworks! :linkage => :static for FirebaseAuth-Swift.h (must come before use_native_modules)
    if (!podfile.includes("use_frameworks! :linkage => :static")) {
      podfile = podfile.replace(
        /(target 'keke' do\s+use_expo_modules!\s+)/,
        "$1  use_frameworks! :linkage => :static\n\n"
      );
    }
    config.modResults.contents = podfile;
    return config;
  });
}

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

  // Production API URL: set EXPO_PUBLIC_API_URL in EAS env for production builds
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL ||
    base?.extra?.apiUrl ||
    "http://10.0.2.2:8000";

  // Physical device: set EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL in mobile/.env to your computer IP (e.g. http://192.168.1.42:8000)
  const raw =
    process.env.EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL || base?.extra?.physicalDeviceApiUrl;
  const physicalDeviceApiUrl =
    typeof raw === "string" ? raw : null;

  const result = {
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
      infoPlist: {
        ...(base.ios?.infoPlist ?? {}),
        NSContactsUsageDescription:
          base.ios?.infoPlist?.NSContactsUsageDescription ??
          "We need access to your contacts to help you share rides with friends.",
      },
      config: {
        ...(base.ios?.config ?? {}),
        googleMapsApiKey: mapsDisplayKey,
      },
    },
    extra: {
      ...(base.extra ?? {}),
      apiUrl: apiUrl.replace(/\/$/, ""), // no trailing slash
      physicalDeviceApiUrl: physicalDeviceApiUrl ? physicalDeviceApiUrl.replace(/\/$/, "") : null,
      googleMapsApiKey: "",
    },
  };
  // Fix react-native-maps iOS pod (1.27+ uses react-native-maps/Google, not react-native-google-maps)
  // Add use_modular_headers! for Firebase Swift pods
  return withFirebaseModularHeaders(withMapsPodfileFix(result));
};

