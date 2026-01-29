// Import Reanimated for BottomSheet compatibility
import "react-native-reanimated";

import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardTypeOptions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetTextInput,
  BottomSheetView,
  WINDOW_HEIGHT,
} from "@gorhom/bottom-sheet";
import { CHANGE_PASSWORD, PROFILE, PROFILE_UPDATE, SERVER_URL } from "@/constants";
import { City, Country, State } from "country-state-city";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AppContext } from "@/app/context";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Dropdown } from "react-native-element-dropdown";
import { ScrollView as GHScrollView } from "react-native-gesture-handler";
import { Portal } from "@gorhom/portal";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import useImagePicker from "@/hooks/useImagePicker";
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
  return (
    <View style={tw`relative`}>
      <BottomSheetTextInput
        keyboardType={type}
        style={tw.style(
          `text-[16px] text-black px-5 h-[45px] border border-[#B8B8B8] rounded-[8px]`,
          {
            fontFamily: "RobotoMedium",
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
}

const SelectItem = ({
  placeholder,
  data = [],
  onChange,
  value = "",
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

interface IPBSheet {
  user: IUser;
  apiConfig: object;
  apiConfigFormData: object;
  onUpdateComplete: () => void;
  isPassword: boolean;
  renderBackdrop: (props: BottomSheetBackdropProps) => React.JSX.Element;
  bottomSheetRef: React.RefObject<BottomSheetMethods>;
}

function PortalBottomSheet({
  user,
  apiConfig,
  bottomSheetRef,
  renderBackdrop,
  isPassword,
  apiConfigFormData,
  onUpdateComplete,
}: Readonly<IPBSheet>) {
  const { showImagePicker, selectedImage, clearImage } = useImagePicker({
    filetype: "image",
  });

  const [passwordState, setPasswordState] = useState({
    old_password: "",
    new_password: "",
    new_password_confirmation: "",
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
  const States =
    CountryIndex === undefined
      ? [{ name: "Please Select a Country" }]
      : State.getStatesOfCountry(CountryIndex?.isoCode);
  const StateIndex = States.find((i) => i.name === updateState?.state);
  const Cities =
    StateIndex === undefined
      ? [{ name: "Please Select a state" }]
      : City.getCitiesOfState("NG", StateIndex?.isoCode);

  const handleSubmit = () => {
    if (passwordState.old_password === passwordState.new_password)
      return showMessage({
        type: "warning",
        message: "Old Password cannot be new password",
      });

    if (passwordState.new_password !== passwordState.new_password_confirmation)
      return showMessage({
        type: "warning",
        message: "Passwords do not match",
      });

    setLoading(true);
    axios
      .post(CHANGE_PASSWORD, passwordState, apiConfig)
      .then(({ data }) => {
        console.log(data, "done");
        showMessage({
          type: "success",
          message: data.message,
        });

        bottomSheetRef?.current?.close();
      })
      .catch((err) => {
        console.log(err?.response?.data, "error");
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
        if (err?.response?.data?.error) {
          // Handle error object - extract message string
          const errorData = err.response.data.error;
          const errorMessage = typeof errorData === 'string' 
            ? errorData 
            : (errorData?.message || errorData?.name || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        }
      })
      .finally(() => setLoading(false));
  };

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
        phone_number: user?.phone || "",
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
      let imageUrl = updateState.image_name || user?.image || "";

      // Upload image first if a new image is selected
      if (selectedImage) {
        try {
          const imageData = new FormData();
          imageData.append("image", {
            uri: selectedImage.uri,
            type: selectedImage.type || "image/jpeg",
            name: selectedImage.fileName || `profile_${Date.now()}.jpg`,
          } as any);

          const uploadResponse = await axios.post(
            `${SERVER_URL}user/profile/upload-image`,
            imageData,
            apiConfigFormData
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
          // Continue with profile update even if image upload fails
        }
      }

      // Update profile with text fields and image URL
      const updateData: any = {
        name: updateState.name,
      };

      if (updateState.email) updateData.email = updateState.email;
      if (updateState.phone_number && updateState.phone_number.trim() !== '') {
        updateData.phone = updateState.phone_number.trim();
      }
      if (updateState.gender) updateData.gender = updateState.gender.toLowerCase();
      if (updateState.city) updateData.city = updateState.city;
      if (updateState.state) updateData.state = updateState.state;
      if (updateState.country) updateData.country = updateState.country;
      if (imageUrl) updateData.profileImage = imageUrl;

      const { data } = await axios.patch(PROFILE_UPDATE, updateData, apiConfig);

      showMessage({
        type: "success",
        message: data.message || "Profile updated successfully",
      });

      bottomSheetRef?.current?.close();
      onUpdateComplete();
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
    <BottomSheet
      index={-1}
      snapPoints={["50%", "90%"]}
      ref={bottomSheetRef}
      backdropComponent={renderBackdrop}
      handleComponent={() => (
        <BottomSheetView
          style={tw.style(
            `flex-row items-center bg-[#F6F6F6] justify-between w-[99%] mt-5 py-3 px-4 rounded-t-[16px]`,
            {
              elevation: 5,
            }
          )}
        >
          <Text
            style={tw.style(`text-xl text-black text-center basis-[90%]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {isPassword ? "Change Password" : "Update Profile"}
          </Text>
          <TouchableOpacity
            onPress={() => bottomSheetRef?.current?.close()}
            style={tw`h-[34px] w-[34px] flex-col items-center justify-center bg-black p-1 rounded-full`}
          >
            <AntDesign name="close" size={20} color="white" />
          </TouchableOpacity>
        </BottomSheetView>
      )}
      style={tw`px-4 flex-1 rounded-t-[40px] border`} //   enablePanDownToClose
    >
      <BottomSheetView
        style={tw.style(`flex-col gap-y-5 mt-8 `, {
          height: WINDOW_HEIGHT * 0.75,
        })}
      >
        {isPassword ? (
          <>
            <InputItem
              value={passwordState?.old_password}
              onChangeText={(old_password) =>
                setPasswordState((prev) => ({ ...prev, old_password }))
              }
              placeholder="Old Password"
            />
            <InputItem
              value={passwordState?.new_password}
              onChangeText={(new_password) =>
                setPasswordState((prev) => ({ ...prev, new_password }))
              }
              secure
              placeholder="New Password"
            />
            <InputItem
              value={passwordState?.new_password_confirmation}
              onChangeText={(new_password_confirmation) =>
                setPasswordState((prev) => ({
                  ...prev,
                  new_password_confirmation,
                }))
              }
              secure
              placeholder="Re-password"
            />
          </>
        ) : (
          <GHScrollView contentContainerStyle={tw`flex-col gap-y-5 pb-4`}>
            <TouchableOpacity
              onPress={showImagePicker}
              style={tw`flex-col items-center self-center relative`}
            >
              <Image
                source={{
                  uri: selectedImage?.uri ?? user?.image,
                }}
                style={tw`h-[87px] w-[87px] rounded-full`}
              />
              <Feather
                name="edit"
                size={20}
                style={tw`absolute bottom-0 right-0`}
                color={tw.color("base-green")}
              />
            </TouchableOpacity>

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
              placeholder="Email (Required for DVA account)"
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
              value={updateState.country}
              onChange={(country) =>
                setUpdateState((prev) => ({ ...prev, country }))
              }
              data={Country.getAllCountries().map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />

            <SelectItem
              placeholder="State"
              value={updateState?.state}
              onChange={(state) =>
                setUpdateState((prev) => ({ ...prev, state }))
              }
              data={States.map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />
            <SelectItem
              placeholder="City"
              value={updateState?.city}
              onChange={(city) => setUpdateState((prev) => ({ ...prev, city }))}
              data={Cities.map(({ name }) => ({
                label: name,
                value: name,
              }))}
            />
          </GHScrollView>
        )}

        <TouchableOpacity
          onPress={() => (isPassword ? handleSubmit() : handleUpdate())}
          style={tw.style(`bg-base-green py-3`, isPassword ? " mt-4" : "mt-0")}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              style={tw.style(`text-[17px] text-white text-center`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Save
            </Text>
          )}
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
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

interface Props {
  type: "passenger" | "driver";
}

const SharedAccountSettings = ({ type }: Props) => {
  const {
    LogoutUser,
    DeleteUser,
    apiConfig,
    apiConfigFormData,
    getCurrentUser,
  } = useContext(AppContext);
  let isFocused = useIsFocused();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [isPassword, setIsPassword] = useState(true);
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

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        style={[
          { backgroundColor: "#1919194D" },
          StyleSheet.absoluteFillObject,
        ]}
      />
    ),
    []
  );

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

  useEffect(() => {
    if (isFocused) {
      // Listener for when the keyboard is hidden
      const keyboardHideListener = Keyboard.addListener(
        "keyboardDidHide",
        () => {
          // Do something here when the keyboard is closed
          if (isPassword) {
            bottomSheetRef?.current?.snapToPosition("50%");
          } else {
            bottomSheetRef?.current?.snapToPosition("90%");
          }
        }
      );

      // Cleanup the listener on component unmount
      return () => {
        keyboardHideListener.remove();
      };
    }
  }, [isPassword, isFocused]);

  const getUserProfile = () => {
    axios
      .get(PROFILE, apiConfig)
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

  useEffect(() => {
    if (isFocused) {
      getUserProfile();
    }
  }, [isFocused]);

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
          <View style={tw`flex-col items-center`}>
            {user?.image ? (
              <Image
                source={{
                  uri: user.image,
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
              <Text style={style.text}>{user?.phone || "Not set"}</Text>
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
            onPress={() => {
              setIsPassword(true);
              bottomSheetRef?.current?.snapToIndex(0);
            }}
            style={{ ...style.container, ...style.shadow }}
          >
            <Text style={style.title}>Change Password</Text>
            <AntDesign name="right" size={14} color="#00000040" />
          </Pressable>

          <Pressable
            onPress={() => {
              setIsPassword(false);
              bottomSheetRef?.current?.snapToPosition("90%");
            }}
            style={tw`bg-base-green py-3.5`}
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
      <Portal>
        <PortalBottomSheet
          bottomSheetRef={bottomSheetRef}
          isPassword={isPassword}
          user={user}
          renderBackdrop={renderBackdrop}
          apiConfig={apiConfig}
          apiConfigFormData={apiConfigFormData}
          onUpdateComplete={() => {
            getUserProfile();
            getCurrentUser();
          }}
        />
      </Portal>
    </>
  );
};

export default SharedAccountSettings;
