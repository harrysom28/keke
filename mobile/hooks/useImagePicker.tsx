// File: useImagePicker.tsx

import * as ImagePicker from "expo-image-picker";

import { Alert } from "react-native";
import mime from "mime";
import { showMessage } from "react-native-flash-message";
import { useState } from "react";

interface Props {
  filetype: "image" | "video" | "all";
  multiple?: boolean;
  limitVideoDuration?: { status: boolean; dur: number };
}

const useImagePicker = ({
  filetype = "image",
  multiple = false,
  limitVideoDuration = { status: false, dur: 0 },
}: Props) => {
  const [selectedImage, setSelectedImage] = useState<{
    uri: string;
    type: string;
    name: string;
  } | null>(null);
  const [isLimitError, setIsLimitError] = useState(false);

  const handleImageSave = (assets: ImagePicker.ImagePickerAsset[]) => {
    const uri = assets[0].uri;
    const nm = uri.split("/");
    const name = nm[nm.length - 1];
    const type = mime.getType(uri) || assets[0].type || "image/jpeg";

    const source = { uri, type, name };

    if (type === "video" && limitVideoDuration.status) {
      if ((assets[0]?.duration ?? 0) > limitVideoDuration.dur) {
        setIsLimitError(true);
        showMessage({
          message: "Please select a valid video - 40 secs or less",
          type: "warning",
          duration: 3500,
        });
        return;
      }
    }

    if (filetype === "all") {
      setSelectedImage(source);
      return;
    }

    if (source.type.includes(filetype)) {
      setSelectedImage(source);
    } else {
      showMessage({
        message: `Please select a valid ${filetype} type`,
        type: "warning",
        duration: 3500,
      });
    }
  };

  const handleImageSaveMultiple = (assets: ImagePicker.ImagePickerAsset[]) => {
    const sources: Array<unknown> = [];
    assets.forEach((item) => {
      const uri = item.uri;
      const nm = uri.split("/");
      const name = nm[nm.length - 1];
      const type = mime.getType(uri) || "image/jpeg";
      const source = { uri, type, name };

      if (filetype === "all") {
        sources.push(source);
        return;
      }

      if (source.type.includes(filetype)) {
        sources.push(source);
      } else {
        showMessage({
          message: `Please select a valid ${filetype} type`,
          type: "warning",
          duration: 3500,
        });
      }
    });
  };

  /** Open the photo library. */
  const showImagePicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      mediaTypes:
        filetype === "all"
          ? ImagePicker.MediaTypeOptions.All
          : filetype === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: multiple,
    });
    if (!result.canceled) {
      setIsLimitError(false);
      if (multiple) {
        handleImageSaveMultiple(result.assets);
      } else {
        handleImageSave(result.assets);
      }
    }
  };

  /** Open the camera to take a new photo. */
  const showCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        showMessage({
          message: "Camera permission is required to take a photo.",
          type: "warning",
          duration: 3500,
        });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
      });
      if (!result.canceled) {
        setIsLimitError(false);
        handleImageSave(result.assets);
      }
    } catch (err: unknown) {
      const raw =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : err &&
                typeof err === "object" &&
                "message" in err &&
                typeof (err as { message: unknown }).message === "string"
              ? (err as { message: string }).message
              : "";
      const unavailable = /simulator|not available|unavailable/i.test(raw);

      showMessage({
        message: unavailable
          ? "Camera is not available on the simulator. Use Choose from Gallery or test on a device."
          : "Could not open the camera. Try Choose from Gallery instead.",
        type: "warning",
        duration: 4500,
      });
    }
  };

  /**
   * Show an action sheet prompting the user to either take a photo or choose
   * one from the gallery. Use this instead of `showImagePicker` wherever both
   * options should be available (e.g. document upload screens).
   */
  const showImagePickerWithOptions = () => {
    Alert.alert(
      "Upload Photo",
      "How would you like to add a photo?",
      [
        {
          text: "Take Photo",
          onPress: showCamera,
        },
        {
          text: "Choose from Gallery",
          onPress: showImagePicker,
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ],
      { cancelable: true }
    );
  };

  const clearImage = () => {
    setSelectedImage(null);
  };

  return {
    selectedImage,
    showImagePicker,
    showCamera,
    showImagePickerWithOptions,
    clearImage,
    isLimitError,
  };
};

export default useImagePicker;
