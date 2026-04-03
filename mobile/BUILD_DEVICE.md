# Build for real device testing

**This is an Expo project.** The app lives in `mobile/`. There is no `android` folder at the repo root; run all build commands from **`mobile/`**.

```bash
cd ~/Desktop/keke/mobile
```

## Prerequisites

- **mobile/.env** with at least:
  - `EXPO_PUBLIC_MAPS_DISPLAY_KEY` (required for maps)
  - For device hitting your backend: `EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL=http://YOUR_IP:8000`
- **Java JDK 17** (for local Android build / emulator): Gradle needs a Java runtime. Install and link:
  ```bash
  brew install openjdk@17
  sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk
  echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc && source ~/.zshrc
  java -version   # verify
  ```
- **Android SDK** (for local Android build / emulator): Gradle needs `ANDROID_HOME` pointing to the SDK. Install [Android Studio](https://developer.android.com/studio) (which installs the SDK), then add to `~/.zshrc`:
  ```bash
  echo 'export ANDROID_HOME=$HOME/Library/Android/sdk' >> ~/.zshrc
  echo 'export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools' >> ~/.zshrc
  source ~/.zshrc
  ```
  If the SDK is elsewhere, set `ANDROID_HOME` to that path. The post-prebuild script writes `android/local.properties` from `ANDROID_HOME` so the build finds the SDK.
- **EAS** (for cloud APK/IPA): `npm install -g eas-cli` then `eas login`
- **Android**: USB debugging on for local install, or use EAS to get an APK; emulator uses `http://10.0.2.2:8000` for backend on Mac localhost
- **iOS**: Mac with Xcode (for local device run) or EAS for IPA

---

## Option A: Installable build (APK / IPA) via EAS

Run these from **`~/Desktop/keke/mobile`** (not the repo root).

```bash
cd ~/Desktop/keke/mobile
```

**First time only:**

```bash
eas login
eas build:configure
```

**Android APK (sideload on any Android device):**

```bash
npm run prebuild:with-patch
eas build --platform android --profile preview2
```

- **preview2** = APK (installable without Play Store).
- After the build finishes, download the APK from the EAS link and install on the device.

**⚠️ Map is black / grey / not displaying on Android?**  
The home map needs a valid Google Maps API key at build time. Set `EXPO_PUBLIC_MAPS_DISPLAY_KEY` in `mobile/.env`, then run `npm run prebuild:with-patch` and rebuild. On Android, the key must be restricted to Maps SDK for Android and your app’s package name + SHA-1 in Google Cloud Console. If you restrict the key, add Android app package `com.keke.app` and the debug keystore SHA-1 (get it with: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`); without it the emulator map stays grey/blank.

**⚠️ "Unable to reach server" / build not accessing server / login too slow?**  
EAS builds bake in the API URL at build time. Use **ngrok** for a single public URL that works from anywhere (same WiFi, remote, emulator).

**Recommended: ngrok (works remotely and avoids slow/unreachable local IP)**  

1. **Install ngrok** (one-time): [ngrok.com/download](https://ngrok.com/download) or `brew install ngrok`.
2. **Start your backend** (in repo root or backend folder):  
   `cd backend && npm run dev`  
   (Backend runs on port 8000.)
3. **In a second terminal**, start the tunnel:  
   `ngrok http 8000`  
   You’ll see a line like: `Forwarding  https://abc123.ngrok-free.app -> http://localhost:8000`
4. **Copy the `https://` URL** (e.g. `https://abc123.ngrok-free.app` — no trailing slash).
5. **Point the app at it:**
   - **mobile/.env**: set  
     `EXPO_PUBLIC_API_URL=https://your-id.ngrok-free.app`  
     (Replace with your actual ngrok URL.)
   - **EAS builds**: [expo.dev](https://expo.dev) → project **keke** → **Environment variables** → production → add  
     **EXPO_PUBLIC_API_URL** = `https://your-id.ngrok-free.app`
6. **Rebuild and install:**  
   `npm run prebuild:with-patch && eas build --platform android --profile preview2`  
   Download the new APK and install. The app will use the ngrok URL and can reach the server from anywhere.

**Note:** Free ngrok URLs change each time you restart ngrok. After restarting ngrok, update `.env` and EAS env with the new URL and rebuild (or use a fixed domain on a paid ngrok plan).

**Option: Same-WiFi only (no ngrok)**  
1. Get your Mac's IP: `ipconfig getifaddr en0`
2. In EAS → Environment variables (production), set **EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL** = `http://YOUR_IP:8000`
3. Rebuild and install. Phone and Mac must be on the same WiFi.

### iOS (TestFlight / internal)

```bash
cd mobile
npm run prebuild:with-patch
npx eas build --platform ios --profile preview4
```

- **preview4** = internal distribution. Configure signing in EAS if needed.

---

## Option B: Run on a connected device (no EAS, fastest for testing)

Builds and installs the app on the device connected via USB. No EAS account needed.

### Android

```bash
cd mobile
npm run prebuild:android:with-patch
npx expo run:android --device
```

- Connect one Android device with USB debugging on (or start an emulator). Pick the device if prompted.
- APK is built locally and installed automatically.

### iOS (Mac + Xcode only)

```bash
cd mobile
npm run prebuild:ios
npx expo run:ios --device
```

- Select your iPhone when prompted. Requires Apple Developer account for a real device.

---

## Option C: Local APK build (no EAS, no credentials)

Build a **standalone** Android APK on your Mac with Gradle. The app runs straight after install—no Metro, no “Development Servers” or QR code. No Expo account or EAS needed. The APK uses the API URL from **mobile/.env** and **mobile/app.json**.

**One-time:** Java 17 and Android SDK (see Prerequisites). No `eas login` needed.

**Steps:**

1. **Set your backend URL** (e.g. ngrok) so the app can reach the server:
   - **mobile/.env**:  
     `EXPO_PUBLIC_API_URL=https://your-ngrok-url.ngrok-free.app`
   - **mobile/app.json** → `expo.extra.apiUrl`: same URL (so the built app has it).

2. **From mobile/** run:
   ```bash
   cd mobile
   npm run build:apk
   ```

3. When it finishes, the script prints the path to the APK, e.g.:
   ```text
   .../mobile/android/app/build/outputs/apk/release/app-release.apk
   ```

4. **Install on a device:**
   - **USB:** `cd mobile/android && adb install -r app/build/outputs/apk/release/app-release.apk`
   - **Or** copy `app-release.apk` to the phone (email, Drive, etc.) and open it to install (enable “Install from unknown sources” if asked).

This is a **release** build with the JS bundle embedded, signed with the debug keystore (fine for testing). For Play Store you’d use your own release keystore later.

**If you change the API URL (e.g. new ngrok URL):** update both `.env` and `app.json` → `extra.apiUrl`, then run `npm run build:apk` again.

---

## After installing on device

1. Ensure phone and computer are on the same Wi‑Fi.
2. In **mobile/.env** set:
   - `EXPO_PUBLIC_PHYSICAL_DEVICE_API_URL=http://YOUR_COMPUTER_IP:8000`
3. Start backend: `cd backend && npm run dev`
4. Open the app on the device; it will use that URL for the API.
