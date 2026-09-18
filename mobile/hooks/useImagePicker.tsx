// File: useImagePicker.tsx

import {
  cacheDirectory,
  copyAsync,
  documentDirectory,
  getInfoAsync,
} from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { Alert, Platform } from "react-native";
import mime from "mime";
import { showMessage } from "react-native-flash-message";
import { useState } from "react";

interface Props {
  filetype: "image" | "video" | "all";
  multiple?: boolean;
  limitVideoDuration?: { status: boolean; dur: number };
}

/** Shape stored in form state and appended to FormData. */
export type UploadImageSource = {
  uri: string;
  type: string;
  name: string;
};

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

/**
 * RN multipart only reads real files. Always normalize to `file://…`.
 * Simulator usually already has file://; devices often start as ph:// /
 * content:// / assets-library:// or a bare absolute path.
 */
export const ensureFileUriForMultipart = async (uri: string): Promise<string> => {
  if (!uri || typeof uri !== "string") {
    throw new Error("Missing image URI");
  }
  if (uri.startsWith("file://")) return uri;
  if (uri.startsWith("/") && !uri.startsWith("//")) {
    return `file://${uri}`;
  }
  const needsCopy =
    uri.startsWith("content://") ||
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library://") ||
    uri.startsWith("assets-library:") ||
    (Platform.OS === "ios" && uri.startsWith("ph:"));
  if (needsCopy) {
    const base = cacheDirectory ?? documentDirectory;
    if (!base) {
      throw new Error("expo-file-system: no cache or document directory");
    }
    const prefix = base.endsWith("/") ? base : `${base}/`;
    const dest = `${prefix}pick_${Date.now()}_${Math.floor(Math.random() * 1e6)}.jpg`;
    await copyAsync({ from: uri, to: dest });
    return dest.startsWith("file://") ? dest : `file://${dest}`;
  }
  return uri;
};

const normalizeManipulatorUri = (uri: string): string => {
  if (!uri) return uri;
  if (uri.startsWith("file://")) return uri;
  // Both platforms: ImageManipulator sometimes returns a bare absolute path.
  // iOS FormData silently fails (axios Network Error, no response) without file://.
  if (uri.startsWith("/") && !uri.startsWith("//")) {
    return `file://${uri}`;
  }
  return uri;
};

const jpegMetaFrom = (fileNameHint?: string | null) => ({
  fileName: rewriteToJpgName(fileNameHint),
  type: "image/jpeg" as const,
  mimeType: "image/jpeg" as const,
});

// Resize to 1280px wide @ 0.7 quality JPEG. A ~5MB camera shot drops to
// ~250KB, which is the difference between a 30s upload and a 3s upload over
// 4G. Returns a full asset-like object so downstream FormData.append calls
// always have a valid `name` and `type` — RN's multipart impl silently fails
// (rejecting before the request leaves the device) when either is undefined.
const compressImage = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<CompressedAsset> => {
  const jpegMeta = jpegMetaFrom(asset.fileName);

  const fromResult = (
    result: ImageManipulator.ImageResult
  ): CompressedAsset => ({
    ...asset,
    uri: normalizeManipulatorUri(result.uri),
    width: result.width,
    height: result.height,
    ...jpegMeta,
  });

  try {
    const localUri = await ensureFileUriForMultipart(asset.uri);
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return fromResult(result);
  } catch (firstError) {
    console.warn("Image compression (via file URI) failed, retrying direct:", firstError);
  }

  try {
    const result = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return fromResult(result);
  } catch (secondError) {
    console.warn("Direct resize failed, trying encode-only:", secondError);
  }

  try {
    const localUri = await ensureFileUriForMultipart(asset.uri);
    const result = await ImageManipulator.manipulateAsync(localUri, [], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return fromResult(result);
  } catch (thirdError) {
    console.warn("Encode-only manipulate failed, using cached copy:", thirdError);
  }

  const fileUri = normalizeManipulatorUri(
    await ensureFileUriForMultipart(asset.uri)
  );
  if (!fileUri.startsWith("file://")) {
    console.warn(
      "Could not resolve image to file:// for upload; uri prefix:",
      fileUri.split("://")[0]
    );
    throw new Error(
      `Photo URI scheme "${fileUri.split("://")[0]}" cannot be uploaded. Retake the photo.`
    );
  }

  return {
    ...asset,
    uri: fileUri,
    ...jpegMeta,
  };
};

/**
 * Final guard before FormData.append. Re-runs copy + JPEG encode so submit
 * never relies on a stale gallery URI from pick time (common on physical
 * devices after the picker sheet dismisses).
 */
export const prepareImageForMultipart = async (
  source: UploadImageSource | { uri?: string; type?: string; name?: string } | null
): Promise<UploadImageSource> => {
  if (!source?.uri) {
    throw new Error("Missing photo");
  }
  const compressed = await compressImage({
    uri: source.uri,
    width: 0,
    height: 0,
    fileName: source.name,
    mimeType: source.type,
  } as ImagePicker.ImagePickerAsset);

  const uri = normalizeManipulatorUri(compressed.uri);
  if (!uri.startsWith("file://")) {
    throw new Error(
      `Photo could not be prepared for upload (${uri.split("://")[0] || "unknown"}). Retake it.`
    );
  }

  try {
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      throw new Error("Photo file is missing. Please retake it.");
    }
  } catch (infoErr) {
    if (infoErr instanceof Error && infoErr.message.includes("retake")) {
      throw infoErr;
    }
  }

  return {
    uri,
    type: compressed.mimeType || compressed.type || "image/jpeg",
    name: compressed.fileName || rewriteToJpgName(source.name),
  };
};

