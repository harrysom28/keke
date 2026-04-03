import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  FlatList,
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
import { BOLT_MAP_STYLE } from "@/constants/mapStyle";
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

  const [initialMapRegion, setInitialMapRegion] = useState<{
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
      setInitialMapRegion(m);
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
        <FlatList
          data={data}
          contentContainerStyle={tw`px-7 py-4`}
          initialNumToRender={15}
          windowSize={5}
          removeClippedSubviews={true}
          keyExtractor={(item: any, index) => String(item?.ride_id || index)}
          renderItem={({ item }: any) => (
            <ListItem item={item} action={() => showModal(item)} />
          )}
        />
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
            <View style={tw`w-full h-full`} renderToHardwareTextureAndroid>
            <MapView
              ref={mapRef}
              provider={PROVIDER_GOOGLE}
              initialRegion={initialMapRegion || undefined}
              mapType="standard"
              style={tw`w-full h-full`}
              showsPointsOfInterest={true}
              showsCompass={false}
              showsScale={false}
              toolbarEnabled={false}
              {...Platform.select({
                android: {
                  customMapStyle: BOLT_MAP_STYLE,
                  zoomControlEnabled: false,
                },
                ios: {
                  customMapStyle: BOLT_MAP_STYLE,
                },
              })}
            >
              <Marker coordinate={maps.origin} pinColor="#111111" tracksViewChanges={false} />
              <Marker coordinate={maps.destination} pinColor="#3C8F7C" tracksViewChanges={false} />
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
            </View>
          </BottomSheetView>
        </BottomSheet>
      </Portal>
    </ImageBackground>
  );
};

export default SharedHistory;
