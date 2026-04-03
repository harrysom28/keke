import * as Contacts from "expo-contacts";
import { AntDesign, Feather } from "@expo/vector-icons";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Platform,
  ScrollView,
  Share,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { requestContactsPermission } from "@/utils/requestContactsPermission";
import React, { useCallback, useEffect, useState } from "react";
import { Checkbox } from "expo-checkbox";

import EmptyData from "@/components/emptyData";
import apiClient from "@/utils/apiClient";
import { router } from "expo-router";
import { showMessage } from "react-native-flash-message";
import tw from "@/lib/tailwind";
import { useIsFocused } from "@react-navigation/native";
import { verticalScale } from "@/constants/Metrics";

interface ReferralItem {
  referred_user_id: string;
  referred_user_name: string;
  referred_user_email_phone: string;
  referred_user_image?: string | null;
  joined_at: string;
  total_rides: number;
  verified: boolean;
}

interface LProps {
  item: ReferralItem;
}

function ListItem({ item }: LProps) {
  const verified = item?.verified ?? false;
  return (
    <View
      style={tw`flex-row gap-x-4 items-center py-2 border-b border-[#EFEFEF]`}
    >
      {item?.referred_user_image ? (
        <Image
          source={{ uri: item.referred_user_image }}
          style={tw`h-[48px] w-[48px] rounded-full bg-gray-200`}
        />
      ) : (
        <View style={tw`h-[48px] w-[48px] rounded-full bg-gray-200 items-center justify-center`}>
          <Text style={tw`text-gray-500 text-lg`}>
            {(item?.referred_user_name || "?")[0]}
          </Text>
        </View>
      )}
      <View style={tw`basis-[78%]`}>
        <View style={tw`flex-row justify-between items-center`}>
          <Text
            style={tw.style(`text-[15px] text-[#262628]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item?.referred_user_name || "—"}
          </Text>
          <Text
            style={tw.style(`text-[15px] text-base-green`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item?.referred_user_email_phone || "—"}
          </Text>
        </View>
        <View style={tw`flex-row justify-between items-center mt-1`}>
          <Text
            style={tw.style(`text-[12px] text-[#555]`, {
              fontFamily: "RobotoRegular",
            })}
          >
            {item?.total_rides ?? 0} ride{(item?.total_rides ?? 0) !== 1 ? "s" : ""} completed
          </Text>
          <Text
            style={tw.style(
              `text-[12px]`,
              verified ? `text-base-green` : `text-[#F47960]`,
              {
                fontFamily: "RobotoRegular",
              }
            )}
          >
            {verified ? `Verified` : `Pending`}
          </Text>
        </View>
      </View>
    </View>
  );
}

type ViewMode = "referrals" | "contacts";

