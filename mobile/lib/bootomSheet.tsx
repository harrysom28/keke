import RBSheet from "@nonam4/react-native-bottom-sheet";
import React from "react";
import { StatusBar } from "react-native";
import { WINDOW_HEIGHT } from "@/constants/Metrics";
import tw from "./tailwind";

interface Props {
  children: React.ReactNode;
  sheetRef: React.RefObject<RBSheet>;
  maskColor?: string;
  barMask?: string;
  icon?: boolean;
  height?: number;
  closeOnDragDown?: boolean;
  closeOnPressMask?: boolean;
  styles?: string;
}

export default function BottomSheet({
  children,
  sheetRef,
  maskColor,
  barMask,
  icon = false,
  height = 0.5,
  closeOnDragDown = true,
  closeOnPressMask = false,
  styles = "",
}: Props) {
  return (
    <RBSheet
      animationType="fade"
      ref={sheetRef}
      closeOnDragDown={closeOnDragDown}
      closeOnPressMask={closeOnPressMask}
      height={WINDOW_HEIGHT * height}
      customStyles={{
        wrapper: {
          backgroundColor: maskColor ?? "#3837377D",
        },
        draggableIcon: {
          display: icon ? "flex" : "none",
        },
        container: tw.style(`px-6 pt-4 rounded-t-[24px]`, styles),
      }}
    >
      <StatusBar backgroundColor={barMask ?? "#12121D66"} />
      {children}
    </RBSheet>
  );
}
