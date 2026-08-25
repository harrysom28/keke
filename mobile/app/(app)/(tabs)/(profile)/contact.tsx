import React, { useEffect, useState } from "react";
import {
  ImageBackground,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import tw from "@/lib/tailwind";
import { showMessage } from "react-native-flash-message";
import { Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import apiClient from "@/utils/apiClient";
import { SUPPORT_EMAIL } from "@/constants";
import { KeyboardFormScrollView } from "@/components/KeyboardFormScrollView";

const ContactScreen = () => {
  const { rideId, subject } = useLocalSearchParams<{ rideId?: string; subject?: string }>();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof subject === "string" && subject.trim().length > 0) {
      setFormData((prev) => (prev.subject ? prev : { ...prev, subject: subject.trim() }));
    }
  }, [subject]);

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      showMessage({
        type: "warning",
        message: "Please fill in all fields",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      showMessage({
        type: "warning",
        message: "Please enter a valid email address",
      });
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("support/tickets", {
        subject: formData.subject,
        message: `${formData.name} (${formData.email})\n\n${formData.message}`,
        ...(rideId ? { rideId } : {}),
        category: rideId ? "ride_issue" : undefined,
      });
      showMessage({
        type: "success",
        message: "Message sent! We'll get back to you soon.",
      });
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Failed to send message.";
      if (err?.status === 429) {
        showMessage({ type: "warning", message: "Too many requests. Please wait a moment." });
      } else {
        showMessage({ type: "danger", message: msg });
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneCall = () => {
    Linking.openURL("tel:+2348000000000");
  };

  const handleEmail = async () => {
    try {
      const url = `mailto:${SUPPORT_EMAIL}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        showMessage({ type: "success", message: "Opening email client..." });
      } else {
        throw new Error("Cannot open mailto");
      }
    } catch {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      showMessage({
        type: "info",
        message: `Email copied to clipboard. Contact ${SUPPORT_EMAIL}`,
      });
    }
  };

  return (
    <ImageBackground
      style={tw.style(`bg-white`, {
        flex: 1,
      })}
      source={require("@images/pattern-bg.png")}
    >
      <StatusBar barStyle="light-content" />
      <View style={tw.style(`bg-[#3C8F7CE6] mb-1 px-4 pt-14 pb-5`)}>
        <View style={tw`flex-row items-center justify-between w-[75%]`}>
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
            Contact Us
          </Text>
        </View>
      </View>

      <KeyboardFormScrollView style={tw`flex-1`} contentContainerStyle={tw`px-6 py-4 pb-8`}>
          <Text
            style={tw.style(`text-base text-[#8F92A1] mb-6`, {
              fontFamily: "RobotoRegular",
            })}
          >
            We're here to help! Get in touch with us through any of the
            following methods.
          </Text>

          {/* Quick Contact Options */}
          <View style={tw`mb-6`}>
            <Text
              style={tw.style(`text-lg text-black mb-3`, {
                fontFamily: "RobotoBold",
              })}
            >
              Quick Contact
            </Text>
            <TouchableOpacity
              onPress={handlePhoneCall}
              style={tw`bg-white rounded-lg p-4 mb-3 flex-row items-center justify-between border border-[#EFEFF4]`}
            >
              <View style={tw`flex-row items-center`}>
                <AntDesign name="phone" size={20} color="#3C8F7C" />
                <Text
                  style={tw.style(`text-base text-black ml-3`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Call Us
                </Text>
              </View>
              <Text
                style={tw.style(`text-sm text-[#8F92A1]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                +234 800 000 0000
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleEmail}
              style={tw`bg-white rounded-lg p-4 flex-row items-center justify-between border border-[#EFEFF4]`}
            >
              <View style={tw`flex-row items-center`}>
                <AntDesign name="mail" size={20} color="#3C8F7C" />
                <Text
                  style={tw.style(`text-base text-black ml-3`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Email Us
                </Text>
              </View>
              <Text
                style={tw.style(`text-sm text-[#8F92A1]`, {
                  fontFamily: "RobotoRegular",
                })}
              >
                {SUPPORT_EMAIL}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Contact Form */}
          <View style={tw`mb-6`}>
            <Text
              style={tw.style(`text-lg text-black mb-4`, {
                fontFamily: "RobotoBold",
              })}
            >
              Send us a Message
            </Text>

            <View style={tw`mb-4`}>
              <Text
                style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Name
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoRegular",
                  }
                )}
                value={formData.name}
                onChangeText={(text) =>
                  setFormData({ ...formData, name: text })
                }
                placeholder="Your name"
                placeholderTextColor="#D0D0D0"
              />
            </View>

            <View style={tw`mb-4`}>
              <Text
                style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Email
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoRegular",
                  }
                )}
                value={formData.email}
                onChangeText={(text) =>
                  setFormData({ ...formData, email: text })
                }
                placeholder="your.email@example.com"
                placeholderTextColor="#D0D0D0"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={tw`mb-4`}>
              <Text
                style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Subject
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoRegular",
                  }
                )}
                value={formData.subject}
                onChangeText={(text) =>
                  setFormData({ ...formData, subject: text })
                }
                placeholder="What is this about?"
                placeholderTextColor="#D0D0D0"
              />
            </View>

            <View style={tw`mb-4`}>
              <Text
                style={tw.style(`text-sm text-[#8F92A1] mb-2`, {
                  fontFamily: "RobotoMedium",
                })}
              >
                Message
              </Text>
              <TextInput
                style={tw.style(
                  `text-base px-4 py-3 text-black border border-[#B8B8B8] rounded-[8px]`,
                  {
                    fontFamily: "RobotoRegular",
                    minHeight: 120,
                    textAlignVertical: "top",
                  }
                )}
                value={formData.message}
                onChangeText={(text) =>
                  setFormData({ ...formData, message: text })
                }
                placeholder="Tell us how we can help..."
                placeholderTextColor="#D0D0D0"
                multiline
                numberOfLines={5}
              />
            </View>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={loading}
              style={tw.style(
                `bg-base-green py-3.5 rounded-lg`,
                loading && "opacity-50"
              )}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text
                  style={tw.style(`text-center text-base text-white`, {
                    fontFamily: "RobotoMedium",
                  })}
                >
                  Send Message
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Office Hours */}
          <View style={tw`bg-white rounded-lg p-4 border border-[#EFEFF4]`}>
            <Text
              style={tw.style(`text-lg text-black mb-2`, {
                fontFamily: "RobotoBold",
              })}
            >
              Office Hours
            </Text>
            <Text
              style={tw.style(`text-base text-[#333]`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Monday - Friday: 9:00 AM - 6:00 PM
            </Text>
            <Text
              style={tw.style(`text-base text-[#333] mt-1`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Saturday: 10:00 AM - 4:00 PM
            </Text>
            <Text
              style={tw.style(`text-base text-[#333] mt-1`, {
                fontFamily: "RobotoRegular",
              })}
            >
              Sunday: Closed
            </Text>
          </View>
        </KeyboardFormScrollView>
    </ImageBackground>
  );
};

export default ContactScreen;
