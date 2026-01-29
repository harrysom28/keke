import React, { useState, useContext } from "react";
import {
  ImageBackground,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import tw from "@/lib/tailwind";
import { AppContext } from "@/app/context";
import axios from "axios";
import { showMessage } from "react-native-flash-message";
import { Linking } from "react-native";

const ContactScreen = () => {
  const { apiConfig } = useContext(AppContext);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);

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
    
    // In a real app, you would send this to your backend API
    // For now, we'll use email linking as a fallback
    try {
      const emailBody = `Name: ${formData.name}\nEmail: ${formData.email}\nSubject: ${formData.subject}\n\nMessage:\n${formData.message}`;
      const emailUrl = `mailto:support@keke.com?subject=${encodeURIComponent(formData.subject)}&body=${encodeURIComponent(emailBody)}`;
      
      const canOpen = await Linking.canOpenURL(emailUrl);
      if (canOpen) {
        await Linking.openURL(emailUrl);
        showMessage({
          type: "success",
          message: "Opening email client...",
        });
        // Reset form after a delay
        setTimeout(() => {
          setFormData({
            name: "",
            email: "",
            subject: "",
            message: "",
          });
        }, 1000);
      } else {
        showMessage({
          type: "info",
          message: "Please contact us at support@keke.com",
        });
      }
    } catch (error) {
      console.log("Error opening email:", error);
      showMessage({
        type: "danger",
        message: "Could not open email client. Please contact support@keke.com",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneCall = () => {
    Linking.openURL("tel:+2348000000000");
  };

  const handleEmail = () => {
    Linking.openURL("mailto:support@keke.com");
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

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={tw`flex-1`}
      >
        <ScrollView contentContainerStyle={tw`px-6 py-4 pb-8`}>
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
                support@keke.com
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
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
};

export default ContactScreen;
