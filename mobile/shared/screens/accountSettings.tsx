// Import Reanimated for BottomSheet compatibility
import "react-native-reanimated";

import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardTypeOptions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { City, Country, State } from "country-state-city";
import { NIGERIA_STATES, findNigeriaState } from "@/constants/nigeriaLocations";
import React, { useContext, useEffect, useState } from "react";

import { AppContext } from "@/app/context";
import { Dropdown } from "react-native-element-dropdown";
import apiClient from "@/utils/apiClient";
import { getApiUrlWithOverride } from "@/utils/apiUrlOverride";
import { router, useNavigation } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { KeyboardFormScrollView } from "@/components/KeyboardFormScrollView";
import useImagePicker from "@/hooks/useImagePicker";
import { formatPhoneForDisplay, normalisePhoneForStorage } from "@/utils/phoneFormat";
import { useIsFocused } from "@react-navigation/native";

interface IProps {
  placeholder: string;
  secure?: boolean;
  type?: KeyboardTypeOptions;
  onChangeText: (text: string) => void;
  value: string;
}

function InputItem({
  type = "default",
  placeholder = "",
  secure = false,
  onChangeText = () => {},
  value = "",
}: Readonly<IProps>) {
  const [show, setShow] = useState(secure);
  const isMaskedPassword = secure && show;
  return (
    <View style={tw`relative`}>
      <TextInput
        keyboardType={type}
        style={tw.style(
          `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
          {
            fontFamily:
              Platform.OS === "android" && isMaskedPassword
                ? "sans-serif-medium"
                : "RobotoMedium",
            color: "#262628",
          }
        )}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#D0D0D0"
        secureTextEntry={show}
      />
      {secure && (
        <Pressable
          onPress={() => setShow((prev) => !prev)}
          style={tw`absolute top-3.5 right-4`}
        >
          <Feather name={show ? "eye" : "eye-off"} size={16} color="#414141" />
        </Pressable>
      )}
    </View>
  );
}

interface SProps {
  placeholder: string;
  data: Array<{ label: string; value: string }>;
  onChange: (val: string) => void;
  value: string;
  search?: boolean;
  searchPlaceholder?: string;
}

const SelectItem = ({
  placeholder,
  data = [],
  onChange,
  value = "",
  search = false,
  searchPlaceholder,
}: SProps) => {
  return (
    <Dropdown
      style={tw.style(
        `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
        {
          fontFamily: "RobotoMedium",
        }
      )}
      mode="modal"
      data={data}
      value={value}
      placeholder={placeholder}
      search={search}
      searchPlaceholder={searchPlaceholder}
      inputSearchStyle={tw.style(`text-black text-sm rounded-[8px]`, {
        fontFamily: "RobotoMedium",
      })}
      maxHeight={300}
      labelField={"label"}
      valueField={"value"}
      itemTextStyle={tw.style(`text-black text-sm`, {
        fontFamily: "RobotoMedium",
      })}
      selectedTextStyle={tw.style(`text-black text-sm`, {
        fontFamily: "RobotoMedium",
      })}
      placeholderStyle={tw.style(`text-[#D0D0D0] text-[16px]`, {
        fontFamily: "RobotoMedium",
      })}
      containerStyle={tw.style(`text-black text-xs shadow-none border mt-1`)}
      onChange={(item) => {
        console.log(item?.value);
        onChange(item?.value);
      }}
    />
  );
};

interface IUpdateProfileModal {
  visible: boolean;
  onClose: () => void;
  user: IUser;
  apiConfig: object;
  apiConfigFormData: object;
  onUpdateComplete: (newImageUrl?: string) => void;
}

