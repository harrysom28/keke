import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather, Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import apiClient from "@/utils/apiClient";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  item: object;
  edit: () => void;
  remove: (id: string) => void;
}

// Format phone for display: 07080951858 → 0708 095 1858, +2347080951858 → +234 708 095 1858
function formatPhoneDisplay(phone: string | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10 && !digits.startsWith("0")) {
    return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return phone;
}

function ListItem({ item, edit, remove }: Readonly<LProps>) {
  const phone = item?.phone_number ?? item?.phone ?? "";
  return (
    <View
      style={[
        tw`flex-row justify-between items-center p-4 rounded-2xl bg-white`,
        Platform.OS === "ios"
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
            }
          : { elevation: 4 },
      ]}
    >
      <View style={tw`flex-row items-center gap-x-3 flex-1 min-w-0`}>
        <View style={tw`w-12 h-12 rounded-full bg-[#F5F5F5] items-center justify-center overflow-hidden`}>
          {item?.image ? (
            <Image
              source={{ uri: item?.image }}
              style={tw`w-12 h-12 rounded-full`}
            />
          ) : (
            <Ionicons name="person" size={24} color="#999" />
          )}
        </View>
        <View style={tw`flex-1 min-w-0`}>
          <Text
            style={tw.style(`text-[16px] text-[#1a1a1a]`, {
              fontFamily: "RobotoMedium",
            })}
            numberOfLines={1}
          >
            {item?.name}
          </Text>
          <Text
            style={tw.style(`text-[14px] text-[#666]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {formatPhoneDisplay(phone)}
          </Text>
        </View>
      </View>
      <View style={tw`flex-row gap-x-1 items-center ml-2`}>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "createEmergencyContact",
              params: { type: "edit", person_id: item?.contact_id },
            })
          }
          style={tw`p-2`}
        >
          <Feather name="edit-3" size={20} color="#3C8F7C" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => remove(item?.contact_id)}
          style={tw`p-2`}
        >
          <Ionicons name="trash-outline" size={20} color="#F9111F" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SharedEmergencyList = () => {
  const [show, setShow] = useState(false);
  const [data, setData] = useState([]);
  const [Id, setId] = useState("");

  let isFocused = useIsFocused();
  const [loading, setLoading] = useState({});
  const [dloading, setDLoading] = useState(false);

  useEffect(() => {
    if (isFocused || (isFocused && show === false)) {
      setLoading(true);
      apiClient
        .get("emergency/contact")
        .then(({ data }) => {
          const contacts = data?.data?.emergency_contacts ?? data?.data;
          const list = Array.isArray(contacts) ? contacts : [];
          setData(list.map((c: any) => ({
            ...c,
            phone_number: c.phone_number ?? c.phone,
            contact_id: c.contact_id ?? c._id,
          })));
        })
        .catch((err) => {
          console.log(err?.response?.data);
          if (err?.response?.data?.message) {
            showMessage({
              type: "danger",
              message: err?.response?.data.message,
            });
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused, show]);

  const handleDelete = () => {
    setDLoading(true);
      apiClient
      .delete(`emergency/contact/delete/${Id}`)
      .then(({ data }) => {
        showMessage({
          type: "success",
          message: data.message,
        });
        setShow(false);
      })
      .catch((err) => {
        console.log(err?.response?.data);
        if (err?.response?.data?.message) {
          showMessage({
            type: "warning",
            message: err?.response?.data.message,
          });
        }
      })
      .finally(() => setDLoading(false));
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
        {data.length > 0 && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: "createEmergencyContact",
                params: { type: "new", person_id: "" },
              })
            }
            style={[
              tw`bg-base-error p-4 absolute z-50 rounded-full bottom-6 right-5`,
              Platform.OS === "ios"
                ? {
                    shadowColor: "#F9111F",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.35,
                    shadowRadius: 8,
                  }
                : { elevation: 8 },
            ]}
          >
            <AntDesign name="plus" size={26} color="white" />
          </TouchableOpacity>
        )}
        <View style={tw.style(`bg-base-error mb-1 px-4 pt-14 pb-5`)}>
          <View style={tw`flex-row items-center justify-between w-[80%]`}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={tw`bg-white p-1 rounded-full`}
            >
              <AntDesign name="left" size={24} color="black" />
            </TouchableOpacity>
            <Text
              style={tw.style(`text-white text-2xl`, {
                fontFamily: "RobotoBold",
              })}
            >
              Emergency Contact
            </Text>
          </View>
        </View>
        {loading && (
          <View style={tw`flex-1 justify-center items-center`}>
            <ActivityIndicator size="large" color="#F9111F" />
          </View>
        )}
        {!loading ? (
          data.length === 0 ? (
            <ScrollView
              contentContainerStyle={tw`flex-1 justify-center px-6 py-8`}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  tw`flex-col items-center px-6 py-10 rounded-3xl bg-white`,
                  Platform.OS === "ios"
                    ? {
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.08,
                        shadowRadius: 16,
                      }
                    : { elevation: 8 },
                ]}
              >
                <View
                  style={tw`w-20 h-20 rounded-full bg-base-error/10 items-center justify-center mb-5`}
                >
                  <Ionicons
                    name="person-add-outline"
                    size={40}
                    color="#F9111F"
                  />
                </View>
                <Text
                  style={tw.style(`text-xl text-[#1a1a1a] text-center mb-2`, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  No Emergency Contact Yet
                </Text>
                <Text
                  style={tw.style(
                    `text-[15px] text-[#666] text-center mb-8 leading-5`,
                    { fontFamily: "RobotoRegular" }
                  )}
                >
                  Add a trusted contact to notify quickly in case of emergency during rides
                </Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "createEmergencyContact",
                      params: { type: "new", person_id: "" },
                    })
                  }
                  style={tw`flex-row items-center justify-center gap-2 bg-base-error py-4 px-8 rounded-xl w-full`}
                  activeOpacity={0.85}
                >
                  <Feather name="plus" size={20} color="white" />
                  <Text
                    style={tw.style(`text-base text-white`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    Add Emergency Contact
                  </Text>
                </TouchableOpacity>
                <Image
                  source={require("@/assets/images/emergency-not-found.png")}
                  style={tw`mt-8 w-44 h-32`}
                  resizeMode="contain"
                />
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={tw`flex-col gap-y-4 pt-4 pb-24 px-4`}
            >
              {Array.isArray(data) && data.map((item, idx) => (
                <ListItem
                  key={idx + 1}
                  item={item}
                  index={idx}
                  remove={(idx) => {
                    setId(idx);
                    setShow(true);
                  }}
                />
              ))}
            </ScrollView>
          )
        ) : null}
      </ImageBackground>

      <Modal
        visible={show}
        transparent
        onRequestClose={() => setShow(false)}
        animationType="slide"
        style={tw`flex-1`}
      >
        <StatusBar barStyle="light-content" backgroundColor="#1919194D" />

        <View
          style={tw`flex-1 relative flex-col justify-center px-3.5 bg-[#1919194D]`}
        >
          <View
            style={tw`flex-col justify-center items-center p-7 gap-y-5 min-h-[320px] bg-white rounded-2xl mx-4`}
          >
            <Text
              style={tw.style(`text-xl text-[#1a1a1a] text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Are you sure you want to delete this contact?
            </Text>

            <TouchableOpacity
              onPress={handleDelete}
              style={tw`w-full mt-4 py-3.5 bg-base-error rounded-xl`}
            >
              {dloading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={tw.style(`text-base text-center text-white`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Delete contact
                </Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShow(false)}
              style={tw`w-full py-3.5 border border-base-green rounded-xl`}
            >
              <Text
                style={tw.style(`text-base text-center text-base-green`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

export default SharedEmergencyList;
