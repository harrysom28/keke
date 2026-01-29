import {
  ActivityIndicator,
  Modal,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { ClipPath, Defs, G, Path, Rect, Svg } from "react-native-svg";
import { setRideData, setRideUtils } from "@/store/AppSlice";
import { useCallback, useContext, useEffect, useState } from "react";

import { APPLY_CODE } from "@/constants";
import { AntDesign } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useDispatch } from "react-redux";
import { useIsFocused } from "@react-navigation/native";

// import { TextInput, View } from "@gorhom/bottom-sheet";













interface SProps {
  show: boolean;
  setShow: React.Dispatch<React.SetStateAction<boolean>>;
  modal: { title: string; discount: string };
  action: () => void;
}

export const PromoCodeSuccess = ({ show, setShow, modal, action }: SProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      if (show) {
        action();
      }
    }, 3000); // 3 seconds delay

    // Cleanup function to clear the timeout if the component unmounts
    return () => clearTimeout(timer);
  }, [show]); // Empty dependency array means this only runs on mount

  return (
    <Modal
      visible={show}
      onRequestClose={action}
      transparent
      animationType="slide"
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor={tw.color(`bg-[#1919194D]`)}
      />
      <TouchableWithoutFeedback onPress={() => setShow(false)}>
        <View
          style={tw.style(`relative bg-[#1919194D]`, {
            flex: 1,
          })}
        >
          <Pressable
            style={tw`flex-col items-center gap-y-1 pt-9 px-4 absolute top-[20%] left-6 right-6 h-[400px] bg-white rounded-[20px]`}
          >
            <Svg
              style={tw`self-center mb-8`}
              width="147"
              height="147"
              viewBox="0 0 101 101"
              fill="none"
            >
              <G clip-path="url(#clip0_250_21498)">
                <Path
                  d="M81.6086 10.3716H57.8852C55.1354 10.3716 52.4981 11.464 50.5536 13.4085L3.13345 60.829C1.78364 62.1786 1.78364 64.3671 3.13345 65.7167L34.9043 97.4876C36.2542 98.8374 38.4424 98.8374 39.792 97.4876L87.2122 50.0673C89.1567 48.123 90.2491 45.4856 90.2491 42.7356V19.0122C90.2493 14.2403 86.3807 10.3716 81.6086 10.3716ZM80.0901 27.8626C78.0655 29.8872 74.7829 29.8872 72.7585 27.8626C70.7338 25.838 70.7338 22.5556 72.7585 20.531C74.7831 18.5063 78.0657 18.5063 80.0901 20.531C82.1147 22.5556 82.1149 25.8378 80.0901 27.8626Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M8.32036 66.0159L55.7405 18.5956C57.685 16.6513 60.3223 15.5587 63.0721 15.5587H86.7954C87.8231 15.5587 88.795 15.769 89.7094 16.0983C88.5098 12.7675 85.3528 10.3718 81.6084 10.3718H57.8852C55.1354 10.3718 52.4981 11.4641 50.5536 13.4087L3.13345 60.829C1.78364 62.1786 1.78364 64.3671 3.13345 65.7167L8.32036 70.9036C6.97036 69.554 6.97036 67.3655 8.32036 66.0159Z"
                  fill="#3C8F7C"
                />
                <Path
                  d="M100.5 6.93114C100.508 5.10516 99.8029 3.3909 98.5158 2.10379C97.2289 0.81688 95.5111 0.112974 93.6885 0.119614C91.8678 0.127232 90.1537 0.842661 88.8621 2.13407C88.3152 2.68094 87.3205 3.86219 86.7764 4.51786C86.2049 5.20633 86.2994 6.22782 86.9879 6.79911C87.6762 7.37059 88.6977 7.27606 89.2691 6.58758C90.1215 5.56102 90.826 4.75262 91.1531 4.42528C91.8363 3.74227 92.7414 3.36376 93.702 3.35965C93.7072 3.35965 93.7121 3.35965 93.7174 3.35965C94.667 3.35965 95.557 3.72684 96.2246 4.39461C96.8959 5.0659 97.2637 5.9618 97.2596 6.91727C97.2555 7.87762 96.877 8.7827 96.1939 9.4661C95.5824 10.0776 93.4805 11.745 90.4689 13.8487C88.6875 10.803 85.3836 8.75126 81.6076 8.75126H57.8844C54.682 8.75126 51.6715 9.99833 49.4068 12.2626L1.98691 59.6833C1.02812 60.6421 0.5 61.9169 0.5 63.2727C0.5 64.6286 1.02812 65.9036 1.98691 66.8622L33.7578 98.6331C34.7477 99.6227 36.0473 100.117 37.3473 100.117C38.6473 100.117 39.9473 99.6225 40.9367 98.6331L88.357 51.213C90.6213 48.9485 91.8684 45.938 91.8684 42.7354V19.0122C91.8684 18.312 91.7975 17.6284 91.6631 16.9673C95.091 14.6085 97.6074 12.6352 98.4852 11.7575C99.777 10.4661 100.492 8.75204 100.5 6.93114ZM88.6283 19.0122V42.7354C88.6283 45.0723 87.7182 47.2694 86.066 48.9216L38.6457 96.3421C37.9301 97.0579 36.7648 97.0579 36.049 96.3421L4.27813 64.5712C3.93145 64.2245 3.74023 63.7634 3.74023 63.2727C3.74023 62.7821 3.93125 62.3212 4.27813 61.9745L51.6982 14.5544C53.3508 12.902 55.5477 11.9921 57.8844 11.9921H81.6076C84.2717 11.9921 86.5939 13.4837 87.783 15.6755C85.8693 16.9427 83.7266 18.2901 81.4533 19.6151C81.3824 19.5374 81.31 19.4604 81.2348 19.3852C78.5816 16.7321 74.2648 16.7321 71.6117 19.3852C68.9586 22.0384 68.9586 26.3552 71.6117 29.0083C72.9383 30.3348 74.6809 30.9979 76.4232 30.9979C78.1656 30.9979 79.9082 30.3348 81.2348 29.0083C83.0057 27.2374 83.5926 24.7259 82.9996 22.462C84.9768 21.311 86.8754 20.1347 88.6275 18.9966C88.6279 19.0018 88.6283 19.0071 88.6283 19.0122ZM74.9764 24.9247C75.2609 25.4905 75.832 25.8171 76.425 25.8171C76.6697 25.8171 76.9184 25.7614 77.152 25.6438C78.1016 25.1661 79.0479 24.6692 79.9848 24.1602C79.9941 25.085 79.6484 26.0128 78.9441 26.7169C77.5543 28.1065 75.2934 28.1065 73.9035 26.7169C72.5139 25.327 72.5139 23.0661 73.9035 21.6763C74.5984 20.9813 75.5111 20.6341 76.4238 20.6341C77.1465 20.6341 77.867 20.8556 78.4816 21.2909C77.5646 21.7893 76.634 22.2774 75.6959 22.7495C74.8961 23.1515 74.574 24.1255 74.9764 24.9247Z"
                  fill="black"
                />
                <Path
                  d="M48.7744 33.119C47.8797 33.119 47.1543 33.8442 47.1543 34.7391V68.9538C47.1543 69.8485 47.8797 70.5739 48.7744 70.5739C49.6691 70.5739 50.3945 69.8485 50.3945 68.9538V34.7391C50.3945 33.844 49.6691 33.119 48.7744 33.119Z"
                  fill="black"
                />
                <Path
                  d="M31.7418 47.0351C29.0887 49.6882 29.0887 54.005 31.7418 56.6581C33.0686 57.9849 34.8107 58.648 36.5533 58.6478C38.2955 58.6478 40.0383 57.9843 41.3646 56.6581C42.65 55.3728 43.3578 53.6642 43.3578 51.8466C43.3578 50.029 42.65 48.3204 41.3646 47.0353C38.7115 44.3817 34.3945 44.3819 31.7418 47.0351ZM39.0734 54.3667C37.6836 55.7565 35.4227 55.7563 34.033 54.3667C32.6434 52.9769 32.6434 50.7159 34.033 49.3261C34.7279 48.6312 35.6406 48.2839 36.5533 48.2839C37.466 48.2839 38.3787 48.6312 39.0736 49.3261C39.7469 49.9993 40.1176 50.8942 40.1176 51.8464C40.1174 52.7985 39.7467 53.6935 39.0734 54.3667Z"
                  fill="black"
                />
                <Path
                  d="M56.1812 47.0351C53.5281 49.6882 53.5281 54.005 56.1812 56.6581C57.5078 57.9847 59.2502 58.6478 60.9928 58.6478C62.7352 58.6478 64.4777 57.9847 65.8041 56.6581C68.4572 54.005 68.4572 49.6882 65.8041 47.0351C63.151 44.3818 58.8338 44.382 56.1812 47.0351ZM63.5127 54.3667C62.1228 55.7566 59.8619 55.7564 58.4723 54.3667C57.0826 52.9769 57.0826 50.7159 58.4723 49.3261C59.1672 48.6312 60.0799 48.2839 60.9926 48.2839C61.9053 48.2839 62.818 48.6312 63.5129 49.3261C64.9025 50.7159 64.9025 52.9769 63.5127 54.3667Z"
                  fill="black"
                />
              </G>
              <Defs>
                <ClipPath id="clip0_250_21498">
                  <Rect
                    width="100"
                    height="100"
                    fill="white"
                    transform="translate(0.5 0.118652)"
                  />
                </ClipPath>
              </Defs>
            </Svg>

            <Text
              style={tw.style(`text-[48px] text-center text-[#2A2A2A]`, {
                fontFamily: "RobotoBold",
              })}
            >
              {modal?.discount}%
            </Text>
            <Text
              style={tw.style(`text-[28px] text-center text-[#2A2A2A]`, {
                fontFamily: "RobotoBold",
              })}
            >
              Discount Applied
            </Text>
            <Text
              style={tw.style(`text-xs text-center text-[#B8B8B8]`, {
                fontFamily: "RobotoMedium",
              })}
            >
              {modal?.title}
            </Text>
          </Pressable>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

interface Props {
  back: () => void;
}

export const PromoCodeView = ({ back }: Props) => {
  const { apiConfig } = useContext(AppContext);
  const dispatch = useDispatch();
  const [code, setCode] = useState("");
  const [modal, setModal] = useState({ title: "", discount: "" });
  const [loading, setLoading] = useState(false);
  const isFocused = useIsFocused();
  const [show, setShow] = useState(false);

  const handleConfirm = useCallback(() => {
    setLoading(true);
    axios
      .post(APPLY_CODE, { offer_id: code }, apiConfig)
      .then(({ data }) => {
        console.log(data?.data);
        dispatch(setRideData({ promo_code: code }));
        dispatch(setRideUtils({ promo_code: data?.data?.discount }));
        showMessage({
          type: "success",
          message: data?.message,
        });
        let calc = data?.data?.discount * 100;
        setModal({ discount: calc.toString(), title: data?.data?.title });
        setShow(true);
      })
      .catch((err) => {
        console.log(err?.response?.data);
        dispatch(setRideData({ promo_code: "" }));
        dispatch(setRideUtils({ promo_code: "" }));
        if (err?.response?.data?.message) {
          showMessage({
            type: "danger",
            message: err?.response?.data.message,
          });
        }
        if (err?.response?.data?.error) {
          const errorMessage = typeof err?.response?.data?.error === 'string' 
            ? err.response.data.error 
            : (err.response.data.error?.discount || err.response.data.error?.message || err.response.data.message || 'An error occurred');
          showMessage({
            type: "danger",
            message: errorMessage,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <>
      <PromoCodeSuccess
        show={show}
        setShow={setShow}
        modal={modal}
        action={back}
      />
      <View style={tw``}>
        <View
          style={tw.style(
            `flex-row items-center bg-[#F6F6F6] w-[99%] py-3 px-4 rounded-t-[16px]`,
            {
              shadowColor: "#000",
              shadowOffset: {
                width: 0,
                height: 3,
              },
              shadowOpacity: 0.25,
              shadowRadius: 2.84,
              elevation: 5,
            }
          )}
        >
          <Text
            style={tw.style(`basis-[88%] text-center text-xl text-[#242E42]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            Promo Code
          </Text>
          <TouchableOpacity
            onPress={() => back()}
            style={tw`h-[39px] w-[39px] flex-col items-center justify-center bg-black p-1 rounded-full`}
          >
            <AntDesign name="close" size={24} color="white" />
          </TouchableOpacity>
        </View>
        <View style={tw`relative my-10 `}>
          <TextInput
            value={code}
            onChangeText={(text) => setCode(text)}
            style={tw.style(
              `pl-14 text-[15px] h-[45px] border-2 border-[#EFEFEF] rounded`,
              { fontFamily: "RobotoRegular" }
            )}
            placeholder="Input promo code"
            placeholderTextColor="#C8C7CC"
          />
          <View style={tw`absolute top-2.5 left-4 bg-[#3C8F7C1A] p-1`}>
            <Svg width="24" height="18" viewBox="0 0 24 18" fill="none">
              <Path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M24 6C24 6.27637 23.7764 6.50002 23.5 6.50002C22.1216 6.50002 21 7.62159 21 9C21 10.3784 22.1216 11.5 23.5 11.5C23.7764 11.5 24 11.7236 24 12V16C24 17.103 23.103 18 22 18H2.00002C0.896953 18 0 17.103 0 16V12C0 11.7236 0.223641 11.5 0.500016 11.5C1.87842 11.5 3 10.3784 3 9C3 7.62159 1.87842 6.50002 0.500016 6.50002C0.223641 6.50002 0 6.27637 0 6V2.00002C0 0.896953 0.896953 0 2.00002 0H22C23.103 0 24 0.896953 24 2.00002V6ZM6.49997 16C6.77634 16 6.99998 15.7764 6.99998 15.5V14.5C6.99998 14.2237 6.77634 14 6.49997 14C6.22359 14 5.99995 14.2237 5.99995 14.5V15.5C5.99995 15.7764 6.22359 16 6.49997 16ZM6.99998 11.5C6.99998 11.7764 6.77634 12 6.49997 12C6.22359 12 5.99995 11.7764 5.99995 11.5V10.5C5.99995 10.2236 6.22359 9.99998 6.49997 9.99998C6.77634 9.99998 6.99998 10.2236 6.99998 10.5V11.5ZM6.49997 8.00002C6.77634 8.00002 6.99998 7.77637 6.99998 7.5V6.50002C6.99998 6.22364 6.77634 6 6.49997 6C6.22359 6 5.99995 6.22364 5.99995 6.50002V7.5C5.99995 7.77637 6.22359 8.00002 6.49997 8.00002ZM6.99998 3.50002C6.99998 3.77639 6.77634 4.00003 6.49997 4.00003C6.22359 4.00003 5.99995 3.77639 5.99995 3.50002V2.37502C5.99995 2.09864 6.22359 1.875 6.49997 1.875C6.77634 1.875 6.99998 2.09864 6.99998 2.37502V3.50002ZM11 4.00003C9.89695 4.00003 9 5.12161 9 6.50002C9 7.87842 9.897 9 11 9C12.103 9 13 7.87842 13 6.50002C13 5.12161 12.1031 4.00003 11 4.00003ZM10.4995 14C10.4043 14 10.3081 13.9727 10.2227 13.916C9.99272 13.7627 9.9307 13.4527 10.084 13.2226L16.084 4.22264C16.2368 3.99267 16.5459 3.93066 16.7774 4.08398C17.0074 4.23731 17.0694 4.54734 16.9161 4.77736L10.9161 13.7774C10.8198 13.9219 10.6612 14 10.4995 14ZM14 11.5C14 12.8784 14.897 14 16 14C17.103 14 18 12.8784 18 11.5C18 10.1216 17.103 9 16 9C14.897 9 14 10.1216 14 11.5Z"
                fill="#3C8F7C"
              />
            </Svg>
          </View>
        </View>

        <Pressable
          disabled={code?.length < 1}
          onPress={handleConfirm}
          style={tw`bg-base-green py-4 rounded`}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text
              style={tw.style(`text-base text-center text-white`, {
                fontFamily: "RobotoMedium",
              })}
            >
              Apply
            </Text>
          )}
        </Pressable>
      </View>
    </>
  );
};
