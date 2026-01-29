// File: useImagePicker.js

import * as ImagePicker from "expo-image-picker";

import mime from "mime";
import { showMessage } from "react-native-flash-message";
import { useState } from "react";

// import { getMimeType } from "@qeepsake/react-native-file-utils";

// import { fileTypeFromFile } from "file-type";

const useImagePicker = ({
  filetype = "image",
  multiple = false,
  limitVideoDuration = { status: false, dur: 0 },
}) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [isLimitError, setIsLimitError] = useState(false);

  const showImagePicker = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      mediaTypes:
        filetype === "all"
          ? ImagePicker.MediaTypeOptions.All
          : filetype === "image"
          ? ImagePicker.MediaTypeOptions.Images
          : ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: multiple,
      // allowsEditing: true,
    });
    if (!result.canceled) {
      setIsLimitError(false);
      // console.log(result.assets);
      if (multiple) {
        handleImageSaveMultiple(result.assets);
      } else {
        handleImageSave(result.assets);
      }
    } else {
      console.log("cancelled");
    }
  };

  const handleImageSave = (assets: ImagePicker.ImagePickerAsset[]) => {
    const uri = assets[0].uri;
    const nm = uri.split("/");
    const name = nm[nm.length - 1];
    const type = mime.getType(uri) || assets[0].type;

    const source = {
      uri,
      type,
      name,
    };

    if (type === "video" && limitVideoDuration.status) {
      if (assets[0]?.duration > limitVideoDuration?.dur) {
        setIsLimitError(true);
        showMessage({
          message: `Please select a valid video - 40 secs or less`,
          type: "warning",
          duration: 3500,
        });
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

  const handleImageSaveMultiple = (assets) => {
    let sources = [];
    assets.forEach((item) => {
      const uri = item.uri;
      const nm = uri.split("/");
      const name = nm[nm.length - 1];
      const type = mime.getType(uri);

      const source = {
        uri,
        type,
        name,
      };
      // console.log(source);

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

    console.log(sources, "tvbg");
  };

  const clearImage = () => {
    setSelectedImage(null);
  };

  return {
    selectedImage,
    showImagePicker,
    clearImage,
    isLimitError,
  };
};

export default useImagePicker;
