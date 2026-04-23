import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { createTransform, persistReducer, persistStore } from "redux-persist";

import AppSlice from "./AppSlice";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthSlice from "./AuthSlice";
import {
  clearStoredTokens,
  setStoredTokens,
} from "@/utils/secureTokenStorage";

const STORAGE_VERSION = "v2";
const storageVersionKey = "app_storage_version";

async function migratePersistedStorageIfNeeded() {
  try {
    const current = await AsyncStorage.getItem(storageVersionKey);
    if (current === STORAGE_VERSION) return;

    // Only wipe redux-persist if it contains ride-related UI state.
    // This avoids unnecessarily clearing other persisted state.
    const persisted = await AsyncStorage.getItem("persist:root");
    let shouldWipePersistRoot = false;

    if (persisted) {
      try {
        const root = JSON.parse(persisted) as Record<string, unknown>;
        const appRaw = root?.App;
        const appState =
          typeof appRaw === "string" ? (JSON.parse(appRaw) as any) : null;

        const rideData = appState?.ride?.data;
        const hasRidePayload =
          !!appState?.isBooking ||
          (rideData && typeof rideData === "object" && Object.keys(rideData).length > 0);

        shouldWipePersistRoot = !!hasRidePayload;
      } catch {
        // If we can't parse it, safest is to wipe it once.
        shouldWipePersistRoot = true;
      }
    }

    if (shouldWipePersistRoot) {
      await AsyncStorage.removeItem("persist:root");
    }
    // Clean up any ride-related manual keys outside redux-persist.
    await AsyncStorage.removeItem("dismissedBookingId");

    await AsyncStorage.setItem(storageVersionKey, STORAGE_VERSION);
  } catch {
    // Never block app startup on migration.
  }
}

// Kick off the migration as early as possible; redux-persist will await getItem calls,
// and our transforms will sanitize the `App` slice even if old data exists.
void migratePersistedStorageIfNeeded();

// Don't persist token/refreshToken to AsyncStorage; they live in SecureStore only.
const authTokenStripTransform = createTransform(
  (inboundState: unknown) => inboundState,
  (outboundState: unknown) => {
    if (outboundState && typeof outboundState === "object") {
      const state = outboundState as {
        token?: unknown;
        refreshToken?: unknown;
        [k: string]: unknown;
      };
      return {
        ...state,
        token: null,
        refreshToken: null,
      };
    }
    return outboundState;
  },
  { whitelist: ["Auth"] }
);

// Never persist ride/driver ephemeral UI state (prevents stale rideId reopening sheets after reload).
const appRideStripTransform = createTransform(
  (inboundState: unknown) => {
    if (inboundState && typeof inboundState === "object") {
      const app = inboundState as any;
      return {
        ...app,
        isBooking: false,
        requestOpenBookRide: false,
        hasBookedRide: false,
        pendingOpenChatRideId: null,
        driverPendingRideOffer: false,
        ride: {
          status: false,
          data: {},
          utils: {},
        },
        subscription: {
          receipt: false,
          chat: false,
          trip_completed: false,
          started: false,
          driver_cancelled: false,
          passenger_cancelled: false,
        },
      };
    }
    return inboundState;
  },
  (outboundState: unknown) => {
    if (outboundState && typeof outboundState === "object") {
      const app = outboundState as any;
      return {
        ...app,
        isBooking: false,
        requestOpenBookRide: false,
        hasBookedRide: false,
        pendingOpenChatRideId: null,
        driverPendingRideOffer: false,
        ride: {
          status: false,
          data: {},
          utils: {},
        },
        subscription: {
          receipt: false,
          chat: false,
          trip_completed: false,
          started: false,
          driver_cancelled: false,
          passenger_cancelled: false,
        },
      };
    }
    return outboundState;
  },
  { whitelist: ["App"] }
);

const persistConfig = {
  key: "root",
  storage: AsyncStorage,
  transforms: [authTokenStripTransform, appRideStripTransform],
};

const AllReducers = combineReducers({
  App: AppSlice.reducer,
  Auth: AuthSlice.reducer,
});

const PersistedReducer = persistReducer(persistConfig, AllReducers);

/** Sync Auth token/refreshToken to SecureStore when they change; clear on logout. */
const secureTokenSyncMiddleware =
  (store: { getState: () => { Auth: { token: string | null; refreshToken: string | null } } }) =>
  (next: (a: unknown) => unknown) =>
  (action: { type: string; payload?: unknown }) => {
    const result = next(action);
    const type = action.type;
    if (
      type === "Auth/setAuthData" ||
      type === "Auth/updateToken" ||
      type === "Auth/updateRefreshToken"
    ) {
      const { token, refreshToken } = store.getState().Auth;
      if (token == null && refreshToken == null) {
        clearStoredTokens();
      } else {
        setStoredTokens({
          token: token ?? null,
          refreshToken: refreshToken ?? null,
        });
      }
    }
    return result;
  };

const AppStore = configureStore({
  reducer: PersistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(secureTokenSyncMiddleware),
});

export const persistor = persistStore(AppStore);
export default AppStore;
