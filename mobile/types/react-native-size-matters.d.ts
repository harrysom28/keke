declare module 'react-native-size-matters' {
  export function scale(size: number): number;
  export function verticalScale(size: number): number;
  export function moderateScale(size: number, factor?: number): number;
  export function s(size: number): number;
  export function vs(size: number): number;
  export function ms(size: number, factor?: number): number;
  export function mvs(size: number, factor?: number): number;
}

