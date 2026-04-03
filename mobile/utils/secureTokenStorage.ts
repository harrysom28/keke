/**
 * Token storage for access and refresh tokens.
 * Prefer expo-secure-store (encrypted) on native; fallback to AsyncStorage on web or if unavailable.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const KEY_ACCESS = "keke_access_token";
const KEY_REFRESH = "keke_refresh_token";
const KEY_LEGACY = "keke_tokens"; // migrate from AsyncStorage if present

export interface StoredTokens {
  token: string | null;
  refreshToken: string | null;
}

async function useSecureStore(): Promise<boolean> {
  try {
    await SecureStore.getItemAsync(KEY_ACCESS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read tokens from storage. Uses SecureStore on native when available.
 */
export async function getStoredTokens(): Promise<StoredTokens> {
  try {
    const secure = await useSecureStore();
    if (secure) {
      const [token, refreshToken] = await Promise.all([
        SecureStore.getItemAsync(KEY_ACCESS),
        SecureStore.getItemAsync(KEY_REFRESH),
      ]);
      if (token !== null || refreshToken !== null) {
        return { token, refreshToken };
      }
    }
    const json = await AsyncStorage.getItem(KEY_LEGACY);
    if (!json) return { token: null, refreshToken: null };
    const parsed = JSON.parse(json) as StoredTokens;
    const out = {
      token: parsed.token ?? null,
      refreshToken: parsed.refreshToken ?? null,
    };
    if (out.token || out.refreshToken) {
      await setStoredTokens(out);
      await AsyncStorage.removeItem(KEY_LEGACY);
    }
    return out;
  } catch (e) {
    if (__DEV__) {
      console.warn("secureTokenStorage getStoredTokens error:", e);
    }
    return { token: null, refreshToken: null };
  }
}

/**
 * Write tokens. Call after login or token refresh. Uses SecureStore on native (no AsyncStorage); AsyncStorage only on web.
 */
export async function setStoredTokens(tokens: StoredTokens): Promise<void> {
  try {
    const secure = await useSecureStore();
    if (secure) {
      if (tokens.token) await SecureStore.setItemAsync(KEY_ACCESS, tokens.token);
      else await SecureStore.deleteItemAsync(KEY_ACCESS);
      if (tokens.refreshToken) await SecureStore.setItemAsync(KEY_REFRESH, tokens.refreshToken);
      else await SecureStore.deleteItemAsync(KEY_REFRESH);
      await AsyncStorage.removeItem(KEY_LEGACY);
    } else {
      if (tokens.token || tokens.refreshToken) {
        await AsyncStorage.setItem(
          KEY_LEGACY,
          JSON.stringify({
            token: tokens.token ?? null,
            refreshToken: tokens.refreshToken ?? null,
          })
        );
      } else {
        await AsyncStorage.removeItem(KEY_LEGACY);
      }
    }
  } catch (e) {
    if (__DEV__) {
      console.warn("secureTokenStorage setStoredTokens error:", e);
    }
  }
}

/**
 * Clear tokens. Call on logout.
 */
export async function clearStoredTokens(): Promise<void> {
  try {
    const secure = await useSecureStore();
    if (secure) {
      await SecureStore.deleteItemAsync(KEY_ACCESS);
      await SecureStore.deleteItemAsync(KEY_REFRESH);
    }
    await AsyncStorage.removeItem(KEY_LEGACY);
  } catch (e) {
    if (__DEV__) {
      console.warn("secureTokenStorage clearStoredTokens error:", e);
    }
  }
}