const SharedInviteList = () => {
  const isFocused = useIsFocused();
  const [viewMode, setViewMode] = useState<ViewMode>("referrals");
  const [data, setData] = useState<ReferralItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Contact picker state
  const [contacts, setContacts] = useState<Contacts.ExistingContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralUrl, setReferralUrl] = useState<string | null>(null);

  const fetchReferrals = useCallback(() => {
    setLoading(true);
    apiClient
      .get("user/profile/referral-list")
      .then((res) => {
        const d = res?.data?.data;
        const referrals = d?.referrals ?? [];
        setData(Array.isArray(referrals) ? referrals : []);
      })
      .catch((err) => {
        const msg = err?.response?.data?.message;
        if (msg) showMessage({ type: "danger", message: msg });
        setData([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchReferralCode = useCallback(() => {
    apiClient
      .get("user/profile/referral-code")
      .then((res) => {
        const codeData = res?.data?.data;
        setReferralCode(codeData?.referral_code ?? null);
        setReferralUrl(codeData?.referral_url ?? null);
      })
      .catch(() => {
        setReferralCode(null);
        setReferralUrl(null);
      });
  }, []);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      if (Platform.OS === "android") {
        const androidGranted = await requestContactsPermission();
        if (!androidGranted) {
          setContactsError("Contacts permission is required to invite from your list.");
          setContacts([]);
          return;
        }
      }
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setContactsError("Contacts permission is required to invite from your list.");
        setContacts([]);
        return;
      }
      const { data: contactList } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        sort: Contacts.SortTypes.FirstName,
      });
      setContacts(contactList.filter((c) => (c.name ?? "").trim().length > 0));
    } catch (e) {
      setContactsError("Could not load contacts.");
      setContacts([]);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      fetchReferrals();
    }
  }, [isFocused, fetchReferrals]);

  useEffect(() => {
    if (viewMode === "contacts") {
      loadContacts();
      fetchReferralCode();
    }
  }, [viewMode, loadContacts, fetchReferralCode]);

  const filteredData = search.trim()
    ? data.filter((i) =>
        (i?.referred_user_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (i?.referred_user_email_phone || "").toLowerCase().includes(search.toLowerCase())
      )
    : data;

  const filteredContacts = search.trim()
    ? contacts.filter((c) => {
        const name = (c.name ?? "").toLowerCase();
        const q = search.toLowerCase();
        if (name.includes(q)) return true;
        const phones = (c.phoneNumbers ?? []).map((p) => (p.number ?? "").replace(/\s/g, ""));
        return phones.some((n) => n.includes(q) || q.split(/\s/).every((part) => n.includes(part)));
      })
    : contacts;

  const toggleContact = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size >= filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id ?? "").filter(Boolean)));
    }
  };

  const shareMessage =
    referralCode && referralUrl
      ? `Join me on Keke! Use my invite code ${referralCode} when you sign up. ${referralUrl}`
      : referralCode
        ? `Join me on Keke! Use my invite code ${referralCode} when you sign up.`
        : "Join me on Keke - the ride-hailing app!";

  const onInviteSelected = async () => {
    if (selectedIds.size === 0) {
      showMessage({ type: "warning", message: "Select at least one contact" });
      return;
    }
    try {
      await Share.share({
        message: shareMessage,
        title: "Invite to Keke",
      });
      setSelectedIds(new Set());
    } catch (e) {
      showMessage({ type: "danger", message: "Failed to share" });
    }
  };

  const renderContactItem = ({ item }: { item: Contacts.ExistingContact }) => {
    const id = item.id;
    const name = item.name ?? "—";
    const phone = item.phoneNumbers?.[0]?.number ?? "";
    const isSelected = selectedIds.has(id);
    return (
      <TouchableOpacity
        onPress={() => toggleContact(id)}
        style={tw`flex-row items-center gap-x-3 py-3 border-b border-[#EFEFEF]`}
        activeOpacity={0.7}
      >
        <Checkbox
          value={isSelected}
          onValueChange={() => toggleContact(id)}
          color={isSelected ? "#3C8F7C" : undefined}
          style={tw`rounded`}
        />
        <View style={tw`flex-1`}>
          <Text
            style={tw.style(`text-[15px] text-[#262628]`, {
              fontFamily: "RobotoMedium",
            })}
          >
            {name}
          </Text>
          {phone ? (
            <Text
              style={tw.style(`text-[13px] text-[#555] mt-0.5`, {
                fontFamily: "RobotoRegular",
              })}
            >
              {phone}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View
      style={tw.style(`bg-[#3C8F7CE6] px-4 pt-14`, {
        height: verticalScale(195),
      })}
    >
      <View style={tw`flex-row items-center justify-between w-[70%]`}>
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
          Invite Friends
        </Text>
      </View>

      <View style={tw`flex-row gap-2 mt-3`}>
        <TouchableOpacity
          onPress={() => setViewMode("referrals")}
          style={tw.style(
            `flex-1 py-2 rounded-lg`,
            viewMode === "referrals" ? "bg-white" : "bg-[#FFFFFF40]"
          )}
        >
          <Text
            style={tw.style(
              `text-center text-sm`,
              { fontFamily: "RobotoMedium" },
              viewMode === "referrals" ? "text-base-green" : "text-white"
            )}
          >
            My referrals
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode("contacts")}
          style={tw.style(
            `flex-1 py-2 rounded-lg`,
            viewMode === "contacts" ? "bg-white" : "bg-[#FFFFFF40]"
          )}
        >
          <Text
            style={tw.style(
              `text-center text-sm`,
              { fontFamily: "RobotoMedium" },
              viewMode === "contacts" ? "text-base-green" : "text-white"
            )}
          >
            From contacts
          </Text>
        </TouchableOpacity>
      </View>

      <View style={tw`mt-3.5 relative`}>
        <Feather
          name="search"
          size={20}
          style={tw`absolute top-2 left-5 z-1`}
          color="white"
        />
        <TextInput
          style={tw.style(
            `text-[17px] h-[36px] px-14 w-full text-white bg-[#FFFFFF40] rounded-xl`,
            {
              fontFamily: "RobotoRegular",
            }
          )}
          placeholder="Search"
          placeholderTextColor="white"
          value={search}
          onChangeText={setSearch}
        />
      </View>
    </View>
  );

  if (viewMode === "contacts") {
    return (
      <ImageBackground
        style={tw.style(`bg-white`, { flex: 1 })}
        source={require("@images/pattern-bg.png")}
      >
        <StatusBar barStyle="light-content" />
        {header}

        {contactsLoading ? (
          <View style={tw`flex-1 justify-center items-center py-12`}>
            <ActivityIndicator size="large" color="#3C8F7C" />
            <Text style={tw`text-gray-500 mt-2`}>Loading contacts...</Text>
          </View>
        ) : contactsError ? (
          <View style={tw`flex-1 justify-center items-center px-6 py-12`}>
            <Text style={tw`text-center text-gray-600`}>{contactsError}</Text>
            <TouchableOpacity
              onPress={loadContacts}
              style={tw`mt-4 bg-base-green px-4 py-2 rounded-lg`}
            >
              <Text style={tw`text-white font-medium`}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : filteredContacts.length === 0 ? (
          <EmptyData text={search.trim() ? "No contacts match your search" : "No contacts found"} />
        ) : (
          <>
            <View style={tw`flex-row items-center justify-between px-7 py-2 bg-white border-b border-[#EFEFEF]`}>
              <TouchableOpacity onPress={selectAll}>
                <Text style={tw.style(`text-base-green text-sm`, { fontFamily: "RobotoMedium" })}>
                  {selectedIds.size >= filteredContacts.length ? "Deselect all" : "Select all"}
                </Text>
              </TouchableOpacity>
              {selectedIds.size > 0 && (
                <Text style={tw.style(`text-[#555] text-sm`, { fontFamily: "RobotoRegular" })}>
                  {selectedIds.size} selected
                </Text>
              )}
            </View>
            <FlatList
              data={filteredContacts}
              keyExtractor={(c) => c.id ?? String(Math.random())}
              renderItem={renderContactItem}
              contentContainerStyle={tw`px-7 pb-24`}
              ListEmptyComponent={null}
            />
            {selectedIds.size > 0 && (
              <View style={tw`absolute bottom-0 left-0 right-0 px-6 py-4 bg-white border-t border-[#EFEFEF]`}>
                <TouchableOpacity
                  onPress={onInviteSelected}
                  style={tw`bg-base-green py-4 rounded-[8px]`}
                >
                  <Text
                    style={tw.style(`text-white text-center text-base`, {
                      fontFamily: "RobotoBold",
                    })}
                  >
                    Invite selected ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ImageBackground>
    );
  }

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      {header}

      {loading ? (
        <View style={tw`flex-1 justify-center items-center py-12`}>
          <Text style={tw`text-gray-500`}>Loading...</Text>
        </View>
      ) : filteredData.length === 0 ? (
        <EmptyData />
      ) : (
        <ScrollView contentContainerStyle={tw`px-7 py-4`}>
          {filteredData.map((item) => (
            <ListItem key={item?.referred_user_id || item?.referred_user_email_phone || Math.random()} item={item} />
          ))}
        </ScrollView>
      )}
    </ImageBackground>
  );
};

export default SharedInviteList;
