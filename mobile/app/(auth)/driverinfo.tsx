import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AuthState, updateToken, updateUser } from "@/store/AuthSlice";
import {
  CREATE_DRIVER,
  CURRENT_USER,
  VEHICLE_TYPES,
  VEHICLE_YEARS,
} from "@/constants";
import { isAuthError, isNetworkError } from "@/utils/errorHandler";
import { UserMessages } from "@/constants/userMessages";
import { City, Country, State } from "country-state-city";
import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import Svg, { Line, Path } from "react-native-svg";
import { useDispatch, useSelector } from "react-redux";

import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "../context";
import AuthForm from "@/components/AuthForm";
import Checkbox from "expo-checkbox";
import { Dropdown } from "react-native-element-dropdown";
import FormInput from "@/components/formInput";
import { ScrollView } from "react-native-gesture-handler";
import apiClient from "@/utils/apiClient";
import { queueLocationDisclosureIfNeeded } from "@/utils/locationDisclosure";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import useImagePicker from "@/hooks/useImagePicker";
import { useIsFocused } from "@react-navigation/native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { verticalScale } from "@/constants/Metrics";

const Tab = ["Personal Information"];

interface IProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  editable?: boolean;
}

const InputItem = ({
  label,
  placeholder,
  value = "",
  onChangeText,
  editable = true,
}: IProps) => {
  return (
    <View style={tw`flex-col gap-y-1`}>
      <Text style={tw.style(`text-sm`, { fontFamily: "RobotoMedium" })}>
        {label}
      </Text>
      <FormInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        editable={editable}
        height={40}
      />
    </View>
  );
};

