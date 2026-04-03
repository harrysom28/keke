import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
} from "react-native";
import { Path, Svg } from "react-native-svg";
import React, { useContext, useEffect, useState } from "react";

import { AntDesign, FontAwesome5 } from "@expo/vector-icons";
import { AppContext } from "@/app/context";
import { DRIVER_TASKS } from "@/constants";
import EmptyData from "@/components/emptyData";
import apiClient from "@/utils/apiClient";
import axios from "axios";
import { getErrorMessage } from "@/utils/errorHandler";
import { safeShowMessage } from "@/utils/safeShowMessage";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";

const Tab = ["Daily task", "Completed", "Challenges"];

interface ITask {
  amount?: string | number;
  task_amount?: string | number;
  completed_at: string | null;
  task_id: string;
  task_title: string;
  ride_id?: string;
  status?: string;
  fare?: number;
  created_at?: string;
}

interface IChallenge {
  challenge_id: string;
  title: string;
  description: string;
  target: number;
  unit: string;
  reward_amount: number;
  current_progress: number;
  completed: boolean;
  completed_at: string | null;
  reward_claimed: number | null;
}

interface LProps {
  item: ITask;
  completed: boolean;
}

interface ChallengeItemProps {
  challenge: IChallenge;
}

function ChallengeItem({ challenge }: Readonly<ChallengeItemProps>) {
  const progress = challenge.target > 0 ? Math.min(challenge.current_progress / challenge.target, 1) : 0;
  return (
    <View
      style={tw.style(
        "flex-row justify-between items-center bg-white rounded-[12px] p-4 border border-gray-100",
        { elevation: 2 }
      )}
    >
      <View style={tw.style("flex-1 gap-y-1")}>
        <View style={tw.style("flex-row items-center gap-x-2")}>
          <View
            style={tw.style(
              "w-10 h-10 rounded-full items-center justify-center",
              challenge.completed ? "bg-[#3C8F7C]" : "bg-amber-400"
            )}
          >
            {challenge.completed ? (
              <AntDesign name="check" size={22} color="white" />
            ) : (
              <FontAwesome5 name="bullseye" size={18} color="white" />
            )}
          </View>
          <Text style={tw.style("text-[16px] text-black", { fontFamily: "RobotoMedium" })}>
            {challenge.title}
          </Text>
        </View>
        <Text style={tw.style("text-[12px] text-gray-600", { fontFamily: "RobotoRegular" })}>
          {challenge.description}
        </Text>
        <View style={tw.style("h-2 bg-gray-100 rounded-full overflow-hidden mt-2")}>
          <View
            style={[
              tw.style(
                "h-full rounded-full",
                challenge.completed ? "bg-[#3C8F7C]" : "bg-amber-400"
              ),
              { width: `${progress * 100}%` },
            ]}
          />
        </View>
        <Text style={tw.style("text-[11px] text-gray-500 mt-1", { fontFamily: "RobotoRegular" })}>
          {challenge.current_progress}/{challenge.target} {challenge.unit}
        </Text>
      </View>
      <View style={tw.style("items-end")}>
        <Text style={tw.style("text-[15px] text-[#3C8F7C]", { fontFamily: "RobotoBold" })}>
          ₦{Number(challenge.reward_amount || 0).toLocaleString()}
        </Text>
        {challenge.completed && challenge.reward_claimed != null && (
          <Text style={tw.style("text-[11px] text-gray-500", { fontFamily: "RobotoRegular" })}>
            Claimed
          </Text>
        )}
      </View>
    </View>
  );
}

