import { createSlice } from "@reduxjs/toolkit";

export interface IRide {
  origin: {
    name: string;
    long: string;
    lat: string;
  };
  destination: {
    name: string;
    long: string;
    lat: string;
  };
  vehicle_type_id: string;
  driver_id: string;
  payment_type: string;
  promo_code: string;
}

export interface IUtils {
  user_location:
    | {
        name: string;
        long: string;
        lat: string;
      }
    | object;
  vehicle: object;
  drivers: Array<object>;
  promo_code: string;
  driver_id: string;
  driver: object;
  distanceTime: { cost: string; distance: string; duration: string };
}

interface IState {
  isBooking: boolean;
  ride: {
    status: boolean;
    data: IRide | object;
    utils: IUtils | object;
  };
  hasBookedRide: boolean;
  subscription: {
    receipt: boolean;
    chat: boolean;
    trip_completed: boolean;
    started: boolean;
    driver_cancelled: boolean;
    passenger_cancelled: boolean;
  };
}

const InitialState: IState = {
  isBooking: false,
  ride: {
    status: false,
    data: {},
    utils: {},
  },
  hasBookedRide: false,
  subscription: {
    receipt: false,
    chat: false,
    trip_completed: false,
    started: false,
    driver_cancelled: false,
    passenger_cancelled: false,
  },
};
const AppSlice = createSlice({
  name: "App",
  initialState: InitialState,
  reducers: {
    setAppData: (state, action) => {
      Object.assign(state, action.payload);
    },
    changeRideStatus: (state, action) => {
      state.ride.status = action.payload;
    },
    setRideData: (state, action: { payload: Partial<IRide> }) => {
      Object.assign(state.ride.data, action.payload);
    },
    setRideUtils: (state, action: { payload: Partial<IUtils> }) => {
      state.ride.utils = { ...state.ride.utils, ...action.payload };
    },
    setSubscriptionUtils: (
      state,
      action: { payload: Partial<IState["subscription"]> }
    ) => {
      Object.assign(state.subscription, action.payload);
    },
    resetSubscription: (state) => {
      state.subscription = InitialState.subscription;
    },
    resetObject: (state, action) => {
      return InitialState;
    },
  },
});

export const {
  setAppData,
  resetObject,
  setRideData,
  changeRideStatus,
  setRideUtils,
  setSubscriptionUtils,
  resetSubscription,
} = AppSlice.actions;
interface RootState {
  App: IState;
}

export const AppDetailsState = (state: RootState): IState => state.App;
export default AppSlice;
