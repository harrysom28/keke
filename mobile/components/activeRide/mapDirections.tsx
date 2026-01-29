import React from "react";
import Svg, { Defs, G, Path, Rect } from "react-native-svg";
import { View } from "react-native";

import { Marker } from "react-native-maps";
import tw from "@/lib/tailwind";
import CustomMapDirections from "./CustomMapDirections";

export default function MapDirections({ check, origin, destination }) {
  // Additional validation: ensure coordinates are valid
  const isValid = check && 
    origin?.latitude && origin?.longitude && 
    destination?.latitude && destination?.longitude &&
    origin.latitude !== 0 && origin.longitude !== 0 &&
    destination.latitude !== 0 && destination.longitude !== 0 &&
    origin.latitude !== 1 && origin.longitude !== 1 &&
    destination.latitude !== 1 && destination.longitude !== 1;

  return (
    <>
      {isValid ? (
        <View>
          <Marker 
            coordinate={origin}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
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
          <Marker 
            coordinate={destination}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
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
          <CustomMapDirections
            origin={origin}
            destination={destination}
            strokeWidth={4}
            strokeColor={tw.color("base-green") || "#00BFA5"}
            mode="driving"
          />
        </View>
      ) : null}
    </>
  );
}