const toUploadSource = (asset: ImagePicker.ImagePickerAsset): UploadImageSource => {
  const compressedLike = asset as Partial<CompressedAsset> & ImagePicker.ImagePickerAsset;
  const uri = normalizeManipulatorUri(asset.uri);
  const name =
    compressedLike.fileName ||
    asset.fileName ||
    uri.split("/").pop() ||
    `photo_${Date.now()}.jpg`;
  // Prefer real MIME from compression; never keep picker media-kind ("image").
  const rawType = compressedLike.mimeType || compressedLike.type || asset.mimeType;
  const type =
    rawType && rawType.includes("/")
      ? rawType
      : mime.getType(name) || mime.getType(uri) || "image/jpeg";
  return { uri, type, name };
};

const useImagePicker = ({
  filetype = "image",
  multiple = false,
  limitVideoDuration = { status: false, dur: 0 },
}: Props) => {
  const [selectedImage, setSelectedImage] = useState<UploadImageSource | null>(
    null
  );
  const [isLimitError, setIsLimitError] = useState(false);

  const handleImageSave = (assets: ImagePicker.ImagePickerAsset[]) => {
    const source = toUploadSource(assets[0]);

    if (source.type.startsWith("video") && limitVideoDuration.status) {
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

    const kind = source.type.includes("/")
      ? source.type.split("/")[0]
      : source.type;
    if (kind === filetype || source.type.includes(filetype)) {
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
      const source = toUploadSource(item);

      if (filetype === "all") {
        sources.push(source);
        return;
      }

      const kind = source.type.includes("/")
        ? source.type.split("/")[0]
        : source.type;
      if (kind === filetype || source.type.includes(filetype)) {
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

  const libraryOptions = {
    quality: 1 as const,
    // Prefer a JPEG-compatible representation on iOS Photos (avoids HEIC/ph://
    // paths that RN multipart cannot stream).
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    mediaTypes:
      filetype === "all"
        ? ImagePicker.MediaTypeOptions.All
        : filetype === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
    allowsMultipleSelection: multiple,
  };

  /** Open the photo library. */
  const showImagePicker = async () => {
    const result = await ImagePicker.launchImageLibraryAsync(libraryOptions);
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
            try {
              const compressed = await compressImage(asset);
              result.assets[i] = compressed as unknown as ImagePicker.ImagePickerAsset;
            } catch (err) {
              console.warn("compressImage failed for library asset:", err);
              showMessage({
                message:
                  "Could not prepare that photo. Try another image or take a new one.",
                type: "warning",
                duration: 4000,
              });
              return;
            }
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
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled) {
        setIsLimitError(false);

        // Camera always returns an image; compress before handing off. Pass
        // the whole asset so the returned object carries a proper fileName
        // and `image/jpeg` mime (RN multipart rejects undefined name/type).
        if (filetype === "image" && result.assets[0]?.uri) {
          try {
            const compressed = await compressImage(result.assets[0]);
            result.assets[0] = compressed as unknown as ImagePicker.ImagePickerAsset;
          } catch (err) {
            console.warn("compressImage failed for camera asset:", err);
            showMessage({
              message:
                "Could not prepare that photo. Please try again or choose from gallery.",
              type: "warning",
              duration: 4000,
            });
            return;
          }
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
