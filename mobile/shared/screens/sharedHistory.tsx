import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Feather } from "@expo/vector-icons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Defs, G, Path, Rect, Svg } from "react-native-svg";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { LIGHT_MAP_STYLE } from "@/constants/mapStyle";
import { Platform } from "react-native";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AppContext } from "@/app/context";
import EmptyData from "@/components/emptyData";
import { GET_HISTORY } from "@/constants";
import CustomMapDirections from "@/components/activeRide/CustomMapDirections";
import { Portal } from "@gorhom/portal";
import axios from "axios";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";

const mapDelta = { latitudeDelta: 0.05, longitudeDelta: 0.05 };

interface LProps {
  item: object;
  action: () => void;
}

function ListItem({ item, action }: Readonly<LProps>) {
  return (
    <TouchableOpacity
      onPress={action}
      style={tw.style(`my-2 bg-white py-4 rounded`, { elevation: 5 })}
    >
      <View style={tw`px-4 pb-1 mb-2,5 border-b border-[#EFEFF4]`}>
        <View style={tw`flex-row gap-x-4 items-center`}>
          <Svg width={23} height={75} viewBox="0 0 23 73" fill="none">
            <Path
              d="M11.4254 17.5479V48.1351"
              stroke="#C8C7CC"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 4"
            />
            <Path
              d="M21.6883 10.5479C21.6883 15.7296 17.1606 20.0479 11.4252 20.0479C5.68981 20.0479 1.16211 15.7296 1.16211 10.5479C1.16211 5.36606 5.68981 1.04785 11.4252 1.04785C17.1606 1.04785 21.6883 5.36606 21.6883 10.5479Z"
              fill="white"
              stroke="#3C8F7C"
              strokeWidth={2}
            />
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.1569 15.5479C14.2671 15.5479 16.7885 13.1973 16.7885 10.2979C16.7885 7.39836 14.2671 5.04785 11.1569 5.04785C8.04672 5.04785 5.52539 7.39836 5.52539 10.2979C5.52539 13.1973 8.04672 15.5479 11.1569 15.5479Z"
              fill="#3C8F7C"
            />
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M11.1665 72.214C12.1743 72.214 16.9733 66.5956 18.1567 64.8059C19.9757 62.0548 21.0987 60.4272 21.0987 57.3901C21.0987 52.2764 16.6519 48.1309 11.1665 48.1309C5.68116 48.1309 1.23438 52.2764 1.23438 57.3901C1.23438 60.443 2.27499 62.0597 4.08793 64.8059C5.35152 66.7199 10.1588 72.214 11.1665 72.214ZM11.1658 62.0198C13.9085 62.0198 16.1319 59.947 16.1319 57.3901C16.1319 54.8333 13.9085 52.7605 11.1658 52.7605C8.42308 52.7605 6.19968 54.8333 6.19968 57.3901C6.19968 59.947 8.42308 62.0198 11.1658 62.0198Z"
              fill="black"
              fillOpacity={0.9}
            />
          </Svg>
          <View style={tw`flex-col h-[75px] justify-between w-[90%]`}>
            <Text
              style={tw.style(`text-[17px] text-[#242E42]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {item?.pickup?.name}
            </Text>
            <Text
              style={tw.style(`text-[17px] text-[#242E42]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={2}
            >
              {item?.destination?.name}
            </Text>
          </View>
        </View>
        <Text
          style={tw.style(`text-right text-[10px] text-[#414141] mt-1`, {
            fontFamily: "RobotoRegular",
          })}
        >
          {item?.date}
        </Text>
      </View>

      <View style={tw`flex-row items-center justify-between px-4`}>
        <Text
          style={tw.style(`text-[17px] text-[#242E42]`, {
            fontFamily: "RobotoBold",
          })}
        >
          ₦ {item?.cost}
        </Text>
        <View style={tw`flex-row items-center gap-x-1`}>
          <Text
            style={tw.style(
              `text-[15px] text-[#C8C7CC]`,
              item?.status === Tabs[1] && `text-[#03DE73]`,
              item?.status === Tabs[0] && `text-black`,
              {
                // color: item?.status === Tabs[1] ? `#03DE73` : `#C8C7CC`,
                fontFamily: "RobotoRegular",
              }
            )}
          >
            {item?.status}
          </Text>
          <AntDesign
            name="right"
            size={14}
            style={tw`bg-black`}
            color="white"
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const Tabs: string[] = ["Active", "Completed", "Cancelled"];


const SharedHistory = () => {
  const { apiConfig } = useContext(AppContext);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [selected, setSelected] = useState(Tabs[0]);
  const [data, setData] = useState([]);
  const [current, setCurrent] = useState({});
  const [loading, setLoading] = useState(false);
  const [maps, setMaps] = useState({
    origin: { latitude: 0, longitude: 0 },
    destination: { latitude: 1, longitude: 1 },
  });
  const mapRef = useRef<MapView>();
  let isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      setLoading(true);
      
      // Map tab names to status values for backend query
      const statusMap: { [key: string]: string | undefined } = {
        'Active': undefined, // No status filter - get all non-completed/cancelled rides
        'Completed': 'completed',
        'Cancelled': 'cancelled',
      };
      
      const status = statusMap[selected];
      const params: any = { limit: 50 };
      if (status) {
        params.status = status;
      }
      
      axios
        .get(GET_HISTORY, { ...apiConfig, params })
        .then(({ data }) => {
          // Backend returns { data: { rides: [...], pagination: {...} } }
          const rides = data?.data?.rides || data?.data || [];
          
          // For "Active" tab, filter out completed and cancelled rides on frontend
          let filteredRides = rides;
          if (selected === 'Active') {
            filteredRides = rides.filter((ride: any) => 
              ride.status !== 'completed' && ride.status !== 'cancelled'
            );
          }
          
          setData(filteredRides);
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
  }, [isFocused, selected]);

  // Don't set default region - will be set when showing a ride
  const [mapRegion, setmapRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  const showModal = (item) => {
    setCurrent(item);
    bottomSheetRef?.current?.expand();
    
    // Only set map region if we have valid coordinates
    const pickupLat = parseFloat(item?.pickup?.lat);
    const pickupLng = parseFloat(item?.pickup?.long);
    
    if (pickupLat && pickupLng && !isNaN(pickupLat) && !isNaN(pickupLng) && 
        pickupLat !== 0 && pickupLng !== 0) {
      let m = {
        latitude: pickupLat,
        longitude: pickupLng,
        ...mapDelta,
      };
      setmapRegion(m);
      mapRef.current?.animateToRegion(m);
      setMaps({
        origin: {
          latitude: pickupLat,
          longitude: pickupLng,
        },
        destination: {
          latitude: parseFloat(item?.destination?.lat),
          longitude: parseFloat(item?.destination?.long),
        },
      });
    } else {
      console.warn('⚠️ Invalid coordinates for ride history:', { pickupLat, pickupLng });
    }
  };

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

  //   const MapReady = (event) => {
  //     setmapRegion({
  //       latitude: location?.coords.latitude,
  //       longitude: location?.coords.longitude,
  //       latitudeDelta: 0.0922,
  //       longitudeDelta: 0.0421,
  //     });
  //   };

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between w-[60%]`}>
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
            History
          </Text>
        </View>
      </View>
      <View
        style={tw`flex-row mt-3.5 mb-1 bg-[#3C8F7C0D] border border-base-green rounded-[9px] mx-4 overflow-hidden`}
      >
        {Tabs.map((item) => (
          <Pressable
            key={item}
            onPress={() => setSelected(item)}
            style={tw.style(
              `basis-[33.333%] py-4 rounded-[8px]`,
              selected === item ? `bg-base-green` : `bg-transparent`
            )}
          >
            <Text
              style={tw.style(
                `text-center text-[15px]`,
                selected === item ? `text-white` : `text-[#5A5A5A]`,
                { fontFamily: "RobotoMedium" }
              )}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator
          style={tw`mt-4`}
          color={tw.color("base-green")}
          size="large"
        />
      ) : data.length === 0 ? (
        <EmptyData />
      ) : (
        <ScrollView contentContainerStyle={tw`px-7 py-4`}>
          {data.map((item) => (
            <ListItem
              key={item?.ride_id}
              item={item}
              action={() => showModal(item)}
            />
          ))}
        </ScrollView>
      )}
      <Portal>
        <BottomSheet
          index={-1}
          snapPoints={["50%"]}
          ref={bottomSheetRef}
          backdropComponent={renderBackdrop}
          handleComponent={() => (
            <Pressable
              onPress={() => bottomSheetRef?.current?.close()}
              style={tw`self-end bg-black mt-4 p-2.5 rounded-full`}
            >
              <AntDesign name="close" size={24} color="white" />
            </Pressable>
          )}
          style={tw`px-6 rounded-t-[40px]`}
          //   enablePanDownToClose
        >
          <Text style={tw.style({ fontFamily: "RobotoMedium" })}>
            {current?.date}
          </Text>

          <BottomSheetView style={tw`h-[244px] mt-3`}>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              region={mapRegion || undefined}
              initialRegion={mapRegion || undefined}
              mapType="standard"
              style={tw`w-full h-full`}
              showsPointsOfInterest={true}
              showsCompass={false}
              showsScale={false}
              toolbarEnabled={false}
              {...Platform.select({
                android: {
                  customMapStyle: LIGHT_MAP_STYLE,
                  zoomControlEnabled: false,
                },
                ios: {
                  customMapStyle: LIGHT_MAP_STYLE,
                },
              })}
            >
              <Marker coordinate={maps.origin}>
                <Svg width={35} height={34} viewBox="0 0 28 25" fill="none">
                  <G filter="url(#filter0_f_459_8082)">
                    <Rect
                      x={14.5859}
                      y={20.0126}
                      width={8.81307}
                      height={3.38964}
                      rx={1.69482}
                      transform="rotate(-24.0101 14.5859 20.0126)"
                      fill="#B3B3B3"
                      fillOpacity={0.8}
                    />
                  </G>
                  <G filter="url(#filter1_d_459_8082)">
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M18.6805 18.1888C19.2844 17.9197 20.5516 13.0269 20.7483 11.5605C21.0507 9.30637 21.2577 7.96031 20.388 6.00792C18.9237 2.72056 15.0717 1.2427 11.7843 2.70702C8.49696 4.17133 7.0191 8.02333 8.48341 11.3107C9.35761 13.2732 10.4442 14.0347 12.317 15.3161C13.6224 16.2092 18.0766 18.4578 18.6805 18.1888Z"
                      fill="black"
                      fillOpacity={0.9}
                    />
                    <Path
                      d="M19.0874 19.1022C19.3299 18.9942 19.4878 18.824 19.5691 18.7265C19.6625 18.6145 19.74 18.4932 19.8029 18.3831C19.9292 18.1621 20.0489 17.8942 20.1598 17.6157C20.3839 17.0529 20.6154 16.3351 20.8277 15.6017C21.2493 14.1454 21.6313 12.4999 21.7394 11.6934C21.749 11.6219 21.7586 11.551 21.7681 11.4807C22.0549 9.35234 22.268 7.77091 21.3015 5.60102C19.6124 1.80917 15.1693 0.104499 11.3774 1.79354C7.58556 3.48258 5.8809 7.92573 7.56994 11.7176C8.56803 13.9583 9.87093 14.8542 11.7524 16.1414C12.47 16.6325 13.9657 17.4443 15.3339 18.0921C16.0234 18.4185 16.7111 18.7178 17.2784 18.9206C17.5591 19.021 17.8376 19.1076 18.0857 19.1587C18.2092 19.1841 18.3503 19.2061 18.495 19.2102C18.6214 19.2139 18.8494 19.2083 19.0874 19.1022Z"
                      stroke="white"
                      strokeWidth={2}
                    />
                  </G>
                  <Path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M15.7623 11.6354C17.406 10.9032 18.1449 8.97723 17.4127 7.33355C16.6806 5.68987 14.7546 4.95094 13.1109 5.6831C11.4672 6.41526 10.7283 8.34125 11.4605 9.98493C12.1926 11.6286 14.1186 12.3675 15.7623 11.6354Z"
                    fill="white"
                  />
                  <Defs></Defs>
                </Svg>
              </Marker>
              <Marker coordinate={maps.destination}>
                <Svg width={28} height={28} viewBox="0 0 25 24" fill="none">
                  <G filter="url(#filter0_d_459_8086)">
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M17.1238 19.2548C21.228 17.4267 23.0731 12.6176 21.2449 8.51342C19.4168 4.40926 14.6077 2.56419 10.5035 4.39235C6.39935 6.2205 4.55428 11.0296 6.38243 15.1338C8.21059 19.2379 13.0197 21.083 17.1238 19.2548Z"
                      fill="#3C8F7C"
                    />
                    <Path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M17.1238 19.2548C21.228 17.4267 23.0731 12.6176 21.2449 8.51342C19.4168 4.40926 14.6077 2.56419 10.5035 4.39235C6.39935 6.2205 4.55428 11.0296 6.38243 15.1338C8.21059 19.2379 13.0197 21.083 17.1238 19.2548Z"
                      stroke="white"
                      strokeWidth={3}
                    />
                  </G>
                  <Path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M15.2665 15.0828C17.0666 14.281 17.8758 12.1717 17.074 10.3717C16.2722 8.57158 14.1629 7.76234 12.3628 8.56416C10.5628 9.36599 9.75352 11.4752 10.5553 13.2753C11.3572 15.0754 13.4664 15.8846 15.2665 15.0828Z"
                    fill="white"
                  />
                  <Defs></Defs>
                </Svg>
              </Marker>
              {maps.origin.latitude > 0 && (
                <CustomMapDirections
                  origin={maps.origin}
                  destination={maps.destination}
                  strokeWidth={4}
                  strokeColor={tw.color("base-green") || "#3C8F7C"}
                  mode="driving"
                />
              )}
            </MapView>
          </BottomSheetView>
        </BottomSheet>
      </Portal>
    </ImageBackground>
  );
};

export default SharedHistory;
