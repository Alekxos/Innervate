import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
const OFFSETS = [0, 60, 90, 60, 0, -60, -90, -60];

export default function Roadmap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const data = useQuery(api.topics.roadmap, { topicId: id as Id<"topics">, userId: USER_ID });

  if (data === undefined) return <View style={s.center}><ActivityIndicator color={C.accent} /></View>;
  if (data === null) return <View style={s.center}><Text style={s.muted}>Course not found</Text></View>;
  const { topic, units, streak, completed } = data;
  const total = units.reduce((n, u) => n + u.lessons.length, 0);
  let idx = 0;

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

        {units.map((u, ui) => (
          <FadeIn key={u._id}>
            <View style={s.unit}>
              <Text style={s.unitLabel}>UNIT {ui + 1}</Text>
              <Text style={s.unitTitle}>{u.title}</Text>
            </View>
            {u.lessons.map((l) => {
              const offset = OFFSETS[idx++ % OFFSETS.length];
              const node = (
                <View
                  style={[
                    s.node,
                    l.done && { backgroundColor: C.mint, borderColor: C.mintSoft },
                    l.unlocked && !l.done && { backgroundColor: C.accent, borderColor: C.accentSoft },
                  ]}
                >
                  <Text style={s.nodeIcon}>{l.done ? "✓" : l.unlocked ? "▶" : "🔒"}</Text>
                </View>
              );
              return (
                <FadeIn key={l._id}>
                  <Pressable
                    testID={`lesson-${l.order}`}
                    disabled={!l.unlocked}
                    onPress={() => router.push(`/lesson/${l._id}`)}
                    style={[s.nodeRow, { transform: [{ translateX: offset }] }]}
                  >
                    {l.unlocked && !l.done ? <Pulse>{node}</Pulse> : node}
                    <View style={{ maxWidth: 180 }}>
                      <Text style={[s.lessonTitle, !l.unlocked && { color: C.muted }]}>{l.title}</Text>
                      {l.unlocked && !l.done && (
                        <Text style={s.lessonHint}>
                          {l.status === "ready" ? `Ready · ${l.channel ?? ""}` : "Preparing your clip…"}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                </FadeIn>
              );
            })}
          </FadeIn>
        ))}

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
  unit: { marginTop: 30, marginBottom: 10, backgroundColor: C.card, borderRadius: 16, padding: 14 },
  unitLabel: { color: C.accent, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  unitTitle: { color: C.text, fontWeight: "700", fontSize: 18, marginTop: 2 },
  nodeRow: { flexDirection: "row", alignItems: "center", gap: 14, alignSelf: "center", marginVertical: 10 },
  node: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.cardHi,
    borderWidth: 5,
    borderColor: C.line,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeIcon: { color: "#fff", fontSize: 24, fontWeight: "800" },
  lessonTitle: { color: C.text, fontWeight: "700", fontSize: 15 },
  lessonHint: { color: C.mint, fontSize: 12, marginTop: 2 },
  goal: { marginTop: 36, backgroundColor: C.accentSoft, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.accent },
  goalLabel: { color: C.gold, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  goalText: { color: C.text, fontSize: 17, fontWeight: "700", marginTop: 6, lineHeight: 23 },
  goalDay: { color: C.muted, marginTop: 8 },
});
