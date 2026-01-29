import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { persistReducer, persistStore } from "redux-persist";

import AppSlice from "./AppSlice";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthSlice from "./AuthSlice";

const persistConfig = {
  key: "root",
  storage: AsyncStorage,
};

const AllReducers = combineReducers({
  App: AppSlice.reducer,
  Auth: AuthSlice.reducer,
});

const PersistedReducer = persistReducer(persistConfig, AllReducers);

const AppStore = configureStore({
  reducer: PersistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(AppStore);
export default AppStore;
