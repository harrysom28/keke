import { Image, Pressable, Text, TouchableOpacity } from "react-native";

import { BottomSheetView } from "@gorhom/bottom-sheet";
import { KeKe_Black_Svg } from "@/svg";
import { ScrollView } from "react-native-gesture-handler";
import tw from "@/lib/tailwind";
import { useState } from "react";

interface LProps {
  isactive: boolean;
  onPress: () => void;
}

const ListItem = ({ isactive, onPress }: LProps) => {
  return (
    <Pressable
      onPress={onPress}
      style={tw.style(
        `flex-row gap-x-2 items-center p-2 rounded-lg`,
        isactive && `bg-base-green`
      )}
    >
      {KeKe_Black_Svg({ width: "34", height: "34" })}
      <BottomSheetView style={tw`w-[84%]`}>
        <BottomSheetView style={tw`flex-row justify-between items-center `}>
          <Text
            style={tw.style(
              `text-[17px] text-[#242E42]`,
              isactive && `text-white`,
              {
                fontFamily: "RobotoMedium",
              }
            )}
          >
            Keke
          </Text>
          <Text
            style={tw.style(
              `text-[17px] text-[#242E42]`,
              isactive && `text-white`,
              {
                fontFamily: "RobotoMedium",
              }
            )}
          >
            &#8358; 200
          </Text>
        </BottomSheetView>
        <BottomSheetView style={tw`flex-row justify-between items-center`}>
          <Text
            style={tw.style(
              `text-[13px] text-[#C8C7CC]`,
              isactive && `text-white`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
          >
            0.2km
          </Text>
          <Text
            style={tw.style(
              `text-[13px] text-[#C8C7CC]`,
              isactive && `text-white`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
          >
            5 min
          </Text>
        </BottomSheetView>
      </BottomSheetView>
    </Pressable>
  );
};

interface Props {
  action: () => void;
}
export const RideView = ({ action }: Props) => {
  const [active, setActive] = useState(0);
  return (
    <>
      <BottomSheetView>
        <ScrollView
          style={tw.style(`h-[83%]`)}
          scrollEnabled
          contentContainerStyle={tw`flex-col gap-y-2 pb-16`}
        >
          {Array.from({ length: 6 }).map((_, index) => (
            <ListItem
              key={index + 1}
              isactive={active === index}
              onPress={() => setActive(index)}
            />
          ))}
        </ScrollView>
      </BottomSheetView>
      <TouchableOpacity
        onPress={() => action()}
        style={tw`absolute bottom-24 left-0 right-0 bg-base-green py-4 rounded`}
      >
        <Text
          style={tw.style(`text-base text-center text-white`, {
            fontFamily: "RobotoMedium",
          })}
        >
          Select Ride
        </Text>
      </TouchableOpacity>
    </>
  );
};
