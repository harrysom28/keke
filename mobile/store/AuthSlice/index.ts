import { TUser } from "@/types";
import { createSlice } from "@reduxjs/toolkit";

interface IState {
  freshInstall: boolean;
  token: null | string;
  refreshToken: null | string;
  user: { profile: Partial<TUser> };
  registration: {
    type: "1" | "2";
    email_phone_number?: string;
  };
}

const initialState: IState = {
  freshInstall: true,
  token: null,
  refreshToken: null,
  user: {
    profile: {},
  },
  registration: {
    type: "1",
  },
};

const AuthSlice = createSlice({
  name: "Auth",
  initialState: initialState,
  reducers: {
    setAuthData: (state, action: { payload: Partial<IState> }) => {
      Object.assign(state, action.payload);
    },
    updateToken: (state, action: { payload: Partial<IState["token"]> }) => {
      state.token = action.payload;
    },
    updateRefreshToken: (
      state,
      action: { payload: Partial<IState["refreshToken"]> }
    ) => {
      state.refreshToken = action.payload as any;
    },
    updateRegistration: (
      state,
      action: { payload: IState["registration"] }
    ) => {
      Object.assign(state.registration, action.payload);
    },
    updateUser: (state, action: { payload: Partial<IState["user"]> }) => {
      Object.assign(state.user, action.payload);
    },
  },
});

export const {
  setAuthData,
  updateToken,
  updateRefreshToken,
  updateUser,
  updateRegistration,
} = AuthSlice.actions;
interface RootState {
  Auth: IState;
}

export const AuthState = (state: RootState): IState => state.Auth;
export default AuthSlice;