const ProgressBar = ({ index }: { index: number }) => {
  return (
    <View style={tw`flex-row justify-center`}>
      {Array.from({
        length: 7,
      }).map((_, idx) => (
        <View key={++idx} style={tw`flex-row items-center`}>
          {idx !== 0 && (
            <Svg
              style={tw`w-[15px] h-[3px] mx-1`}
              viewBox="0 0 25 3"
              fill="none"
            >
              <Line
                x1="0.5"
                y1="1.5"
                x2="24.5"
                y2="1.5"
                stroke="#3C8F7C"
                strokeWidth="2"
              />
            </Svg>
          )}
          <View
            style={tw.style(
              `flex-row items-center justify-center h-[22px] w-[22px] border border-base-green rounded-full`,
              index > idx && `bg-base-green`
            )}
          >
            {index > idx ? (
              <AntDesign name="check" size={16} color="white" />
            ) : (
              <Text
                style={tw.style(`text-base-green text-base`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {++idx}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

interface SProps {
  label: string;
  placeholder: string;
  data: Array<{ label: string; value: string }>;
  onChange: (val: string) => void;
  value: string;
  disabled?: boolean;
}

const SelectItem = ({
  label,
  placeholder,
  data = [],
  onChange,
  value = "",
  disabled = false,
}: SProps) => {
  return (
    <View style={tw`flex-col gap-y-1`}>
      <Text style={tw.style(`text-sm`, { fontFamily: "RobotoMedium" })}>
        {label}
      </Text>
      <Dropdown
        style={tw.style(
          `text-sm border border-[#b8b8b8] py-1.5 px-3.5 rounded-[8px]`,
          {
            height: verticalScale(40),
            fontFamily: "RobotoMedium",
            opacity: disabled ? 0.5 : 1,
          }
        )}
        mode="modal"
        data={data}
        search={false}
        maxHeight={300}
        labelField={"label"}
        valueField={"value"}
        itemTextStyle={tw.style(`text-black text-sm`, {
          fontFamily: "RobotoMedium",
        })}
        selectedTextStyle={tw.style(`text-black text-sm`, {
          fontFamily: "RobotoMedium",
        })}
        placeholderStyle={tw.style(`text-[#D0D0D0] text-sm`, {
          fontFamily: "RobotoMedium",
        })}
        containerStyle={tw.style(`text-black text-xs shadow-none border mt-1`)}
        placeholder={placeholder}
        value={value}
        disable={disabled}
        onChange={(item) => {
          if (!disabled) {
            console.log(item?.value);
            onChange(item?.value);
          }
        }}
      />
    </View>
  );
};

const Gender = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

const normalizeGenderForEnum = (g: string) => {
  const x = String(g || "").trim().toLowerCase();
  return x === "male" || x === "female" ? x : "";
};

const CheckItem = ({
  item,
  isChecked,
  setChecked,
}: {
  item: {};
  isChecked: boolean;
  setChecked: (value: boolean) => void;
}) => {
  return (
    <Pressable
      onPress={() => setChecked(!isChecked)}
      style={tw`flex-row justify-between items-center  py-3.5`}
    >
      <Text
        style={tw.style(`text-black text-base`, {
          fontFamily: "RobotoRegular",
        })}
      >
        {item?.name}
      </Text>
      <Checkbox
        style={tw.style(`bg-[#3C8F7C4D] border-[1.5px] border-base-green`)}
        value={isChecked}
        // onValueChange={setChecked}
      />
    </Pressable>
  );
};

const Levels = [
  {
    title: "Let's Verify your driver license",
    text: "Upload a legible picture of your driver license to verify it",
  },
  {
    title: "Let's Verify your Govt issued card",
    text: "Upload a legible picture of your govt issued identification card to verify it",
  },
  {
    title: "Take a photo of yourself",
    text: "Upload a legible picture of yourself to verify it",
  },
  {
    title: "Take a photo of the vehicle",
    text: "Upload a legible picture of the vehicle to verify it",
  },
];

const DriverInfo = () => {
  const isFocused = useIsFocused();
  const dispatch = useDispatch();
  const { apiConfig } = useContext(AppContext);
  const { user } = useSelector(AuthState);
  const router = useRouter();
  const { name: nameFromParams, initialIndex: initialIndexParam } = useLocalSearchParams<{ name?: string; initialIndex?: string }>();

  // If an initialIndex param was passed (e.g. from Account Settings "jump to step"),
  // parse it and derive the matching step number for the upload stages (index >= 3).
  const parsedInitialIndex = (() => {
    const n = parseInt(initialIndexParam ?? "", 10);
    return Number.isFinite(n) && n >= 0 && n <= 6 ? n : 0;
  })();
  const initialStep = parsedInitialIndex >= 3 ? parsedInitialIndex - 1 : 1;

  const [index, setIndex] = useState(parsedInitialIndex);
  const [current, setCurrent] = useState(Tab[0]);
  const { selectedImage, showImagePicker, showImagePickerWithOptions, clearImage } = useImagePicker({
    filetype: "image",
  });
  const [selected, setSelected] = useState<any>(selectedImage);
  const [currentIndex, setcurrentIndex] = useState({
    step: initialStep,
    total: 5,
    btn: parsedInitialIndex >= 3 ? "Continue" : "Next",
  });
  
  // Get name from route params, user profile, or empty string
  const getNameParts = () => {
    const fullName = nameFromParams || user?.profile?.name || user?.name || "";
    if (fullName) {
      const parts = fullName.trim().split(" ");
      return {
        first: parts[0] || "",
        last: parts.slice(1).join(" ") || "",
      };
    }
    return { first: "", last: "" };
  };
  
  const nameParts = getNameParts();
  
  const [state, setState] = useState({
    first_name: nameParts.first,
    last_name: nameParts.last,
    gender: normalizeGenderForEnum(
      user?.profile?.gender || user?.gender || ""
    ),
    vehicle_name: "",
    vehicle_year: "",
    vehicle_color: "",
    vehicle_model: "",
    vehicle_type_id: "",
    licence_plate_number: "",
    union_number: "",
    state: user?.profile?.state || user?.state || "",
    city: "",
    // liscence: null,
    // id: null,
    // photo: null,
    licence_image_name: null,
    id_card_image_name: null,
    image_name: null,
    vehicle_image_name: null,
  });

  const [vehicleData, setVehicleData] = useState({
    types: [],
    year: [],
  });
  const [loading, setLoading] = useState(false);
  // Ref-based reentrancy lock for handleSubmit. Using a ref (not `loading`)
  // because setState is async: two rapid taps can both pass an
  // `if (loading) return` check before React flushes the first setLoading(true).
  // The ref updates synchronously, so the second tap sees the latch and bails.
  const inFlight = useRef(false);

  const CountryIndex = Country.getAllCountries().find(
    (i) => i.name === user?.profile?.country
  );
  const States =
    CountryIndex === undefined
      ? [{ name: "Please Select a Country" }]
      : State.getStatesOfCountry(CountryIndex?.isoCode);

  const StateIndex = States.find((i) => i.name === state.state);
  const Cities =
    StateIndex === undefined
      ? [{ name: "Please Select a state" }]
      : City.getCitiesOfState(CountryIndex?.isoCode, StateIndex?.isoCode);

  useEffect(() => {
    if (selectedImage !== null) {
      if (currentIndex.step === 2) {
        setState((prev) => ({ ...prev, licence_image_name: selectedImage }));
      } else if (currentIndex.step === 3) {
        setState((prev) => ({ ...prev, id_card_image_name: selectedImage }));
      } else if (currentIndex.step === 4) {
        setState((prev) => ({ ...prev, image_name: selectedImage }));
      } else if (currentIndex.step === 5) {
        setState((prev) => ({ ...prev, vehicle_image_name: selectedImage }));
      }
    }
  }, [selectedImage]);

  useEffect(() => {
    if (currentIndex.step === 2) {
      setSelected(state.licence_image_name);
    } else if (currentIndex.step === 3) {
      setSelected(state.id_card_image_name);
    } else if (currentIndex.step === 4) {
      setSelected(state.image_name);
    } else if (currentIndex.step === 5) {
      setSelected(state.vehicle_image_name);
    }
  }, [state, index, currentIndex.step]);

  // Update name fields when user data or route params change
  useEffect(() => {
    const fullName = nameFromParams || user?.profile?.name || user?.name || "";
    let first = "";
    let last = "";
    
    if (fullName) {
      const parts = fullName.trim().split(" ");
      first = parts[0] || "";
      last = parts.slice(1).join(" ") || "";
    }
    
    setState((prev) => ({
      ...prev,
      first_name: first || prev.first_name,
      last_name: last || prev.last_name,
      gender:
        normalizeGenderForEnum(
          user?.profile?.gender || user?.gender || ""
        ) || prev.gender,
      state: user?.profile?.state || user?.state || prev.state,
    }));
  }, [nameFromParams, user?.profile?.name, user?.name, user?.profile?.gender, user?.gender, user?.profile?.state, user?.state]);

  // If the user already has a partial driver profile on the server (e.g.
  // they arrived here via Account Settings → "Complete setup" with
  // initialIndex pointing at the vehicle-photos step), seed the form
  // state from it. Without this, jumping to a later step leaves all the
  // earlier-step fields empty and the final POST /driver/create trips
  // every required-field rule in the createDriver validator (which
  // returns 400 with a structured `errors` payload). We do this once on
  // mount and only fill blanks — we never overwrite something the user
  // has already typed in this session.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("driver/profile")
      .then(({ data }) => {
        if (cancelled) return;
        const d = data?.data?.driver;
        if (!d) return;
        setState((prev) => ({
          ...prev,
          vehicle_type_id:
            prev.vehicle_type_id || d.vehicle_details?.vehicle_type || "",
          vehicle_name:
            prev.vehicle_name || d.vehicle_details?.vehicle_type_name || "",
          vehicle_model:
            prev.vehicle_model || d.vehicle_details?.model || "",
          vehicle_year:
            prev.vehicle_year ||
            (d.vehicle_details?.year ? String(d.vehicle_details.year) : ""),
          vehicle_color:
            prev.vehicle_color || d.vehicle_details?.color || "",
          licence_plate_number:
            prev.licence_plate_number ||
            d.vehicle_details?.plate_number ||
            "",
          // The backend stores the driver's license / union number in
          // `licenseNumber` regardless of vehicle type. Mobile sources
          // that field from `union_number` (Keke) or maps it through the
          // backend normalizer for other types, so it's safe to seed
          // back into union_number for resume — the normalizer accepts
          // either name on the way out.
          union_number: prev.union_number || d.license_number || "",
        }));
      })
      .catch(() => {
        // Fresh signup (no driver record yet) returns 404 here; that's
        // expected and we just leave the form blank. Other transient
        // errors (network, 5xx) are swallowed too — we surface real
        // problems at submit time, not on mount.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Unified back navigation. Called from both the hardware back handler and
  // the on-screen Back button so the two paths can never diverge.
  const handleGoBack = useCallback(() => {
    if (index === 0) {
      router.back();
      return;
    }
    if (index >= 7) {
      router.back();
      return;
    }

    setIndex((prev) => prev - 1);

    if (index >= 2 && currentIndex.step > 1) {
      setcurrentIndex((prev) => ({
        ...prev,
        step: prev.step - 1,
        btn: "Continue",
      }));
      clearImage();
    } else {
      setcurrentIndex({
        step: 1,
        total: 3,
        btn: "Next",
      });
    }
  }, [index, currentIndex.step, router, clearImage]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      handleGoBack();
      return true;
    });
    return () => backHandler.remove();
  }, [handleGoBack]);

  const getVehicleData = (URL: string, setReturnedData: (data: any) => void, params?: any) => {
    axios
      .get(URL, { ...apiConfig, params })
      .then(({ data }) => {
        setReturnedData(data?.data);
      })
      .catch((err) => {
        console.log("Vehicle data fetch error:", err?.response?.data || err.message);
        
        // Only show error messages for critical failures, not for missing data
        if (err?.response?.status && err?.response?.status >= 500) {
          const errorData = err?.response?.data?.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || err?.response?.data?.message || 'Failed to load data');
          showMessage({
            type: "danger",
            message: typeof errorMessage === 'string' ? errorMessage : 'Failed to load data',
          });
        }
      });
  };

  // Fetch vehicle types on mount
  useEffect(() => {
    if (isFocused) {
      getVehicleData(VEHICLE_TYPES, (types) => {
        // Handle both response formats: { vehicle_types: [...] } or direct array
        const vehicleTypes = types?.vehicle_types || types || [];
        setVehicleData((prev) => ({ ...prev, types: vehicleTypes }));
      });
    }
  }, [isFocused]);

  // Fetch vehicle-specific data when vehicle type is selected
  useEffect(() => {
    if (state.vehicle_type_id) {
      // Fetch years for selected vehicle type
      getVehicleData(
        VEHICLE_YEARS,
        (yearsData) => {
          const years = yearsData?.years || yearsData || [];
          setVehicleData((prev) => ({
            ...prev,
            year: years.map((year: any) => ({
              label: String(year.value || year.year || year),
              value: String(year.value || year.year || year),
            })),
          }));
        },
        { vehicleTypeId: state.vehicle_type_id }
      );
    } else {
      // Clear vehicle-specific data when no type is selected
      setVehicleData((prev) => ({
        ...prev,
        year: [],
      }));
    }
  }, [state.vehicle_type_id]);

  const mimeFromUri = (uri: string) => {
    const ext = (uri.split(".").pop() || "jpg").toLowerCase();
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "png") return "image/png";
    if (ext === "gif") return "image/gif";
    if (ext === "heic" || ext === "heif") return "image/heic";
    return `image/${ext}`;
  };

  const handleSubmit = async () => {
    if (inFlight.current) return;

    // Pre-flight: the createDriver validator on the backend is strict and
    // *unconditional* — every field below must be present even when the
    // user resumes via Account Settings → "Complete setup" with an
    // initialIndex that jumps past the personal/vehicle steps. Catching
    // missing fields here means we route the user back to the relevant
    // step with a clear message instead of POSTing a half-empty payload
    // and surfacing the server's generic "Validation failed" toast.
    const isKekeSelected = (() => {
      const t = vehicleData?.types.find(
        (type: any) =>
          (type?.vehicle_id || type?._id) === state.vehicle_type_id
      );
      const name = (t as any)?.name?.toLowerCase?.() || "";
      const display = (t as any)?.display_name?.toLowerCase?.() || "";
      return name === "keke" || display === "keke";
    })();

    type StepGap = { msg: string; target: number };
    let gap: StepGap | null = null;
    if (!state.vehicle_type_id) {
      gap = { msg: "Please select a vehicle type before submitting.", target: 0 };
    } else if (!state.vehicle_model?.trim()) {
      gap = { msg: "Please enter your vehicle model before submitting.", target: 1 };
    } else if (!state.vehicle_year) {
      gap = { msg: "Please select your vehicle year before submitting.", target: 1 };
    } else if (!state.vehicle_color?.trim()) {
      gap = { msg: "Please enter your vehicle color before submitting.", target: 1 };
    } else if (!state.licence_plate_number?.trim()) {
      gap = { msg: "Please enter your license plate number before submitting.", target: 1 };
    } else if (isKekeSelected && !state.union_number?.trim()) {
      // Non-Keke users don't have a union_number input today, so we let
      // those slide through to the server — it'll surface a clear
      // "License number is required" error via the 400 handler below.
      gap = { msg: "Please enter your union number before submitting.", target: 1 };
    }

    if (gap) {
      showMessage({ type: "warning", message: gap.msg });
      setIndex(gap.target);
      setcurrentIndex({ step: 1, total: 3, btn: "Next" });
      return;
    }

    inFlight.current = true;
    setLoading(true);
    try {
      // Pre-flight token check. Access tokens expire after 15 minutes and
      // this multi-step form (four photos) routinely takes longer — and this
      // submit is the flow's first network call, so an expired token would
      // otherwise only be discovered mid-upload, where the server's early 401
      // can reach the device as a connection reset ("Network Error") instead
      // of a response. A cheap authenticated GET here lets the apiClient
      // interceptor refresh the token (updating Redux) before we stream the
      // multipart body.
      try {
        await apiClient.get(CURRENT_USER, { timeout: 15000 });
      } catch (preflightErr) {
        if (isAuthError(preflightErr)) {
          showMessage({ type: "danger", message: UserMessages.authRequired });
          return;
        }
        // Anything else (offline, transient 5xx): continue and let the
        // upload attempt surface the real error via the catch below.
      }

      const data = new FormData();

      const imageFields = [
        "licence_image_name",
        "id_card_image_name",
        "image_name",
        "vehicle_image_name",
      ];
      // Vehicle fields are sent nested under vehicleDetails[*] below — the
      // createDriver validator in backend/src/controllers/driverController.js
      // reads them off `req.body.vehicleDetails`, not as top-level keys. We
      // exclude them from the flat loop so we don't double-send and so the
      // server-side body shape exactly matches the validator chain.
      const vehicleDetailsFields = [
        "vehicle_name",
        "vehicle_model",
        "vehicle_year",
        "vehicle_color",
        "vehicle_type_id",
        "licence_plate_number",
      ];
      Object.keys(state).forEach((key) => {
        if (
          !imageFields.includes(key) &&
          !vehicleDetailsFields.includes(key) &&
          state[key as keyof typeof state] !== null &&
          state[key as keyof typeof state] !== undefined
        ) {
          data.append(key, state[key as keyof typeof state] as string);
        }
      });

      // Nested vehicleDetails payload. FormData accepts bracket-notation
      // keys; the backend's multipart parser rebuilds them into a nested
      // object so the validator sees `vehicleDetails.make` etc.
      data.append("vehicleDetails[make]", state.vehicle_name);
      data.append("vehicleDetails[model]", state.vehicle_model);
      data.append("vehicleDetails[year]", state.vehicle_year);
      data.append("vehicleDetails[color]", state.vehicle_color);
      data.append(
        "vehicleDetails[plateNumber]",
        state.licence_plate_number
      );
      data.append("vehicleDetails[vehicleType]", state.vehicle_type_id);

      const imageFieldMap = {
        licence_image_name: "licence_image_name",
        id_card_image_name: "id_card_image_name",
        image_name: "image_name",
        vehicle_image_name: "vehicle_image_name",
      } as const;

      for (const [stateKey, formKey] of Object.entries(imageFieldMap)) {
        const img = state[stateKey as keyof typeof state] as {
          uri?: string;
        } | null;
        if (img?.uri) {
          const ext = img.uri.split(".").pop() || "jpg";
          const typed = img as { uri: string; type?: string };
          data.append(formKey, {
            uri: img.uri,
            type: typed.type || mimeFromUri(img.uri),
            name: `${formKey}.${ext}`,
          } as unknown as Blob);
        }
      }

      // TEMPORARY diagnostic: log the URI scheme of each image part
      // right before we POST. We expect `file://` for compressed assets
      // out of expo-image-manipulator; `ph://` (Photos library) or
      // `assets-library://` indicates the compression fallback returned
      // the original gallery URI, which the native multipart layer
      // cannot read and surfaces as `ERR_NETWORK` with no response.
      // Remove once the registration upload is verified working.
      if (__DEV__) {
        const imageFieldMap2 = [
          "licence_image_name",
          "id_card_image_name",
          "image_name",
          "vehicle_image_name",
        ];
        imageFieldMap2.forEach((key) => {
          const img = state[key as keyof typeof state] as {
            uri?: string;
          } | null;
          console.log(`${key} URI scheme:`, img?.uri?.split("://")[0]);
        });
      }

      // Use the configured apiClient (utils/apiClient.ts) so we get:
      //   1. Bearer token attached from Redux on every request.
      //   2. Content-Type stripped on FormData bodies, letting axios/RN
      //      set `multipart/form-data; boundary=...` correctly (the
      //      missing boundary was the prior "Network Error" cause).
      //   3. Request/response logging via the interceptor, so this POST
      //      now shows up in Metro alongside the other API calls.
      // Do NOT pass a `headers` object here; apiClient handles them.
      await apiClient.post(CREATE_DRIVER, data, {
        // Safety net for slow networks even after on-device compression.
        // Backend uploads to Cloudinary in parallel; 180s covers large JPEGs
        // on Android mobile data where TLS + multipart can spike latency.
        timeout: 180000,
        onUploadProgress: (progressEvent) => {
          const percent = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          console.log(`Upload progress: ${percent}%`);
        },
      });

      showMessage({
        type: "success",
        message: "Driver registration completed successfully",
      });
      await queueLocationDisclosureIfNeeded("driver");
      router.navigate("/");
    } catch (err: unknown) {
      const e = err as {
        response?: {
          status?: number;
          data?: {
            message?: string;
            errors?: Record<string, unknown>;
            error?: { message?: string } | string;
          };
        };
        message?: string;
      };
      console.log(
        "Driver registration error:",
        e?.response?.data || e?.message
      );

      let message: string =
        "Registration failed. Please try again.";
      // The backend's `ValidationError` class returns HTTP 400 (see
      // backend/src/utils/errors.js), not 422 — so we accept both here.
      // Previously only 422 was handled, which meant a real 400 from
      // express-validator fell through to the generic message branch
      // below and surfaced as "Validation failed" / "Registration
      // failed" with no field detail. That is what the user was
      // perceiving as a "network error" on the device.
      const hasStructuredErrors =
        (e?.response?.status === 400 || e?.response?.status === 422) &&
        !!e?.response?.data?.errors;
      if (hasStructuredErrors) {
        const errors = e!.response!.data!.errors!;
        const firstError = Object.values(errors)[0];
        const extracted = Array.isArray(firstError)
          ? firstError[0]
          : firstError;
        message =
          typeof extracted === "string"
            ? extracted
            : "Validation error. Please check your input.";
      } else if (isNetworkError(err)) {
        // No HTTP response (connection dropped/reset, or timeout). Show the
        // standard friendly copy instead of axios's raw "Network Error".
        message = UserMessages.networkError;
      } else {
        const raw =
          e?.response?.data?.message ||
          (typeof e?.response?.data?.error === "object" &&
          e?.response?.data?.error &&
          "message" in e.response.data.error
            ? e.response.data.error.message
            : undefined) ||
          (typeof e?.response?.data?.error === "string"
            ? e.response.data.error
            : undefined) ||
          e?.message;
        if (typeof raw === "string" && raw) message = raw;
      }

      // A 409 for the driver profile itself means a prior submit attempt
      // succeeded on the backend even though the client never saw the 2xx
      // (e.g. mobile network dropped the response, or the container
      // restarted right after persisting the driver doc). Treat it as
      // success and let the user continue. License/plate uniqueness
      // collisions are real validation errors the user must fix, so those
      // still surface as a danger flash.
      if (e?.response?.status === 409) {
        const lower = message.toLowerCase();
        const isFieldConflict =
          lower.includes("license number") ||
          lower.includes("licence number") ||
          lower.includes("plate number");
        const isProfileConflict =
          !isFieldConflict &&
          (lower.includes("already exists") ||
            lower.includes("already registered"));
        if (isProfileConflict) {
          showMessage({
            type: "success",
            message: "Driver registration already completed",
          });
          await queueLocationDisclosureIfNeeded("driver");
          router.navigate("/");
          return;
        }
      }

      showMessage({
        type: "danger",
        message,
      });
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  const handleValidate = useCallback(() => {
    let validationMessage = ""; // Initialize an empty validation message

    switch (index) {
      case 0:
        // Validate Personal Information step
        if (!state.gender || !state.vehicle_type_id || !state.vehicle_name) {
          validationMessage =
            "Please select a gender, vehicle type and enter the vehicle name.";
        }
        break;

      case 1:
        // Validate Vehicle Details step
        if (!state.vehicle_type_id) {
          validationMessage = "Please select a vehicle type first.";
        } else if (!state.vehicle_model || state.vehicle_model.trim() === "") {
          validationMessage = "Please enter a vehicle model.";
        } else if (!state.vehicle_year) {
          validationMessage = "Please select a vehicle year.";
        } else if (!state.vehicle_color || state.vehicle_color.trim() === "") {
          validationMessage = "Please enter a vehicle color.";
        } else if (!state.licence_plate_number) {
          validationMessage = "Please enter the license plate number.";
        } else {
          // Check if Union Number is required for Keke
          const selectedVehicleType = vehicleData?.types.find(
            (type: any) => (type?.vehicle_id || type?._id) === state.vehicle_type_id
          );
          const isKeke = selectedVehicleType?.name?.toLowerCase() === "keke" ||
                        selectedVehicleType?.display_name?.toLowerCase() === "keke";
          if (isKeke && !state.union_number) {
            validationMessage = "Please enter your union number (required for Keke users).";
          }
        }
        break;

      case 2:
        // Validate Location Information step
        if (!state.state) {
          validationMessage = "Please select a state.";
        } else if (!state.city) {
          validationMessage = "Please enter a city.";
        }
        break;

      case 3:
        // Validate Driver License step
        if (!state.licence_image_name) {
          validationMessage = "Please upload an image of your driver license.";
        }
        break;

      case 4:
        // Validate ID Card step
        if (!state.id_card_image_name) {
          validationMessage =
            "Please upload an image of your government-issued ID card.";
        }
        break;

      case 5:
        // Validate Profile Photo step
        if (!state.image_name) {
          validationMessage = "Please upload a photo of yourself.";
        }
        break;

      case 6:
        // Validate Vehicle Photo step
        if (!state.vehicle_image_name) {
          validationMessage = "Please upload a photo of the vehicle.";
        }
        break;

      default:
        break;
    }

    // Display the validation message if there is one
    if (validationMessage) {
      showMessage({
        type: "warning",
        message: validationMessage,
      });
      return false; // Validation failed, prevent moving to the next step
    }

    return true; // Validation passed, allow moving to the next step
  }, [state, index]);

  const handleProgress = () => {
    if (index < 6) {
      if (handleValidate()) {
        setIndex((prev) => prev + 1);

        if (index >= 2) {
          setcurrentIndex((prev) => ({
            ...prev,
            step: prev.step + 1,
            btn: "Continue",
          }));
          clearImage();
        }
      }
    } else {
      if (handleValidate()) {
        handleSubmit();
      }
    }
  };

  return (
    <AuthForm
      height={260}
      current={current}
      setCurrent={setCurrent}
      Tab={index > 1 ? undefined : Tab}
      footer={
        <View style={tw`flex-row items-center justify-between px-6 mt-5`}>
          <TouchableOpacity
            onPress={handleGoBack}
            disabled={loading}
            style={tw.style(
              `flex-row flex-1 mr-3 justify-center px-6 items-center border border-base-green rounded-[8px]`,
              { height: verticalScale(45) },
              loading && `opacity-50`
            )}
          >
            <Text
              style={tw.style(`text-base-green text-base`, {
                fontFamily: "RobotoBold",
              })}
            >
              Back
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProgress}
            disabled={loading}
            style={tw.style(
              `flex-row flex-1 justify-center items-center px-6 bg-base-green rounded-[8px]`,
              { height: verticalScale(45) }
            )}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                style={tw.style(`text-white text-base`, {
                  fontFamily: "RobotoBold",
                })}
              >
                {currentIndex.btn}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      }
    >
      <ProgressBar index={index} />

      {index === 0 && (
        <View style={tw`flex-col gap-y-2.5`}>
          <InputItem
            value={state.first_name}
            label="First Name"
            placeholder="Input first name"
            editable={false}
            onChangeText={() => null}
          />
          <InputItem
            value={state.last_name}
            label="Last Name"
            placeholder="Input last name"
            editable={false}
            onChangeText={() => null}
          />
          <SelectItem
            label="Gender"
            placeholder="Select Gender"
            data={Gender}
            value={state?.gender}
            onChange={(gender) => setState((prev) => ({ ...prev, gender }))}
          />
          <SelectItem
            label="Vehicle Type"
            placeholder="Select Vehicle Type"
            data={
              vehicleData?.types.length > 0
                ? vehicleData.types.map((type) => ({
                    label: type?.display_name || type?.vehicle_type || type?.name,
                    value: type?.vehicle_id || type?._id,
                  }))
                : [{ label: "No data available", value: "" }]
            }
            value={state.vehicle_type_id}
            onChange={(vehicle_type_id) => {
              // Clear vehicle-specific fields when type changes
              setState((prev) => ({
                ...prev,
                vehicle_type_id,
                vehicle_model: "",
                vehicle_year: "",
                vehicle_color: "",
                union_number: "", // Clear union number when type changes
              }));
            }}
          />
          <InputItem
            value={state.vehicle_name}
            onChangeText={(vehicle_name) =>
              setState((prev) => ({ ...prev, vehicle_name }))
            }
            label="Vehicle Name"
            placeholder="Input Vehicle Name"
          />
        </View>
      )}

      {index === 1 && (
        <View style={tw`flex-col gap-y-2.5`}>
          <InputItem
            value={state.vehicle_model}
            onChangeText={(vehicle_model) =>
              setState((prev) => ({ ...prev, vehicle_model }))
            }
            label="Vehicle Model"
            placeholder="Input Vehicle Model"
          />
          <SelectItem
            label="Vehicle Year"
            placeholder={
              state.vehicle_type_id
                ? "Select Vehicle Year"
                : "Select Vehicle Type first"
            }
            data={
              vehicleData?.year.length > 0
                ? vehicleData.year
                : [{ label: state.vehicle_type_id ? "No data available" : "Select Vehicle Type first", value: "" }]
            }
            value={state.vehicle_year}
            onChange={(vehicle_year) =>
              setState((prev) => ({ ...prev, vehicle_year }))
            }
            disabled={!state.vehicle_type_id}
          />
          <InputItem
            value={state.vehicle_color}
            onChangeText={(vehicle_color) =>
              setState((prev) => ({ ...prev, vehicle_color }))
            }
            label="Vehicle Color"
            placeholder="Input Vehicle Color"
          />
          <InputItem
            value={state.licence_plate_number}
            onChangeText={(licence_plate_number) =>
              setState((prev) => ({ ...prev, licence_plate_number }))
            }
            label="License Plate no"
            placeholder="Input License Plate no"
          />
          {/* Show Union Number only for Keke vehicle type */}
          {(() => {
            const selectedVehicleType = vehicleData?.types.find(
              (type: any) => (type?.vehicle_id || type?._id) === state.vehicle_type_id
            );
            const isKeke = selectedVehicleType?.name?.toLowerCase() === "keke" ||
                          selectedVehicleType?.display_name?.toLowerCase() === "keke";
            
            if (isKeke) {
              return (
                <InputItem
                  value={state.union_number}
                  onChangeText={(union_number) =>
                    setState((prev) => ({ ...prev, union_number }))
                  }
                  label="Union Number (Keke Users only)"
                  placeholder="Input Union Number"
                />
              );
            }
            return null;
          })()}
        </View>
      )}

      {index === 2 && (
        <View style={tw`flex-col self-start w-full gap-y-2.5`}>
          <Text
            style={tw.style(`text-[#0000009E] text-[11px]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Step {currentIndex.step} of {currentIndex.total}
          </Text>
          <Text
            style={tw.style(`text-black text-lg`, {
              fontFamily: "RobotoBold",
            })}
          >
            Driver's Location
          </Text>
          <Text
            style={tw.style(`text-black text-base`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Discover the 'Driver's Location': Where Comfort Meets the Open Road.
            Your Zen Zone on every ride
          </Text>
          <View>
            <Text
              style={tw.style(`text-black text-base`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Preferences State
            </Text>
            <SelectItem
              label=""
              placeholder="Select Preference state"
              data={States.map(({ name }) => ({
                label: name,
                value: name,
              }))}
              value={state.state}
              onChange={(state) => setState((prev) => ({ ...prev, state }))}
            />
          </View>
          <View
            style={tw.style(` mt-1 bg-white py-2 px-2 rounded-[8px]`, {
              height: verticalScale(150),
              shadowColor: "#000",
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 8,
            })}
          >
            <ScrollView
              contentContainerStyle={tw`flex-col pr-2.5 pb-3`}
              showsVerticalScrollIndicator
              persistentScrollbar
            >
              {Cities.map((item, idx) => (
                <CheckItem
                  key={item?.name}
                  item={item}
                  isChecked={state.city === item?.name}
                  setChecked={(bool) =>
                    setState((prev) => ({
                      ...prev,
                      city: bool ? item?.name : "",
                    }))
                  }
                />
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {index >= 3 && (
        <View style={tw`flex-col self-start w-full gap-y-2.5`}>
          <Text
            style={tw.style(`text-[#0000009E] text-[11px]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Step {currentIndex.step} of {currentIndex.total}
          </Text>
          <Text
            style={tw.style(`text-black text-lg`, {
              fontFamily: "RobotoBold",
            })}
          >
            {Levels[currentIndex.step - 2].title}
          </Text>
          <Text
            style={tw.style(`text-black text-base`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {Levels[currentIndex.step - 2].text}
          </Text>
          {selected === null ? (
            <TouchableOpacity
              onPress={showImagePickerWithOptions}
              style={tw.style(
                `flex-col mt-5 justify-center items-center rounded-[40px] border-[6px] border-base-green border-dashed`,
                { height: verticalScale(180) }
              )}
            >
              <Svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                <Path
                  d="M22.2719 57.737H16.5398C7.76281 57.1101 3.82227 50.3632 3.82227 44.3626C3.82227 38.362 7.76284 31.5852 16.3906 30.9881C17.6146 30.8687 18.6893 31.824 18.7788 33.0779C18.8684 34.3019 17.9431 35.3766 16.6892 35.4662C10.8976 35.8841 8.30033 40.2427 8.30033 44.3924C8.30033 48.5421 10.8976 52.9008 16.6892 53.3187H22.2719C23.4959 53.3187 24.5109 54.3337 24.5109 55.5577C24.5109 56.7817 23.4959 57.737 22.2719 57.737Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M49.7661 57.7372C49.7064 57.7372 49.6766 57.7372 49.6169 57.7372C48.3929 57.7372 47.2585 56.7222 47.2585 55.4982C47.2585 54.2144 48.2138 53.2591 49.4676 53.2591C53.1396 53.2591 56.4236 51.9754 58.991 49.6767C63.6482 45.6166 63.9467 39.7653 62.6928 35.6454C61.439 31.5555 57.9461 26.8684 51.8559 26.1221C50.8707 26.0027 50.0944 25.2563 49.9153 24.2712C48.7212 17.1063 44.8702 12.1505 39.0188 10.3593C32.9884 8.47852 25.9428 10.3294 21.5543 14.9269C17.2852 19.3751 16.3 25.6146 18.7779 32.4809C19.1958 33.6452 18.5989 34.9289 17.4346 35.3469C16.2703 35.7648 14.9865 35.1678 14.5686 34.0035C11.5534 25.5847 12.9267 17.5242 18.3302 11.852C23.8531 6.06037 32.7197 3.76161 40.3324 6.0902C47.3182 8.23967 52.2439 14.0014 54.0352 22.0022C60.1253 23.3755 65.0214 28.0029 66.9619 34.3916C69.0815 41.3475 67.1709 48.5124 61.9465 53.0502C58.6327 56.0355 54.3039 57.7372 49.7661 57.7372Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M35.8241 66.5144C29.8235 66.5144 24.2111 63.3201 21.1361 58.1554C20.8077 57.6479 20.4793 57.0508 20.2107 56.394C19.1956 54.2744 18.6582 51.8562 18.6582 49.3485C18.6582 39.8849 26.3605 32.1826 35.8241 32.1826C45.2877 32.1826 52.99 39.8849 52.99 49.3485C52.99 51.8861 52.4527 54.2744 51.378 56.4836C51.1391 57.0508 50.8108 57.6479 50.4525 58.2151C47.4373 63.3201 41.8247 66.5144 35.8241 66.5144ZM35.8241 36.6607C28.8383 36.6607 23.1363 42.3627 23.1363 49.3485C23.1363 51.1995 23.5244 52.931 24.2707 54.5132C24.5096 55.0207 24.7185 55.4387 24.9573 55.8268C27.2262 59.6779 31.3759 62.0364 35.7942 62.0364C40.2126 62.0364 44.3622 59.6779 46.6013 55.8865C46.8699 55.4387 47.1089 55.0207 47.288 54.6028C48.0941 52.9608 48.4821 51.2293 48.4821 49.3784C48.5119 42.3627 42.8099 36.6607 35.8241 36.6607Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M34.1227 54.5425C33.5555 54.5425 32.9883 54.3335 32.5405 53.8857L29.5849 50.9302C28.7191 50.0644 28.7191 48.6315 29.5849 47.7657C30.4506 46.8999 31.8836 46.8999 32.7494 47.7657L34.1825 49.1987L38.959 44.7803C39.8845 43.9444 41.2876 44.0041 42.1235 44.8997C42.9594 45.7953 42.8997 47.2283 42.0041 48.0643L35.6453 53.9454C35.1975 54.3335 34.6601 54.5425 34.1227 54.5425Z"
                  fill="#3C8F7C"
                />
              </Svg>

              <Text
                style={tw.style(`text-base-green text-[15px]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Choose a image or Capture image
              </Text>
            </TouchableOpacity>
          ) : selected?.uri ? (
            <Image
              source={{ uri: selected.uri }}
              style={tw.style(`my-5 rounded-[40px]`, {
                height: verticalScale(180),
              })}
            />
          ) : (
            <View style={tw.style(`my-5 rounded-[40px] bg-gray-200`, {
              height: verticalScale(180),
            })} />
          )}

          <TouchableOpacity
            onPress={showImagePickerWithOptions}
            disabled={selected === null}
            style={tw.style(
              `flex-row justify-center items-center px-12 border border-base-green rounded-[8px]`,
              currentIndex.step > 1 && `w-full`,
              selected === null && `opacity-0`,
              { height: verticalScale(40) }
            )}
          >
            <Text
              style={tw.style(`text-base-green text-base`, {
                fontFamily: "RobotoBold",
              })}
            >
              Retake Image
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </AuthForm>
  );
};

export default DriverInfo;
