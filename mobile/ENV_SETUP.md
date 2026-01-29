# Mobile environment variables (local development)

This project follows a split-key setup:

- **Backend key (secret)**: stays in `backend/.env` as `GOOGLE_MAPS_API_KEY` and powers `/api/maps/*` proxy endpoints.
- **Android display key (non-secret but restricted)**: needed only so the native Maps SDK can **render maps** in the Android app.

## Maps display key (required to fix "API key not found")

Create `mobile/.env`:

```env
# Maps display-only key.
# Restrict this key in Google Cloud Console to:
# - Application restriction: Android apps (package: com.keke.app + SHA-1 fingerprints)
# - API restriction: Maps SDK for Android ONLY
EXPO_PUBLIC_MAPS_DISPLAY_KEY=YOUR_ANDROID_DISPLAY_KEY_HERE
```

Then rebuild:

```bash
cd mobile
npm run android
```

## Troubleshooting: Testing with Unrestricted Key

If maps are not displaying, temporarily **unrestrict the API key** to test if the key itself is the issue:

### Steps:

1. **Go to Google Cloud Console** → APIs & Services → Credentials
2. **Click on your API key** (`AIzaSyCpTSP_YQTRwhdCT0RPRkdsjeU_boo_OX0`)
3. **Temporarily remove restrictions:**
   - Set **Application restrictions** to "None"
   - Set **API restrictions** to "Don't restrict key" (or just enable "Maps SDK for Android")
4. **Save** and wait 1-2 minutes for changes to propagate
5. **Rebuild and test:**
   ```bash
   cd mobile
   npm run android
   ```

### What to Check:

- ✅ If maps **start working** with unrestricted key → The issue is with restrictions (SHA-1, package name, or API enablement)
- ❌ If maps **still don't work** → The API key might be invalid, expired, or "Maps SDK for Android" is not enabled

### After Testing:

⚠️ **IMPORTANT**: Once you've confirmed the key works, **re-add restrictions** for security:
- Application restriction: Android apps (package: `com.keke.app` + your SHA-1 fingerprints)
- API restriction: Maps SDK for Android ONLY

### Getting Your SHA-1 Fingerprint:

```bash
cd mobile/android/app
keytool -list -v -keystore debug.keystore -alias androiddebugkey -storepass android -keypass android
```

Look for the "SHA1" value and add it to your API key restrictions in Google Cloud Console.

