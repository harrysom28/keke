// File: useImagePicker.tsx

import * as ImageManipulator from "expo-image-manipulator";
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

// Asset shape we hand back to the rest of the picker. We override `type` and
// `mimeType` with the actual MIME string (the picker's native `type` is the
// media-kind union "image" | "video" | ..., which is useless for multipart).
type CompressedAsset = Omit<
  ImagePicker.ImagePickerAsset,
  "type" | "mimeType" | "fileName"
> & {
  fileName: string;
  type: string;
  mimeType: string;
};

const rewriteToJpgName = (orig?: string | null): string => {
  if (orig && typeof orig === "string" && orig.trim().length > 0) {
    const dot = orig.lastIndexOf(".");
    const base = dot > 0 ? orig.slice(0, dot) : orig;
    return `${base}.jpg`;
  }
  return `compressed_${Date.now()}.jpg`;
};

// Resize to 1280px wide @ 0.7 quality JPEG. A ~5MB camera shot drops to
// ~250KB, which is the difference between a 30s upload and a 3s upload over
// 4G. Returns a full asset-like object so downstream FormData.append calls
// always have a valid `name` and `type` — RN's multipart impl silently fails
// (rejecting before the request leaves the device) when either is undefined.
// Falls back to the original asset if manipulation throws (e.g. unsupported
// HEIC variant) so we never block the user from continuing.
const compressImage = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<CompressedAsset> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return {
      ...asset,
      uri: result.uri,
      width: result.width,
      height: result.height,
      fileName: rewriteToJpgName(asset.fileName),
      type: "image/jpeg",
      mimeType: "image/jpeg",
    };
  } catch (error) {
    console.warn("Image compression failed, using original:", error);
    return {
      ...asset,
      fileName: asset.fileName ?? `compressed_${Date.now()}.jpg`,
      type: asset.mimeType || "image/jpeg",
      mimeType: asset.mimeType || "image/jpeg",
    };
  }
};

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

      // Compress images on-device before they hit state/upload. We only touch
      // images here — PDFs and videos are passed through untouched. We hand
      // the whole asset in so the returned object preserves fileName/type
      // (with the JPEG extension/mime rewritten).
      if (filetype === "image") {
        for (let i = 0; i < result.assets.length; i++) {
          const asset = result.assets[i];
          if (asset?.uri) {
            const compressed = await compressImage(asset);
            result.assets[i] = compressed as unknown as ImagePicker.ImagePickerAsset;
          }
        }
      }

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

        // Camera always returns an image; compress before handing off. Pass
        // the whole asset so the returned object carries a proper fileName
        // and `image/jpeg` mime (RN multipart rejects undefined name/type).
        if (filetype === "image" && result.assets[0]?.uri) {
          const compressed = await compressImage(result.assets[0]);
          result.assets[0] = compressed as unknown as ImagePicker.ImagePickerAsset;
        }

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
