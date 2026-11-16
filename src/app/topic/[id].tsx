import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { C } from "../../lib/theme";
import { USER_ID } from "../../lib/user";

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View
      style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

function Pulse({ children }: { children: React.ReactNode }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ transform: [{ scale: a }] }}>{children}</Animated.View>;
}

const SOURCE_ICON: Record<string, string> = { syllabus: "🎓", course: "🎓", book: "📖", channel: "▶️", article: "📄" };
// ---------- Constellation layout ----------
// Each unit is a bright star; its lessons are smaller stars joined by lines,
// and the last lesson links down to the next unit's star.
const UNIT_H = 400;
const STAR_Y = 92;
const PATTERNS: [number, number][][] = [
  [[0.24, 182], [0.7, 260], [0.36, 340]],
  [[0.76, 182], [0.3, 262], [0.64, 340]],
];

type Pt = { x: number; y: number };

function Segment({ a, b, lit }: { a: Pt; b: Pt; lit: boolean }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (a.x + b.x) / 2 - len / 2,
        top: (a.y + b.y) / 2 - 1,
        width: len,
        height: lit ? 2 : 1.5,
        backgroundColor: lit ? C.mint : "rgba(160,170,255,0.22)",
        shadowColor: lit ? C.mint : "transparent",
        shadowOpacity: lit ? 0.9 : 0,
        shadowRadius: 6,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

// Deterministic tiny starfield so it does not flicker between renders.
function Starfield({ width, height, seed }: { width: number; height: number; seed: number }) {
  const dots = [];
  let r = seed * 9301 + 49297;
  const rand = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  for (let i = 0; i < 26; i++) {
    const size = rand() < 0.15 ? 2.5 : 1.4;
    dots.push(
      <View
        key={i}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: rand() * width,
          top: rand() * height,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: "#fff",
          opacity: 0.15 + rand() * 0.45,
        }}
      />,
    );
  }
  return <>{dots}</>;
}

