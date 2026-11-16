import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A quiet night sky behind a screen: fixed stars, a few of which twinkle. */
export function StarField({ width, height, seed = 11 }: { width: number; height: number; seed?: number }) {
  const stars = useMemo(() => {
    const r = rng(seed);
    const n = Math.round((width * height) / 9000);
    return Array.from({ length: n }, (_, i) => {
      const big = r() > 0.88;
      return {
        x: r() * width,
        y: r() * height,
        size: big ? 2.4 + r() * 1.2 : 1 + r() * 1.1,
        o: big ? 0.75 : 0.18 + r() * 0.45,
        twinkles: i % 7 === 0,
      };
    });
  }, [width, height, seed]);

  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  const twinkle = a.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.95] });

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {stars.map((st, i) => {
        const base = {
          position: "absolute" as const,
          left: st.x,
          top: st.y,
          width: st.size,
          height: st.size,
          borderRadius: st.size,
          backgroundColor: "#DCE4FF",
        };
        return st.twinkles ? (
          <Animated.View key={i} style={[base, { opacity: twinkle }]} />
        ) : (
          <View key={i} style={[base, { opacity: st.o }]} />
        );
      })}
    </View>
  );
}
