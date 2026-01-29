import { ms, mvs, s, vs } from 'react-native-size-matters';

import { Dimensions } from 'react-native';

const {width, height} = Dimensions.get('window');
const guidelineBaseWidth = 428;
const guidelineBaseHeight = 926;
const WINDOW_HEIGHT = height;
const WINDOW_WIDTH = width;

const horizontalScale = (size:number) => {
  return s(size);
};
const verticalScale = (size:number) => {
  return vs(size);
};

const moderateScale = (size:number, factor = 0.5) => {
  return ms(size , factor);
};
// const horizontalScale = (size:number) => {
//   return (width / guidelineBaseWidth) * size;
// };
// const verticalScale = (size:number) => {
//   return (height / guidelineBaseHeight) * size;
// };

// const moderateScale = (size:number, factor = 0.5) => {
//   return size + (horizontalScale(size) - size) * factor;
// };

export {
  horizontalScale,
  verticalScale,
  moderateScale,
  WINDOW_HEIGHT,
  WINDOW_WIDTH,
};