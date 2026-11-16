import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";
import { C } from "../lib/theme";

/**
 * Nova, the moon rabbit: Innervate's guide through the constellations.
 * Drawn from plain views and one emoji, so it needs no image assets.
 */
export function Mascot({ size = 64 }: { size?: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const s = size;
  const box = s * 1.3;
  return (
    <Animated.View
      style={{
        width: box,
        height: box,
        alignItems: "center",
        justifyContent: "center",
        transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [2, -4] }) }],
      }}
    >
      {/* Antenna with a little star on top */}
      <View style={{ position: "absolute", top: s * 0.04, width: 2, height: s * 0.16, backgroundColor: "#C9BEFF" }} />
      <View
        style={{
          position: "absolute",
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
      {/* Suit collar, tucked under the helmet */}
      <View
        style={{
          position: "absolute",
          bottom: s * 0.05,
          width: s * 0.6,
          height: s * 0.2,
          borderRadius: s,
          backgroundColor: "#C9BEFF",
        }}
      />
      {/* Glass helmet */}
      <View
        style={{
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: "#1B1F4B",
          borderWidth: Math.max(2, s * 0.05),
          borderColor: "#C9BEFF",
          alignItems: "center",
          justifyContent: "center",
          shadowColor: C.accent,
          shadowOpacity: 0.9,
          shadowRadius: s * 0.22,
          shadowOffset: { width: 0, height: 0 },
        }}
      >
        <Text style={{ fontSize: s * 0.54, lineHeight: s * 0.68, textAlign: "center" }}>🐰</Text>
        {/* Reflection on the glass */}
        <View
          style={{
            position: "absolute",
            top: s * 0.1,
            left: s * 0.14,
            width: s * 0.22,
            height: s * 0.09,
            borderRadius: s,
            backgroundColor: "rgba(255,255,255,0.5)",
            transform: [{ rotate: "-30deg" }],
          }}
        />
      </View>
      {/* Sparkles */}
      <Text style={{ position: "absolute", right: 0, top: s * 0.14, color: C.gold, fontSize: s * 0.2 }}>✦</Text>
      <Text style={{ position: "absolute", left: 0, bottom: s * 0.2, color: C.mint, fontSize: s * 0.15 }}>✦</Text>
    </Animated.View>
  );
}