function ListItem({ item, completed }: Readonly<LProps>) {
  const router = useRouter();

  const handleTaskPress = () => {
    // If task is completed, just show it (no action)
    if (completed) {
      return;
    }
    
    // For active tasks, navigate to the ride details or dashboard
    // Since tasks are actually rides, we can navigate to the home screen
    // where the driver can manage the ride
    if (item?.ride_id) {
      // Navigate to home/dashboard where driver can see active rides
      router.push("/(driver)/(tabs)/(dashboard)/home");
    }
  };
  return (
    <Pressable
      onPress={handleTaskPress}
      style={tw.style(
        `flex-row justify-between items-center bg-white rounded-[8px]`,
        completed ? `p-2` : `p-4`,
        {
          elevation: 4,
        }
      )}
    >
      <View style={tw.style(`flex-row gap-x-4 items-center flex-1`)}>
        <Svg
          width={completed ? 26 : 50}
          height={completed ? 26 : 50}
          viewBox="0 0 50 50"
          fill="none"
        >
          <Path
            d="M32.2917 15.625L29.2708 12.7083L31.5625 10.4167H16.5625V6.25H31.5625L29.2708 3.95833L32.1875 0.9375L39.5833 8.33333L32.2917 15.625ZM15.625 37.5C16.5278 37.5 17.2743 37.2049 17.8646 36.6146C18.4549 36.0243 18.75 35.2778 18.75 34.375C18.75 33.4722 18.4549 32.7257 17.8646 32.1354C17.2743 31.5451 16.5278 31.25 15.625 31.25C14.7222 31.25 13.9757 31.5451 13.3854 32.1354C12.7951 32.7257 12.5 33.4722 12.5 34.375C12.5 35.2778 12.7951 36.0243 13.3854 36.6146C13.9757 37.2049 14.7222 37.5 15.625 37.5ZM34.375 37.5C35.2778 37.5 36.0243 37.2049 36.6146 36.6146C37.2049 36.0243 37.5 35.2778 37.5 34.375C37.5 33.4722 37.2049 32.7257 36.6146 32.1354C36.0243 31.5451 35.2778 31.25 34.375 31.25C33.4722 31.25 32.7257 31.5451 32.1354 32.1354C31.5451 32.7257 31.25 33.4722 31.25 34.375C31.25 35.2778 31.5451 36.0243 32.1354 36.6146C32.7257 37.2049 33.4722 37.5 34.375 37.5ZM6.25 25H37.9167L35.7292 18.75H14.2708L16.5625 21.0417L13.6458 24.0625L6.25 16.6667L13.6458 9.27083L16.5625 12.2917L14.2708 14.5833H36.4583C37.1528 14.5833 37.7604 14.7743 38.2812 15.1563C38.8021 15.5382 39.1667 16.0417 39.375 16.6667L43.75 29.1667V45.8333C43.75 46.4236 43.55 46.9188 43.15 47.3188C42.75 47.7188 42.2556 47.9181 41.6667 47.9167H39.5833C38.9931 47.9167 38.4986 47.7167 38.1 47.3167C37.7014 46.9167 37.5014 46.4222 37.5 45.8333V43.75H12.5V45.8333C12.5 46.4236 12.3 46.9188 11.9 47.3188C11.5 47.7188 11.0056 47.9181 10.4167 47.9167H8.33333C7.74306 47.9167 7.24861 47.7167 6.85 47.3167C6.45139 46.9167 6.25139 46.4222 6.25 45.8333V25Z"
            fill="black"
          />
        </Svg>
        <View style={tw.style(`flex-1`)}>
          <Text
            style={tw.style(`text-[16px] text-black `, {
              fontFamily: "RobotoMedium",
            })}
          >
            {item?.task_title || `Ride #${item?.ride_id?.slice(-6) || 'N/A'}`}
          </Text>
          <Text
            style={tw.style(`text-[12px] text-[#030319]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            ₦{completed ? (item?.task_amount || item?.fare || 0) : (item?.amount || item?.fare || 0)}
          </Text>
        </View>
      </View>
      {completed && (
        <AntDesign name="check-circle" size={24} color="#3C8F7C" />
      )}
    </Pressable>
  );
}

const Tasks = () => {
  const [modal, setModal] = useState(false);
  const [selected, setSelected] = useState(Tab[0]);

  let isFocused = useIsFocused();
  const { apiConfig } = useContext(AppContext);
  const [loading, setLoading] = useState(false);
  const [challengesLoading, setChallengesLoading] = useState(false);
  const [data, setData] = useState<ITask[]>([]);
  const [completed_task, setCompleted_task] = useState<ITask[]>([]);
  const [challenges, setChallenges] = useState<IChallenge[]>([]);

  // Helper function to map backend ride data to frontend task format
  const mapRideToTask = (ride: any): ITask => {
    const rideId = ride?.ride_id || ride?._id?.toString() || '';
    const fare = ride?.fare || 0;
    const status = ride?.status || 'unknown';
    const createdAt = ride?.created_at || ride?.createdAt || new Date().toISOString();
    
    // Generate task title based on status
    const statusLabels: { [key: string]: string } = {
      'requested': 'New Ride Request',
      'accepted': 'Accepted Ride',
      'arrived': 'Arrived at Pickup',
      'in-progress': 'Ride in Progress',
      'completed': 'Completed Ride',
      'cancelled': 'Cancelled Ride',
    };
    
    return {
      task_id: rideId,
      ride_id: rideId,
      task_title: statusLabels[status] || `Ride #${rideId.slice(-6)}`,
      amount: fare,
      task_amount: fare,
      fare: fare,
      completed_at: status === 'completed' ? (ride?.completedAt || createdAt) : null,
      status: status,
      created_at: createdAt,
    };
  };

  useEffect(() => {
    if (isFocused && (selected === Tab[0] || selected === Tab[1])) {
      setLoading(true);
      axios
        .get(DRIVER_TASKS, apiConfig)
        .then(({ data }) => {
          const rides = data?.data?.rides || [];
          const ridesArray = Array.isArray(rides) ? rides : [];
          const mappedTasks = ridesArray.map((ride: any) => mapRideToTask(ride));
          if (selected === Tab[1]) {
            setCompleted_task(mappedTasks.filter((t: ITask) => t.status === "completed"));
            setData([]);
          } else {
            setData(mappedTasks.filter((t: ITask) => t.status !== "completed"));
            setCompleted_task([]);
          }
        })
        .catch((err) => {
          const status = err?.response?.status || err?.status;
          if (status === 404 || status === 401) {
            setData([]);
            setCompleted_task([]);
            return;
          }
          safeShowMessage({ type: "danger", message: getErrorMessage(err) });
          setData([]);
          setCompleted_task([]);
        })
        .finally(() => setLoading(false));
    }
  }, [isFocused, selected]);

  useEffect(() => {
    if (isFocused && selected === Tab[2]) {
      setChallengesLoading(true);
      apiClient
        .get("driver/challenges")
        .then(({ data }) => {
          setChallenges(data?.data?.challenges || []);
        })
        .catch((err) => {
          if (err?.response?.status !== 404 && err?.response?.status !== 401) {
            safeShowMessage({ type: "danger", message: getErrorMessage(err) });
          }
          setChallenges([]);
        })
        .finally(() => setChallengesLoading(false));
    }
  }, [isFocused, selected]);

  return (
    <>
      <Modal visible={modal} transparent style={tw`flex-1`}>
        <StatusBar backgroundColor={tw.color(`bg-black bg-opacity-30`)} />
        <View
          style={tw`h-full flex-col justify-center items-center bg-black bg-opacity-30 px-6`}
        >
          <View
            style={tw`flex-col gap-y-6 bg-white w-full p-5 h-[460px] rounded-[12px]`}
          >
            <Pressable
              onPress={() => {
                setModal(false);
              }}
            >
              <AntDesign
                name="close"
                size={24}
                style={tw`self-end `}
                color="#5A5A5A"
              />
            </Pressable>
            <Image
              resizeMode="contain"
              source={require("@images/running.png")}
              style={tw`w-[122px] h-[122px] my-2 self-center`}
            />
            <Text
              style={tw.style(`text-[24px] text-black text-center`, {
                fontFamily: "RobotoBold",
              })}
            >
              Keep going
            </Text>
            <Text
              style={tw.style(`text-[15px] text-[#A0A0A0] text-center`, {
                fontFamily: "RobotoMedium",
              })}
            >
              9 down, 1 remaining
            </Text>
          </View>
        </View>
      </Modal>
      <ImageBackground
        style={tw.style(`bg-white`, {
          flex: 1,
        })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5 h-[188px]`)}>
          <View style={tw``}>
            <Text
              style={tw.style(`text-white text-center text-2xl`, {
                fontFamily: "RobotoBold",
              })}
            >
              {selected === Tab[2] ? "Challenges" : "Today's Task"}
            </Text>
          </View>
        </View>
        <View
          style={tw.style(
            ` z-50 pt-4 pb-8`,
            selected === Tab[0] ? "-mt-20" : "-mt-16"
          )}
        >
          <View
            style={tw.style(`mx-6`, {
              display: selected === Tab[0] ? "flex" : "none",
            })}
          >
            <Image
              resizeMode="contain"
              source={require("@images/driver.png")}
              style={tw`w-full h-[265px] my-2 self-center`}
            />
          </View>

          <View style={tw`flex-row items-center justify-between mx-4`}>
            {Tab.map((item) => (
              <Pressable
                key={item}
                style={tw`flex-col items-center gap-y-[2px] flex-1`}
                onPress={() => setSelected(item)}
              >
                <Text
                  style={tw.style(
                    `text-[14px]`,
                    selected === item && (selected === Tab[0] ? `text-black` : `text-white`),
                    selected !== item && `text-[#C8C7CC]`,
                    { fontFamily: "RobotoMedium" }
                  )}
                >
                  {item}
                </Text>
                {selected === item && (
                  <View
                    style={tw.style(
                      `w-[32px] h-[3px] rounded`,
                      selected === Tab[0] ? `bg-base-green` : `bg-white`
                    )}
                  />
                )}
              </Pressable>
            ))}
          </View>

          <ScrollView
            style={tw`mt-6 py-4`}
            contentContainerStyle={tw.style(
              "flex-col gap-y-3 px-6",
              selected === Tab[0] ? "pb-[500px]" : selected === Tab[2] ? "pb-[300px]" : "pb-[250px]"
            )}
          >
            {selected !== Tab[2] && loading && (
              <ActivityIndicator color={tw.color("base-green")} size="large" />
            )}
            {selected === Tab[2] && challengesLoading && (
              <ActivityIndicator color={tw.color("base-green")} size="large" />
            )}

            {!loading && selected === Tab[0] && (
              <>
                {!Array.isArray(data) || data.length === 0 ? (
                  <EmptyData text="No available task" />
                ) : (
                  data.map((item) => (
                    <ListItem
                      key={item?.task_id || item?.ride_id}
                      item={item}
                      completed={item?.status === "completed" || !!item?.completed_at}
                    />
                  ))
                )}
              </>
            )}

            {!loading && selected === Tab[1] && (
              <>
                {!Array.isArray(completed_task) || completed_task.length === 0 ? (
                  <EmptyData />
                ) : (
                  completed_task.map((item) => (
                    <ListItem
                      key={item?.task_id || item?.ride_id}
                      item={item}
                      completed={true}
                    />
                  ))
                )}
              </>
            )}

            {!challengesLoading && selected === Tab[2] && (
              <>
                {!Array.isArray(challenges) || challenges.length === 0 ? (
                  <EmptyData text="No challenges right now" />
                ) : (
                  challenges.map((c) => (
                    <ChallengeItem key={c.challenge_id} challenge={c} />
                  ))
                )}
              </>
            )}
          </ScrollView>
        </View>
      </ImageBackground>
    </>
  );
};

export default Tasks;
