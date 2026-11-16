import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { C } from "../lib/theme";

const INK = "#1B1F4B";
const FUR = "#FFFFFF";
const PINK = "#FF9EC4";
const GLASS = "#C9BEFF";

/**
 * Nova, the moon rabbit: Innervate's guide through the constellations.
 * Drawn entirely from plain views, so it needs no image assets.
 * `flying` lights her jetpack.
 */
export function Mascot({ size = 64, flying = false }: { size?: number; flying?: boolean }) {
  const bob = useRef(new Animated.Value(0)).current;
  const flame = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    );
    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(flame, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.timing(flame, { toValue: 0, duration: 130, useNativeDriver: true }),
      ]),
    );
    loop.start();
    flicker.start();
    return () => {
      loop.stop();
      flicker.stop();
    };
  }, [bob, flame]);

  const s = size;
  const W = s * 1.24;
  const H = s * 1.5;
  const hx = s * 0.12; // helmet left
  const hy = s * 0.16; // helmet top

  const ear = (left: number, tilt: string) => (
    <View
      style={{
        position: "absolute",
        left,
        top: s * 0.07,
        width: s * 0.16,
        height: s * 0.42,
        borderRadius: s * 0.08,
        backgroundColor: FUR,
        alignItems: "center",
        transform: [{ rotate: tilt }],
      }}
    >
      <View style={{ marginTop: s * 0.05, width: s * 0.07, height: s * 0.24, borderRadius: s * 0.04, backgroundColor: PINK }} />
    </View>
  );

  const eye = (left: number) => (
    <View
      style={{
        position: "absolute",
        left,
        top: s * 0.16,
        width: s * 0.085,
        height: s * 0.115,
        borderRadius: s * 0.05,
        backgroundColor: INK,
      }}
    >
      <View style={{ position: "absolute", left: s * 0.012, top: s * 0.014, width: s * 0.034, height: s * 0.034, borderRadius: s, backgroundColor: "#fff" }} />
    </View>
  );

  const cheek = (left: number) => (
    <View
      style={{ position: "absolute", left, top: s * 0.285, width: s * 0.1, height: s * 0.065, borderRadius: s, backgroundColor: PINK, opacity: 0.75 }}
    />
  );

  return (
    <Animated.View
      style={{
        width: W,
        height: H,
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [2, -4] }) }],
      }}
    >
      {/* Jetpack flame */}
      <Animated.View
        style={{
          position: "absolute",
          left: W / 2 - s * 0.09,
          top: hy + s * 1.04,
          width: s * 0.18,
          height: s * 0.26,
          borderTopLeftRadius: s * 0.05,
          borderTopRightRadius: s * 0.05,
          borderBottomLeftRadius: s * 0.12,
          borderBottomRightRadius: s * 0.12,
          backgroundColor: C.gold,
          opacity: flying ? flame.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) : 0,
          transform: [{ scaleY: flame.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.15] }) }],
          shadowColor: C.gold,
          shadowOpacity: 1,
          shadowRadius: s * 0.12,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      {/* Antenna with a little star on top */}
      <View style={{ position: "absolute", left: W / 2 - 1, top: s * 0.07, width: 2, height: s * 0.12, backgroundColor: GLASS }} />
      <View
        style={{
          position: "absolute",
          left: W / 2 - s * 0.065,
          top: 0,
          width: s * 0.13,
          height: s * 0.13,
          borderRadius: s,
          backgroundColor: C.gold,
          shadowColor: C.gold,
          shadowOpacity: 1,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      {/* Suit, tucked under the helmet */}
      <View
        style={{
          position: "absolute",
          left: W / 2 - s * 0.27,
          top: hy + s * 0.86,
          width: s * 0.54,
          height: s * 0.24,
          borderRadius: s * 0.12,
          backgroundColor: GLASS,
        }}
      />
      {/* Helmet glow */}
      <View
        style={{
          position: "absolute",
          left: hx,
          top: hy,
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: "#232863",
          shadowColor: C.accent,
          shadowOpacity: 0.95,
          shadowRadius: s * 0.22,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      {/* Helmet glass with Nova inside */}
      <View
        style={{
          position: "absolute",
          left: hx,
          top: hy,
          width: s,
          height: s,
          borderRadius: s / 2,
          overflow: "hidden",
          backgroundColor: "#232863",
        }}
      >
        {ear(s * 0.29, "-13deg")}
        {ear(s * 0.55, "13deg")}
        {/* Head */}
        <View
          style={{
            position: "absolute",
            left: s * 0.2,
            top: s * 0.38,
            width: s * 0.6,
            height: s * 0.52,
            borderRadius: s * 0.27,
            backgroundColor: FUR,
          }}
        >
          {eye(s * 0.135)}
          {eye(s * 0.38)}
          {cheek(s * 0.045)}
          {cheek(s * 0.455)}
          {/* Nose */}
          <View
            style={{ position: "absolute", left: s * 0.272, top: s * 0.275, width: s * 0.056, height: s * 0.04, borderRadius: s, backgroundColor: "#FF6FA8" }}
          />
        </View>
        {/* Reflection on the glass */}
        <View
          style={{
            position: "absolute",
            top: s * 0.12,
            left: s * 0.13,
            width: s * 0.2,
            height: s * 0.07,
            borderRadius: s,
            backgroundColor: "rgba(255,255,255,0.45)",
            transform: [{ rotate: "-32deg" }],
          }}
        />
      </View>
      {/* Helmet rim */}
      <View
        style={{
          position: "absolute",
          left: hx,
          top: hy,
          width: s,
          height: s,
          borderRadius: s / 2,
          borderWidth: Math.max(2, s * 0.05),
          borderColor: GLASS,
        }}
      />
      {/* Sparkles */}
      <Text style={{ position: "absolute", right: 0, top: s * 0.2, color: C.gold, fontSize: s * 0.2 }}>✦</Text>
      <Text style={{ position: "absolute", left: 0, top: s * 0.9, color: C.mint, fontSize: s * 0.15 }}>✦</Text>
    </Animated.View>
  );
}
