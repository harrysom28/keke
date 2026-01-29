import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { AntDesign, Entypo } from "@expo/vector-icons";
import { Path, Svg } from "react-native-svg";
import React, { useState } from "react";

import { AppDetailsState } from "@/store/AppSlice";
import tw from "@/lib/tailwind";
import { useSelector } from "react-redux";

interface PItem {
  text: string;
  icon: () => React.JSX.Element;
}

const PaymentMode: PItem[] = [
  {
    text: "Wallet",
    icon: () => (
      <Svg width="33" height="35" viewBox="0 0 33 35" fill="none">
        <Path
          d="M28.1875 20.407C29.3266 20.407 30.25 19.4836 30.25 18.3445C30.25 17.2054 29.3266 16.282 28.1875 16.282C27.0484 16.282 26.125 17.2054 26.125 18.3445C26.125 19.4836 27.0484 20.407 28.1875 20.407Z"
          fill="black"
        />
        <Path
          d="M8.98633 5.15393L24.5296 2.35204C25.0701 2.25461 25.588 2.61132 25.6897 3.15104L26.067 5.15393L8.98633 5.15393Z"
          fill="black"
        />
        <Path
          d="M30.25 13.9951C29.6249 13.6981 28.9256 13.532 28.1875 13.532C25.5296 13.532 23.375 15.6866 23.375 18.3445C23.375 21.0024 25.5296 23.157 28.1875 23.157C28.9256 23.157 29.6249 22.9908 30.25 22.6939V25.907C30.25 27.4258 29.0188 28.657 27.5 28.657H5.5C3.98122 28.657 2.75 27.4258 2.75 25.907V9.40698C2.75 7.8882 3.98122 6.65698 5.5 6.65698H27.5C29.0188 6.65698 30.25 7.8882 30.25 9.40698V13.9951Z"
          fill="black"
        />
      </Svg>
    ),
  },
  {
    text: "Cash",
    icon: () => (
      <Svg width="29" height="20" viewBox="0 0 29 20" fill="none">
        <Path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M25.5 0.375C26.1938 0.374781 26.862 0.636809 27.3708 1.10856C27.8795 1.58031 28.1911 2.22691 28.2431 2.91875L28.25 3.125V16.875C28.2502 17.5688 27.9882 18.237 27.5164 18.7458C27.0447 19.2545 26.3981 19.5661 25.7062 19.6181L25.5 19.625H3.5C2.80621 19.6252 2.13797 19.3632 1.62925 18.8914C1.12052 18.4197 0.80891 17.7731 0.756875 17.0812L0.75 16.875V3.125C0.749781 2.43121 1.01181 1.76297 1.48356 1.25425C1.95531 0.745522 2.60191 0.43391 3.29375 0.381875L3.5 0.375H25.5ZM21.3791 3.125H7.62088L7.625 3.29688C7.625 3.81601 7.52275 4.33006 7.32409 4.80967C7.12542 5.28929 6.83424 5.72508 6.46716 6.09216C6.10007 6.45924 5.66429 6.75042 5.18467 6.94909C4.70506 7.14775 4.19101 7.25 3.67188 7.25L3.5 7.24587V12.7541L3.67188 12.75C4.72031 12.75 5.7258 13.1665 6.46716 13.9078C7.20851 14.6492 7.625 15.6547 7.625 16.7031L7.62088 16.875H21.3791L21.375 16.7031C21.375 15.6949 21.7602 14.7248 22.4519 13.9913C23.1435 13.2577 24.0893 12.8161 25.0957 12.7569L25.4147 12.7514L25.5 12.7541V7.24587L25.3281 7.25C24.3199 7.24999 23.3498 6.86477 22.6163 6.17313C21.8827 5.48149 21.4411 4.53571 21.3819 3.52925L21.375 3.21025L21.3791 3.125ZM25.3281 15.5C25.1556 15.5 24.9851 15.5371 24.8282 15.6088C24.6713 15.6805 24.5316 15.7851 24.4187 15.9155C24.3057 16.0459 24.2222 16.1991 24.1736 16.3646C24.1251 16.5302 24.1127 16.7043 24.1374 16.875H25.5V15.5124C25.4431 15.5042 25.3856 15.5001 25.3281 15.5ZM3.67188 15.5C3.61436 15.5001 3.55693 15.5042 3.5 15.5124V16.875H4.86263C4.88727 16.7043 4.87491 16.5302 4.82637 16.3646C4.77784 16.1991 4.69427 16.0459 4.58133 15.9155C4.46839 15.7851 4.32873 15.6805 4.17181 15.6088C4.01489 15.5371 3.84439 15.5 3.67188 15.5ZM14.5 4.5C15.9587 4.5 17.3576 5.07946 18.3891 6.11091C19.4205 7.14236 20 8.54131 20 10C20 11.4587 19.4205 12.8576 18.3891 13.8891C17.3576 14.9205 15.9587 15.5 14.5 15.5C13.0413 15.5 11.6424 14.9205 10.6109 13.8891C9.57946 12.8576 9 11.4587 9 10C9 8.54131 9.57946 7.14236 10.6109 6.11091C11.6424 5.07946 13.0413 4.5 14.5 4.5ZM14.5 7.25C13.7707 7.25 13.0712 7.53973 12.5555 8.05546C12.0397 8.57118 11.75 9.27065 11.75 10C11.75 10.7293 12.0397 11.4288 12.5555 11.9445C13.0712 12.4603 13.7707 12.75 14.5 12.75C15.2293 12.75 15.9288 12.4603 16.4445 11.9445C16.9603 11.4288 17.25 10.7293 17.25 10C17.25 9.27065 16.9603 8.57118 16.4445 8.05546C15.9288 7.53973 15.2293 7.25 14.5 7.25ZM4.86263 3.125H3.5V4.48763C3.67075 4.51227 3.8448 4.49991 4.01035 4.45137C4.1759 4.40284 4.32908 4.31927 4.45949 4.20633C4.58991 4.09339 4.6945 3.95373 4.7662 3.79681C4.83789 3.63989 4.87499 3.46939 4.875 3.29688L4.87225 3.21025L4.86263 3.125ZM25.5 3.125H24.1374C24.1127 3.29575 24.1251 3.4698 24.1736 3.63535C24.2222 3.8009 24.3057 3.95408 24.4187 4.08449C24.5316 4.21491 24.6713 4.3195 24.8282 4.3912C24.9851 4.46289 25.1556 4.49999 25.3281 4.5L25.4147 4.49725L25.5 4.48625V3.125Z"
          fill="#000000"
        />
      </Svg>
    ),
  },
];

