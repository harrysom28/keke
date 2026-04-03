import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { createTransform, persistReducer, persistStore } from "redux-persist";

import AppSlice from "./AppSlice";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthSlice from "./AuthSlice";
import {
  clearStoredTokens,
  setStoredTokens,
} from "@/utils/secureTokenStorage";

// Don't persist token/refreshToken to AsyncStorage; they live in SecureStore only.
const authTokenStripTransform = createTransform(
  (inboundState: unknown) => inboundState,
  (outboundState: unknown) => {
    if (
      outboundState &&
      typeof outboundState === "object" &&
      "Auth" in outboundState
    ) {
      const state = outboundState as { Auth?: { token?: unknown; refreshToken?: unknown; [k: string]: unknown } };
      if (state.Auth && typeof state.Auth === "object") {
        return {
          ...outboundState,
          Auth: {
            ...state.Auth,
            token: null,
            refreshToken: null,
          },
        };
      }
    }
    return outboundState;
  },
  {}
);

const persistConfig = {
  key: "root",
  storage: AsyncStorage,
  transforms: [authTokenStripTransform],
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
