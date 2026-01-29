import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather, Ionicons } from "@expo/vector-icons";
import { DELETE_EMERGENCY_CONTACT, GET_EMERGENCY_CONTACT } from "@/constants";
import React, { useContext, useEffect, useState } from "react";

import { AppContext } from "@/app/context";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

interface LProps {
  item: object;
  edit: () => void;
  remove: (id: string) => void;
}

function ListItem({ item, edit, remove }: Readonly<LProps>) {
  const verified = item?.status?.toLowerCase() === "verified";
  return (
    <View
      style={tw`flex-row justify-between items-center py-2 border-b border-[#EFEFEF]`}
    >
      <View style={tw`flex-row  items-center gap-x-2 basis-[45%]`}>
        <Image
          source={{
            uri: item?.image,
          }}
          style={tw`h-[42px] w-[42px] border border-zinc-300 rounded-full`}
        />

        <Text
          style={tw.style(`text-[15px] text-[#262628]`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {item?.name}
        </Text>
      </View>
      <View style={tw`basis-[35%]`}>
        <Text
          style={tw.style(`text-[15px] text-right text-base-green`, {
            fontFamily: "RobotoRegular",
          })}
        >
          +{item?.phone_number}
        </Text>
        <Text
          style={tw.style(
            `text-[12px] text-right`,
            verified ? `text-base-green` : `text-[#F47960]`,
            {
              fontFamily: "RobotoRegular",
            }
          )}
        >
          {verified ? `Verified` : `Unverified`}
        </Text>
      </View>
      <View style={tw`flex-row gap-x-2 items-center justify-end basis-[20%]`}>
        <TouchableOpacity
          onPress={() =>
            router.push({
              pathname: "/(profile)/createEmergencyContact",
              params: { type: "edit", person_id: item?.contact_id },
            })
          }
        >
          <Feather name="edit-3" size={24} color="black" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => remove(item?.contact_id)}>
          <Ionicons name="trash-outline" size={24} color="#F9111FF7" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SharedEmergencyList = () => {
  const [show, setShow] = useState(false);
  const [data, setData] = useState([]);
  const [Id, setId] = useState("");

  const { apiConfig } = useContext(AppContext);
  let isFocused = useIsFocused();
  const [loading, setLoading] = useState({});
  const [dloading, setDLoading] = useState(false);

  useEffect(() => {
    if (isFocused || (isFocused && show === false)) {
      setLoading(true);
      axios
        .get(GET_EMERGENCY_CONTACT, apiConfig)
        .then(({ data }) => {
          // console.log(data?.data);
          setData(Array.isArray(data?.data) ? data.data : []);
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
    axios
      .delete(DELETE_EMERGENCY_CONTACT + Id, apiConfig)
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
                pathname: "/(profile)/createEmergencyContact",
                params: { type: "new", person_id: "" },
              })
            }
            style={tw`bg-[#F9111F] p-4 absolute z-50 rounded-full bottom-4 right-4`}
          >
            <AntDesign name="plus" size={24} color="white" />
          </TouchableOpacity>
        )}
        <View style={tw.style(`bg-[#F9111F] mb-1 px-4 pt-14 pb-5`)}>
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
        {loading && <ActivityIndicator size="large" color="black" />}
        {!loading ? (
          data.length === 0 ? (
            <View
              style={tw`flex-col items-center gap-y-4 pt-24 px-4 absolute top-[20%] left-6 right-6 h-[500px] bg-white rounded-[20px]`}
            >
              <Text
                style={tw.style(`text-2xl text-center`, {
                  fontFamily: "RobotoBold",
                })}
              >
                No Emergency Contact Found
              </Text>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/(profile)/createEmergencyContact",
                    params: { type: "new", person_id: "" },
                  })
                }
                style={tw.style(`flex-row gap-x-2 items-center mb-8`)}
              >
                <Text
                  style={tw.style(`text-base text-base-error `, {
                    fontFamily: "RobotoBold",
                  })}
                >
                  Setup Emergency Contact
                </Text>
                <Feather
                  name="arrow-right"
                  size={16}
                  color={tw.color("text-base-error")}
                />
              </TouchableOpacity>
              <Image
                source={require("@/assets/images/emergency-not-found.png")}
                style={tw`self-center`}
              />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={tw`flex-col gap-y-6 pt-4 pb-20 px-2`}
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
            style={tw`flex-col justify-center items-center p-7 gap-y-5 h-[380px] bg-white rounded-[12px]`}
          >
            <Text
              style={tw.style(`text-2xl text-black text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Are you sure you want to delete contact
            </Text>

            <TouchableOpacity
              onPress={handleDelete}
              style={tw`self-start w-full mt-5 py-3.5 bg-[#F9111F] rounded-[8px]`}
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
              style={tw`self-start w-full -mt-2 py-3.5 border border-base-green rounded-[8px]`}
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