interface PProps {
  active: boolean;
  index: number;
  item: PItem;
  onPress: () => void;
}

const PaymentView = ({ active, index, item, onPress }: PProps) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={tw.style(
        `flex-col items-center gap-y-2 px-8 border-[#EFEFF4]`,
        index === 0 ? "border-r" : "border-l",
        active ? "opacity-100" : "opacity-30"
      )}
    >
      {item.icon()}

      <Text
        style={tw.style(`text-[15px] text-center text-black`, {
          fontFamily: "RobotoRegular",
        })}
      >
        {item.text}
      </Text>
    </TouchableOpacity>
  );
};

interface Props {
  action: (
    selected: string,
    arr: Array<string>,
    loading: React.Dispatch<React.SetStateAction<boolean>>
  ) => void;
  back: () => void;
  code: () => void;
}

export const ConfirmPaymentView = ({ action, back, code }: Props) => {
  const { ride } = useSelector(AppDetailsState);
  const [loading, setLoading] = useState<boolean>(false);

  const [active, setActive] = useState<PItem>(PaymentMode[0]);
  return (
    <View>
      <Pressable
        onPress={back}
        style={tw`h-[39px] w-[39px] absolute top-0 right-0 z-10 flex-col items-center justify-center bg-black p-1 rounded-full`}
      >
        <AntDesign name="close" size={24} color="white" />
      </Pressable>
      <View style={tw`flex-row gap-x-4 mt-10`}>
        <View style={tw`flex-col items-center`}>
          <Entypo name="location-pin" size={28} color="#F44336" />
          <View
            style={tw.style(
              `h-[53px] border-l-2 border-dashed border-[#C8C7CC]`
            )}
          />
          <Entypo name="location-pin" size={28} color="black" />
        </View>

        <View style={tw`flex-col gap-y-3.5 basis-[100%]`}>
          <View style={tw`pb-3.5 border-b border-[#EFEFEF]`}>
            <Text
              style={tw.style(`text-base text-[#5A5A5A]`, {
                fontFamily: "RobotoMedium",
              })}
              numberOfLines={1}
            >
              Current location
            </Text>
            <Text
              style={tw.style(`text-xs text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
              numberOfLines={1}
            >
              {ride?.data?.origin?.name}
            </Text>
          </View>
          <View style={tw`relative`}>
            <View style={tw`flex-row items-center justify-between w-[80%]`}>
              <Text
                style={tw.style(`text-base text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Destination
              </Text>
              <Text
                style={tw.style(`text-sm text-[#5A5A5A]`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                {typeof ride?.utils?.distanceTime?.distance === 'object' && ride?.utils?.distanceTime?.distance?.text
                  ? ride.utils.distanceTime.distance.text
                  : (typeof ride?.utils?.distanceTime?.distance === 'string'
                      ? ride.utils.distanceTime.distance
                      : '0 km')}
              </Text>
            </View>
            <Text
              numberOfLines={1}
              style={tw.style(`text-xs text-[#B8B8B8]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {ride?.data?.destination?.name}
            </Text>
          </View>
        </View>
      </View>

      <View style={tw`my-4 py-4 `}>
        {/* <Text
          style={tw.style(`text-base text-black  mb-6`, {
            fontFamily: "RobotoBold",
          })}
        >
          Estimated time of arrival: 2mins
        </Text> */}
        <View style={tw`flex-row gap-x-8 justify-center items-center`}>
          {PaymentMode.map((item, index) => (
            <PaymentView
              key={item.text}
              active={active.text === item.text}
              index={index}
              item={item}
              onPress={() => setActive(item)}
            />
          ))}
        </View>

        <TouchableOpacity onPress={() => code()} style={tw`mt-4 mb-8`}>
          <Text
            style={tw.style(
              `text-base self-start text-base-green border-b-2 border-base-green`,
              {
                fontFamily: "RobotoMedium",
              }
            )}
          >
            Apply Promo code
          </Text>
        </TouchableOpacity>

        <Pressable
          onPress={() =>
            action(
              active.text,
              PaymentMode.map((i) => i.text),
              setLoading
            )
          }
          style={tw` bg-base-green py-4 rounded`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Continue
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
};