function UpdateProfileModal({
  visible,
  onClose,
  user,
  apiConfig,
  apiConfigFormData,
  onUpdateComplete,
}: Readonly<IUpdateProfileModal>) {
  const { showImagePicker, selectedImage, clearImage } = useImagePicker({
    filetype: "image",
  });

  const [updateState, setUpdateState] = useState({
    name: "",
    email: "",
    phone_number: "",
    gender: "",
    country: "",
    state: "",
    city: "",
    image_name: "",
  });
  const [loading, setLoading] = useState(false);
  const CountryIndex = Country.getAllCountries().find(
    (i) => i.name === updateState.country
  );
  // country-state-city has 424 "cities" for all of Nigeria (8 for Lagos), so the
  // home market uses the full 774-LGA list instead. Everywhere else it is the
  // only source we have.
  const isNigeria = CountryIndex?.isoCode === "NG";
  const nigeriaState = isNigeria
    ? findNigeriaState(updateState?.state)
    : undefined;
  const foreignStates =
    CountryIndex && !isNigeria
      ? State.getStatesOfCountry(CountryIndex.isoCode)
      : [];
  const foreignState = foreignStates.find(
    (i) => i.name === updateState?.state
  );

  const States: Array<{ name: string }> = isNigeria
    ? NIGERIA_STATES
    : CountryIndex === undefined
      ? [{ name: "Please Select a Country" }]
      : foreignStates;
  const Cities: Array<{ name: string }> = isNigeria
    ? (nigeriaState?.lgas ?? [{ name: "Please Select a state" }])
    : CountryIndex && foreignState
      ? City.getCitiesOfState(CountryIndex.isoCode, foreignState.isoCode)
      : [{ name: "Please Select a state" }];

  useEffect(() => {
    if (selectedImage !== null) {
      setUpdateState((prev) => ({ ...prev, image_name: selectedImage }));
      console.log(selectedImage);
    }
  }, [selectedImage]);

  useEffect(() => {
    if (user) {
      setUpdateState((prev) => ({
        ...prev,
        name: user?.name || "",
        email: user?.email || "",
        phone_number: formatPhoneForDisplay(user?.phone || ""),
        gender: user?.gender || "",
        country: user?.country || "",
        state: user?.state || "",
        city: user?.city || "",
        image_name: user?.image || "",
      }));
    }
  }, [user]);

  const handleUpdate = async () => {
    // Validate required fields
    if (!updateState.name || updateState.name.trim() === "") {
      showMessage({
        type: "warning",
        message: "Name is required",
      });
      return;
    }

    setLoading(true);

    try {
      // Only ever send a string URL for profileImage. image_name state may hold the picker object.
      const existingImageUrl = typeof updateState.image_name === "string" ? updateState.image_name : "";
      let imageUrl = existingImageUrl || user?.image || "";

      // Upload image first if a new image is selected
      if (selectedImage) {
        try {
          const imageData = new FormData();
          // Send as JPEG for compatibility (iOS often gives HEIC)
          const type = selectedImage.type === "image/heic" ? "image/jpeg" : (selectedImage.type || "image/jpeg");
          const name = (selectedImage.fileName || `profile_${Date.now()}.jpg`).replace(/\.heic$/i, ".jpg");
          imageData.append("image", {
            uri: selectedImage.uri,
            type,
            name,
          } as any);

          const uploadResponse = await apiClient.post(
            "user/profile/upload-image",
            imageData
          );

          if (uploadResponse?.data?.data?.image_url) {
            imageUrl = uploadResponse.data.data.image_url;
          }
        } catch (uploadErr: any) {
          console.log("Image upload error:", uploadErr?.response?.data);
          showMessage({
            type: "warning",
            message: uploadErr?.response?.data?.message || "Failed to upload image. Profile will be updated without image.",
          });
          // Keep previous URL; do not send the file object as profileImage
        }
      }

      // Update profile with text fields and image URL (only string URLs)
      const updateData: any = {
        name: updateState.name,
      };

      if (updateState.email) updateData.email = updateState.email;
      if (updateState.phone_number && updateState.phone_number.trim() !== '') {
        updateData.phone = normalisePhoneForStorage(updateState.phone_number.trim());
      }
      if (updateState.gender) updateData.gender = updateState.gender.toLowerCase();
      if (updateState.city) updateData.city = updateState.city;
      if (updateState.state) updateData.state = updateState.state;
      if (updateState.country) updateData.country = updateState.country;
      if (typeof imageUrl === "string" && imageUrl) updateData.profileImage = imageUrl;

      const { data } = await apiClient.patch("user/profile/update-details", updateData);

      showMessage({
        type: "success",
        message: data.message || "Profile updated successfully",
      });

      onClose();
      onUpdateComplete(typeof imageUrl === "string" ? imageUrl : undefined);
    } catch (err: any) {
      console.log("Update error:", err?.response?.data);
      if (err?.response?.data?.message) {
        const errorMessage = typeof err.response.data.message === 'string' 
          ? err.response.data.message 
          : String(err.response.data.message || 'An error occurred');
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      } else if (err?.response?.data?.error) {
        // Handle error object - extract message string
        const errorData = err.response.data.error;
        const errorMessage = typeof errorData === 'string' 
          ? errorData 
          : (errorData?.message || errorData?.name || 'Failed to update profile. Please try again.');
        showMessage({
          type: "danger",
          message: errorMessage,
        });
      } else {
        showMessage({
          type: "danger",
          message: "Failed to update profile. Please try again.",
        });
      }
    } finally {
      setLoading(false);
      clearImage();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={tw`flex-1 bg-white`}>
        <View
          style={tw.style(
            "flex-row items-center bg-[#F6F6F6] justify-between w-full py-3 px-4 border-b border-gray-200",
            { paddingTop: Platform.OS === "ios" ? 56 : 24 }
          )}
        >
          <Text
            style={tw.style("text-xl text-black flex-1 text-center", {
              fontFamily: "RobotoRegular",
            })}
          >
            Update Profile
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={tw`h-[34px] w-[34px] items-center justify-center bg-black rounded-full`}
          >
            <AntDesign name="close" size={20} color="white" />
          </TouchableOpacity>
        </View>
        <KeyboardFormScrollView
          style={tw`flex-1`}
          contentContainerStyle={tw`flex-col gap-y-5 px-4 pt-6`}
        >
            <View style={tw`w-full items-center mt-4 mb-1`}>
              <TouchableOpacity
                onPress={showImagePicker}
                style={[tw`flex-col items-center justify-center relative`, { overflow: "visible" }]}
              >
                <>
                  {(() => {
                    const raw = selectedImage?.uri ?? user?.image;
                    const uri = typeof raw === "string" ? raw.trim() : "";
                    return uri ? (
                      <Image
                        source={{ uri }}
                        style={tw`h-[88px] w-[88px] rounded-full`}
                      />
                    ) : (
                      <View style={tw`h-[88px] w-[88px] rounded-full bg-gray-200 items-center justify-center`}>
                        <Feather name="user" size={40} color="#9CA3AF" />
                      </View>
                    );
                  })()}
                  <View
                    style={tw.style(
                      "absolute bottom-1.5 right-1.5 h-9 w-9 rounded-full items-center justify-center",
                      { backgroundColor: tw.color("base-green") }
                    )}
                  >
                    <Feather
                      name="camera"
                      size={18}
                      color="white"
                    />
                  </View>
                </>
              </TouchableOpacity>
            </View>

            <InputItem
              value={updateState?.name}
              onChangeText={(name) =>
                setUpdateState((prev) => ({ ...prev, name }))
              }
              placeholder="Name"
            />

            <InputItem
              value={updateState?.email || ""}
              onChangeText={(email) =>
                setUpdateState((prev) => ({ ...prev, email }))
              }
              placeholder="Email (for account recovery & receipts)"
              type="email-address"
            />
            <InputItem
              value={updateState?.phone_number}
              onChangeText={(phone_number) =>
                setUpdateState((prev) => ({ ...prev, phone_number }))
              }
              placeholder="Phone no"
              type="number-pad"
            />
            {/* <InputItem placeholder="Bio" /> */}
            <SelectItem
              placeholder="Gender"
              value={updateState?.gender}
              onChange={(gender) =>
                setUpdateState((prev) => ({ ...prev, gender }))
              }
              data={[
                {
                  label: "Male",
                  value: "Male",
                },
                {
                  label: "Female",
                  value: "Female",
                },
              ]}
            />

            <SelectItem
              placeholder="Country"
              search
              searchPlaceholder="Search countries"
              value={updateState.country}
              // State and city belong to the old country — clear both.
              onChange={(country) =>
                setUpdateState((prev) => ({ ...prev, country, state: "", city: "" }))
              }
              data={Country.getAllCountries().map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />

            <SelectItem
              placeholder="State"
              search
              searchPlaceholder="Search states"
              value={isNigeria ? (nigeriaState?.name ?? "") : updateState?.state}
              onChange={(state) =>
                setUpdateState((prev) => ({ ...prev, state, city: "" }))
              }
              data={States.map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />
            <SelectItem
              placeholder="City"
              search
              searchPlaceholder="Search towns and cities"
              value={updateState?.city}
              onChange={(city) => setUpdateState((prev) => ({ ...prev, city }))}
              data={Cities.map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />
            <TouchableOpacity
              onPress={() => handleUpdate()}
              style={tw`bg-base-green py-3 mt-2 rounded-lg items-center justify-center`}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={tw.style("text-[17px] text-white text-center", {
                    fontFamily: "RobotoRegular",
                  })}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </KeyboardFormScrollView>
      </View>
    </Modal>
  );
}

interface IUser {
  name: string;
  email: string;
  phone: string;
  gender: string;
  country: string;
  state: string;
  city: string;
  image: string;
}

interface ISetupStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  action_required: string | null;
}

interface ISetupStatus {
  has_driver_profile: boolean;
  completeness_percent: number;
  verification_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  steps: ISetupStep[];
  action_message: string | null;
}

interface Props {
  type: "passenger" | "driver";
}

const SharedAccountSettings = ({ type }: Props) => {
  const navigation = useNavigation();
  const {
    LogoutUser,
    DeleteUser,
    apiConfig,
    apiConfigFormData,
    getCurrentUser,
  } = useContext(AppContext);
  const isFocused = useIsFocused();
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [user, setUser] = useState<IUser>({
    name: "",
    email: "",
    phone: "",
    gender: "",
    country: "",
    state: "",
    city: "",
    image: "",
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [setupStatus, setSetupStatus] = useState<ISetupStatus | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  const style = {
    container: tw`flex-row justify-between py-3.5 px-5`,
    shadow: tw.style(`bg-white`, { elevation: 6 }),
    line: tw`border-b border-[#EFEFF4]`,
    title: tw.style(`text-[15px] text-[#030303]`, {
      fontFamily: "RobotoRegular",
    }),
    text: tw.style(`text-[14px] text-[#C8C7CC]`, {
      fontFamily: "RobotoRegular",
    }),
  };

  const getUserProfile = () => {
    apiClient
      .get("user/profile/details")
      .then(({ data }) => {
        // Backend returns: { status: 'success', data: { user: {...}, driver: {...} } }
        const userData = data?.data?.user || data?.data;
        if (userData) {
          setUser({
            name: userData.name || "",
            email: userData.email || "",
            phone: userData.phone || "",
            gender: userData.gender || "",
            country: userData.country || "",
            state: userData.state || "",
            city: userData.city || "",
            image: userData.image || "",
          });
        }
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
      });
  };

  const fetchSetupStatus = () => {
    if (type !== "driver") return;
    setSetupLoading(true);
    apiClient
      .get("driver/setup-status")
      .then(({ data }) => {
        setSetupStatus(data?.data ?? null);
      })
      .catch(() => setSetupStatus(null))
      .finally(() => setSetupLoading(false));
  };

  useEffect(() => {
    if (isFocused) {
      getUserProfile();
      if (type === "driver") fetchSetupStatus();
    }
  }, [isFocused, type]);

  const handleDelete = () => {
    Alert.alert(
      "Delete Account",
      "You are about to permanently delete your account. All your data will be erased and this action cannot be undone. Do you wish to proceed?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Confirm",
          onPress: () => DeleteUser(setDeleting),
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("Log out?", "", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Confirm",
        onPress: () => LogoutUser(setLoading),
      },
    ]);
  };

  return (
    <>
      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
          <View style={tw`flex-row items-center justify-between w-[75%]`}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={tw`bg-black p-1 rounded-full`}
            >
              <AntDesign name="left" size={24} color="white" />
            </TouchableOpacity>
            <Text
              style={tw.style(`text-white text-2xl`, {
                fontFamily: "RobotoBold",
              })}
            >
              Account Settings
            </Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={tw`flex-col gap-y-6 pt-4 pb-8 px-6`}>
          {type === "driver" && (
            <View style={{ ...style.shadow }}>
              <View style={{ ...style.container, ...style.line }}>
                <Text style={tw.style("text-[15px] text-[#030303]", { fontFamily: "RobotoBold" })}>
                  Driver account setup
                </Text>
                {setupLoading ? (
                  <ActivityIndicator size="small" color={tw.color("base-green")} />
                ) : (
                  <Text style={style.text}>
                    {setupStatus?.completeness_percent ?? 0}%
                  </Text>
                )}
              </View>
              <View style={tw`px-5 pb-3`}>
                <View style={tw`h-1.5 bg-[#EFEFF4] rounded-full overflow-hidden`}>
                  <View
                    style={[
                      tw`h-full rounded-full bg-base-green`,
                      { width: `${Math.min(setupStatus?.completeness_percent ?? 0, 100)}%` },
                    ]}
                  />
                </View>
                {setupStatus?.verification_status && (
                  <View style={tw`flex-row items-center mt-3`}>
                    <View
                      style={tw.style(
                        "px-2.5 py-1 rounded-full",
                        setupStatus.verification_status === "approved" && "bg-base-green",
                        setupStatus.verification_status === "pending" && "bg-[#EFEFF4]",
                        setupStatus.verification_status === "rejected" && "bg-[#FEE2E2]"
                      )}
                    >
                      <Text
                        style={tw.style(
                          "text-xs",
                          { fontFamily: "RobotoMedium" },
                          setupStatus.verification_status === "approved" && "text-white",
                          setupStatus.verification_status === "pending" && "text-[#030303]",
                          setupStatus.verification_status === "rejected" && "text-[#991B1B]"
                        )}
                      >
                        {setupStatus.verification_status === "approved"
                          ? "Approved"
                          : setupStatus.verification_status === "pending"
                            ? "Pending review"
                            : "Not approved"}
                      </Text>
                    </View>
                  </View>
                )}
                {setupStatus?.rejection_reason && (
                  <View style={tw`mt-3 p-3 bg-[#FEF2F2] rounded-lg border border-[#EFEFF4]`}>
                    <Text style={tw.style("text-xs text-[#991B1B] mb-1", { fontFamily: "RobotoMedium" })}>
                      Reason not approved
                    </Text>
                    <Text style={tw.style("text-[14px] text-[#030303]", { fontFamily: "RobotoRegular" })}>
                      {setupStatus.rejection_reason}
                    </Text>
                    {setupStatus.action_message && (
                      <Text style={tw.style("text-xs text-[#C8C7CC] mt-2", { fontFamily: "RobotoRegular" })}>
                        {setupStatus.action_message}
                      </Text>
                    )}
                  </View>
                )}
                {setupStatus?.action_message && !setupStatus?.rejection_reason && (
                  <Text style={[tw.style("text-[14px] mt-2", { fontFamily: "RobotoRegular" }), { color: "#C8C7CC" }]}>
                    {setupStatus.action_message}
                  </Text>
                )}
              </View>
              {setupStatus?.steps && setupStatus.steps.length > 0 && (
                <>
                  {setupStatus.steps.map((step, index) => (
                    <View
                      key={step.id}
                      style={tw.style(
                        "flex-row items-start gap-x-3 py-3.5 px-5",
                        index < setupStatus.steps.length - 1 && "border-b border-[#EFEFF4]"
                      )}
                    >
                      <View
                        style={tw.style(
                          "w-6 h-6 rounded-full items-center justify-center mt-0.5",
                          step.completed ? "bg-base-green" : "bg-[#EFEFF4]"
                        )}
                      >
                        {step.completed ? (
                          <AntDesign name="check" size={14} color="white" />
                        ) : (
                          <MaterialCommunityIcons name="circle-outline" size={14} color="#9CA3AF" />
                        )}
                      </View>
                      <View style={tw`flex-1`}>
                        <Text style={style.title}>
                          {step.label}
                        </Text>
                        <Text style={tw.style("text-[12px] mt-0.5", { fontFamily: "RobotoRegular", color: "#9CA3AF" })}>
                          {step.description}
                        </Text>
                        {step.action_required && (
                          <Text style={tw.style("text-[12px] mt-1", { fontFamily: "RobotoRegular", color: "#6B7280" })}>
                            {step.action_required}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}
              <View style={tw`px-5 pb-5 pt-2`}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    // Navigate directly to the first incomplete setup step instead of
                    // always starting the wizard from page 1.
                    const steps = setupStatus?.steps ?? [];
                    const firstIncomplete = steps.find((s) => !s.completed);
                    if (!firstIncomplete) {
                      // Everything complete — open the full form to let the driver edit
                      router.navigate("/driverinfo");
                      return;
                    }
                    const stepToIndex: Record<string, string> = {
                      license: "3",        // driver license image upload
                      vehicle_details: "0", // personal info + vehicle details
                      vehicle_images: "6",  // vehicle photos
                    };
                    if (firstIncomplete.id === "bank_account") {
                      // Bank account is managed in Daily Activities
                      router.navigate("/(driver)/dailyActivities");
                      return;
                    }
                    const idx = stepToIndex[firstIncomplete.id] ?? "0";
                    router.navigate(`/driverinfo?initialIndex=${idx}` as any);
                  }}
                  style={tw`bg-base-green py-3.5 rounded-lg items-center justify-center`}
                >
                  <Text
                    style={tw.style("text-[17px] text-white text-center", {
                      fontFamily: "RobotoRegular",
                    })}
                  >
                    Complete setup
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={tw`flex-col items-center`}>
            {user?.image && String(user.image).trim() ? (
              <Image
                source={{
                  uri: (() => {
                    const raw = String(user.image).trim();
                    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
                    const base = getApiUrlWithOverride().replace(/\/$/, "");
                    return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
                  })(),
                }}
                style={tw`h-[87px] w-[87px] rounded-full border border-zinc-200`}
              />
            ) : (
              <View
                style={tw`h-[87px] w-[87px] rounded-full border border-zinc-200 bg-gray-200 flex-col items-center justify-center`}
              >
                <Feather name="user" size={40} color="#9CA3AF" />
              </View>
            )}
            <Text
              style={tw.style(`text-[24px] text-black my-1`, {
                fontFamily: "RobotoBold",
              })}
            >
              {user?.name || "User"}
            </Text>
            {/* <Text
              style={tw.style(`text-[12px] text-[#030303]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              No1 Lorem ipsum dolor sit amet, consectetur adipiscing{" "}
            </Text> */}
          </View>

          <View style={{ ...style.shadow }}>
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>Name</Text>
              <Text style={style.text}>{user?.name || "Not set"}</Text>
            </View>
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>Email</Text>
              <Text style={style.text}>{user?.email || "Not set"}</Text>
            </View>
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>Gender</Text>
              <Text style={style.text}>{user?.gender || "Not set"}</Text>
            </View>
            {/* <Pressable style={{ ...style.container, ...style.line }}>
              <Text
                style={{
                  ...style.title,
                  color: tw.color(`base-green`),
                  fontWeight: 800,
                }}
              >
                KYC
              </Text>
            </Pressable> */}
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>Phone number</Text>
              <Text style={style.text}>{formatPhoneForDisplay(user?.phone || "") || "Not set"}</Text>
            </View>
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>City</Text>
              <Text style={style.text}>{user?.city || "Not set"}</Text>
            </View>
            <View style={{ ...style.container, ...style.line }}>
              <Text style={style.title}>State</Text>
              <Text style={style.text}>{user?.state || "Not set"}</Text>
            </View>
            <View style={{ ...style.container }}>
              <Text style={style.title}>Country</Text>
              <Text style={style.text}>{user?.country || "Not set"}</Text>
            </View>
          </View>

          <Pressable
            onPress={() => setShowUpdateModal(true)}
            style={tw`bg-base-green py-3.5 rounded-lg items-center justify-center`}
          >
            <Text
              style={tw.style(`text-[17px] text-white text-center`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Edit Details
            </Text>
          </Pressable>

          <Pressable onPress={handleLogout} style={tw`self-center  `}>
            {loading ? (
              <ActivityIndicator color={tw.color("text-base-green")} />
            ) : (
              <Text
                style={tw.style(`text-[17px] text-base-green text-center`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                Log out
              </Text>
            )}
          </Pressable>

          <TouchableOpacity
            onPress={handleDelete}
            style={{ ...style.container, ...style.shadow }}
          >
            {deleting ? (
              <ActivityIndicator color={tw.color("text-base-green")} />
            ) : (
              <Text style={{ ...style.title, color: "#F31717" }}>
                Delete account
              </Text>
            )}
            <AntDesign name="right" size={14} color="#00000040" />
          </TouchableOpacity>
        </ScrollView>
      </ImageBackground>
      <UpdateProfileModal
        visible={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        user={user}
        apiConfig={apiConfig}
        apiConfigFormData={apiConfigFormData}
        onUpdateComplete={(newImageUrl) => {
          if (newImageUrl !== undefined && newImageUrl) {
            setUser((prev) => ({ ...prev, image: newImageUrl }));
          }
          getUserProfile();
          getCurrentUser();
        }}
      />
    </>
  );
};

export default SharedAccountSettings;