export default function Roadmap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useQuery(api.topics.roadmap, { topicId: id as Id<"topics">, userId: USER_ID });
  const { width } = useWindowDimensions();

  if (data === undefined) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  if (data === null) return <View style={s.center}><Text style={s.muted}>Course not found</Text></View>;
  const { topic, units, streak, completed } = data;
  const total = units.reduce((n, u) => n + u.lessons.length, 0);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.top}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={s.back}>‹</Text>
        </Pressable>
        <View style={s.stats}>
          <Text style={s.stat}>🔥 {streak.current}</Text>
          <Text style={s.stat}>⚡ {streak.xp} XP</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.wrap}>
        <Text style={s.emoji}>{topic.emoji ?? "✨"}</Text>
        <Text style={s.title}>{topic.title}</Text>
        {topic.status === "planning" && !units.length && (
          <View style={s.planning}>
            <ActivityIndicator color={C.accent} />
            <Text style={s.muted}>Designing your course from real syllabi…</Text>
          </View>
        )}
        {topic.status === "failed" && <Text style={[s.muted, { color: C.red }]}>Couldn't build this course: {topic.error}</Text>}

        <View style={s.sources}>
          <Text style={s.builtFrom}>Built from</Text>
          {topic.sources.length ? (
            topic.sources.map((src, i) => (
              <FadeIn key={src.title} delay={i * 120}>
                <Pressable onPress={() => src.url && Linking.openURL(src.url)} style={s.source}>
                  <Text style={s.sourceText} numberOfLines={1}>
                    {SOURCE_ICON[src.kind] ?? "📄"} {src.title}
                  </Text>
                </Pressable>
              </FadeIn>
            ))
          ) : topic.sourcesStatus === "searching" ? (
            <Text style={s.mutedSmall}>searching real curricula…</Text>
          ) : (
            <Text style={s.mutedSmall}>top YouTube teachers</Text>
          )}
        </View>

        {units.map((u, ui) => {
          const W = width - 48;
          const star = { x: W / 2, y: STAR_Y };
          const pts = u.lessons.map((_, li) => {
            const p = PATTERNS[ui % 2][li % 3];
            return { x: p[0] * W, y: p[1] };
          });
          const allDone = u.lessons.length > 0 && u.lessons.every((l) => l.done);
          const anyOpen = u.lessons.some((l) => l.unlocked);
          const chain = [star, ...pts];
          const last = pts[pts.length - 1] ?? star;
          return (
            <FadeIn key={u._id}>
              <View style={{ height: UNIT_H, width: W }}>
                <Starfield width={W} height={UNIT_H} seed={ui + 1} />
                {/* link from the previous unit */}
                {ui > 0 && <Segment a={{ x: W / 2, y: 0 }} b={star} lit={u.lessons[0]?.unlocked ?? false} />}
                {chain.slice(1).map((p, i) => (
                  <Segment key={i} a={chain[i]} b={p} lit={!!u.lessons[i]?.unlocked && (i === 0 || !!u.lessons[i - 1]?.done)} />
                ))}
                {ui < units.length - 1 && <Segment a={last} b={{ x: W / 2, y: UNIT_H }} lit={allDone} />}

                {/* unit star */}
                <View style={[s.unitHead, { width: W }]}>
                  <Text style={s.unitLabel}>UNIT {ui + 1}</Text>
                  <Text style={s.unitTitle} numberOfLines={1}>{u.title}</Text>
                </View>
                <View style={[s.unitStar, { left: star.x - 30, top: star.y - 30 }, allDone ? s.unitStarDone : anyOpen ? s.unitStarOpen : null]}>
                  <Text style={[s.unitStarIcon, allDone && { color: C.bg }]}>★</Text>
                </View>

                {u.lessons.map((l, li) => {
                  const p = pts[li];
                  const right = p.x < W / 2;
                  const size = l.unlocked && !l.done ? 52 : 40;
                  const node = (
                    <View
                      style={[
                        s.star,
                        { width: size, height: size, borderRadius: size / 2 },
                        l.done && s.starDone,
                        l.unlocked && !l.done && s.starOpen,
                      ]}
                    >
                      <Text style={[s.starIcon, l.done && { color: C.bg }]}>{l.done ? "✓" : l.unlocked ? "▶" : "✦"}</Text>
                    </View>
                  );
                  return (
                    <Pressable
                      key={l._id}
                      testID={`lesson-${l.order}`}
                      disabled={!l.unlocked}
                      onPress={() => router.push(`/lesson/${l._id}`)}
                      hitSlop={10}
                      style={{ position: "absolute", left: p.x - size / 2, top: p.y - size / 2 }}
                    >
                      {l.unlocked && !l.done ? <Pulse>{node}</Pulse> : node}
                      <View
                        style={[
                          s.label,
                          right ? { left: size + 10 } : { right: size + 10, alignItems: "flex-end" },
                          { top: size / 2 - 18 },
                        ]}
                        pointerEvents="none"
                      >
                        <Text style={[s.lessonTitle, !l.unlocked && { color: C.muted }, !right && { textAlign: "right" }]} numberOfLines={2}>
                          {l.title}
                        </Text>
                        {l.unlocked && !l.done && (
                          <Text style={s.lessonHint} numberOfLines={1}>
                            {l.status === "ready" ? `Ready · ${l.channel ?? ""}` : "Preparing your clip…"}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </FadeIn>
          );
        })}

        {topic.goal && topic.status === "ready" && (
          <FadeIn delay={200}>
            <View style={s.goal}>
              <Text style={s.goalLabel}>🏁 YOUR GOAL</Text>
              <Text style={s.goalText}>{topic.goal}</Text>
              <Text style={s.goalDay}>
                Day {Math.min(completed + 1, topic.days ?? total)} of {topic.days ?? total} · {completed}/{total} lessons
              </Text>
            </View>
          </FadeIn>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 8 },
  back: { color: C.text, fontSize: 34, lineHeight: 34 },
  stats: { flexDirection: "row", gap: 14 },
  stat: { color: C.gold, fontWeight: "800", fontSize: 16 },
  wrap: { padding: 24, paddingBottom: 80 },
  emoji: { fontSize: 44 },
  title: { color: C.text, fontSize: 30, fontWeight: "800", marginTop: 6 },
  planning: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 16 },
  muted: { color: C.muted, fontSize: 15 },
  mutedSmall: { color: C.muted, fontSize: 13 },
  sources: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 14 },
  builtFrom: { color: C.muted, fontSize: 13, marginRight: 4 },
  source: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.line, maxWidth: 260 },
  sourceText: { color: C.text, fontSize: 12 },
  unitHead: { position: "absolute", top: 4, left: 0, alignItems: "center" },
  unitLabel: { color: C.accent, fontWeight: "800", fontSize: 11, letterSpacing: 2 },
  unitTitle: { color: C.text, fontWeight: "700", fontSize: 18, marginTop: 2, letterSpacing: 0.2 },
  unitStar: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,92,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(160,170,255,0.25)",
  },
  unitStarOpen: {
    backgroundColor: "rgba(124,92,255,0.28)",
    borderColor: C.accent,
    shadowColor: C.accent,
    shadowOpacity: 0.9,
    shadowRadius: 18,
  },
  unitStarDone: { backgroundColor: C.gold, borderColor: C.gold, shadowColor: C.gold, shadowOpacity: 0.9, shadowRadius: 18 },
  unitStarIcon: { color: C.gold, fontSize: 28, fontWeight: "800" },
  star: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(160,170,255,0.28)",
  },
  starOpen: { backgroundColor: C.accent, borderColor: "#B9A8FF", shadowColor: C.accent, shadowOpacity: 1, shadowRadius: 16 },
  starDone: { backgroundColor: C.mint, borderColor: C.mint, shadowColor: C.mint, shadowOpacity: 0.9, shadowRadius: 12 },
  starIcon: { color: "#fff", fontSize: 18, fontWeight: "800" },
  label: { position: "absolute", width: 150 },
  lessonTitle: { color: C.text, fontWeight: "700", fontSize: 14, lineHeight: 18 },
  lessonHint: { color: C.mint, fontSize: 11, marginTop: 2 },
  goal: { marginTop: 36, backgroundColor: C.accentSoft, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.accent },
  goalLabel: { color: C.gold, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  goalText: { color: C.text, fontSize: 17, fontWeight: "700", marginTop: 6, lineHeight: 23 },
  goalDay: { color: C.muted, marginTop: 8 },
});
