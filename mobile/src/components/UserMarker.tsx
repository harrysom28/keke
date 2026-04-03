import React, { memo, useMemo } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { Marker } from "react-native-maps";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

/** Logical coords: center (26,26), viewBox padded so the cone isn’t clipped. */
const VB = "-10 -10 72 72";
const CX = 26;
const CY = 26;
const BRAND = "#3C8F7C";

const DISPLAY = 56;

interface UserMarkerProps {
  latitude: number;
  longitude: number;
  /** Degrees clockwise from north; invalid values fall back to 0 (cone points north). */
  heading?: number | null;
}

/** Build a triangular sector pointing “north” in SVG space (before Marker rotation). */
function conePathD(radius: number, halfAngleDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180;
  const north = -Math.PI / 2;
  const left = north - rad(halfAngleDeg);
  const right = north + rad(halfAngleDeg);
  const p1x = CX + radius * Math.cos(left);
  const p1y = CY + radius * Math.sin(left);
  const p2x = CX + radius * Math.cos(right);
  const p2y = CY + radius * Math.sin(right);
  return `M ${CX} ${CY} L ${p1x} ${p1y} L ${p2x} ${p2y} Z`;
}

const CONE_PATH = conePathD(36, 40);

/**
 * Google/Bolt-style: soft green heading cone + white halo + solid green dot (brand green).
 */
function UserPuck() {
  return (
    <View style={styles.puckShadow}>
      <Svg width={DISPLAY} height={DISPLAY} viewBox={VB}>
        <Defs>
          <LinearGradient
            id="userHeadingCone"
            x1={CX}
            y1={CY}
            x2={CX}
            y2={-6}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={BRAND} stopOpacity={0.55} />
            <Stop offset="0.35" stopColor={BRAND} stopOpacity={0.2} />
            <Stop offset="0.7" stopColor={BRAND} stopOpacity={0.06} />
            <Stop offset="1" stopColor={BRAND} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Directional beam (behind dot) */}
        <Path d={CONE_PATH} fill="url(#userHeadingCone)" />
        {/* White halo */}
        <Circle cx={CX} cy={CY} r={19} fill="#FFFFFF" stroke="rgba(0,0,0,0.07)" strokeWidth={1} />
        {/* Solid location dot */}
        <Circle cx={CX} cy={CY} r={11.5} fill={BRAND} />
      </Svg>
    </View>
  );
}

function UserMarkerComponent({ latitude, longitude, heading }: UserMarkerProps) {
  const rotation = useMemo(() => {
    if (heading == null || Number.isNaN(heading)) return 0;
    const h = heading % 360;
    return h < 0 ? h + 360 : h;
  }, [heading]);

  if (latitude === 0 && longitude === 0) return null;

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      tracksViewChanges={false}
      zIndex={1000}
    >
      {/* Custom SVG ignores Marker `rotation` on some platforms; rotate the view (clockwise from north, same as maps). */}
      <View
        style={[styles.wrap, { transform: [{ rotate: `${rotation}deg` }] }]}
        pointerEvents="none"
      >
        <UserPuck />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  puckShadow: {
    width: DISPLAY,
    height: DISPLAY,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
      },
      android: { elevation: 5 },
    }),
  },
  wrap: {
    width: DISPLAY,
    height: DISPLAY,
    alignItems: "center",
    justifyContent: "center",
  },
});

export const UserMarker = memo(
  UserMarkerComponent,
  (prev, next) =>
    prev.latitude === next.latitude &&
    prev.longitude === next.longitude &&
    Math.round((prev.heading ?? 0) * 4) === Math.round((next.heading ?? 0) * 4)
);
