import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { Mascot } from "../components/Mascot";
import { StarField } from "../components/StarField";
import { C } from "../lib/theme";
import { USER_ID } from "../lib/user";

// Show Nova's hello once per app launch.
let introSeen = false;

function Intro({ onClose }: { onClose: () => void }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }).start();
  }, [a]);
  return (
    <Pressable testID="intro" style={s.overlay} onPress={onClose}>
      <Animated.View
        style={{
          transform: [
            { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [-320, 0] }) },
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [260, 0] }) },
            { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ["-40deg", "0deg"] }) },
          ],
        }}
      >
        <Mascot size={132} flying />
      </Animated.View>
      <Animated.View
        style={[
          s.bubble,
          { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        ]}
      >
        <Text style={s.bubbleHi}>Hi, I'm Nova! ✦</Text>
        <Text style={s.bubbleText}>
          I'm your moon rabbit guide. Tell me anything you want to learn, and I'll chart it as a constellation of
          two-minute lessons from the best teachers on YouTube.
        </Text>
        <View style={s.bubbleBtn}>
          <Text style={s.bubbleBtnText}>Let's explore</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const IDEAS = ["Sourdough baking", "Options pricing", "How jet engines work", "Linear algebra", "Music theory"];

export default function Home() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.topics.create);
  const topics = useQuery(api.topics.list, { userId: USER_ID });
  const { width, height } = useWindowDimensions();
  const [intro, setIntro] = useState(!introSeen);
  const resetDemo = useMutation(api.topics.resetDemo);

  // Nova zooms in from the left, then dashes across the header every few seconds.
  const zoom = useRef(new Animated.Value(-1)).current;
  const dash = Math.max(120, width - 190);
  useEffect(() => {
    const flyIn = Animated.spring(zoom, { toValue: 0, friction: 6, tension: 50, useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(4200),
        Animated.timing(zoom, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.delay(180),
        Animated.timing(zoom, { toValue: 0, duration: 620, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    flyIn.start(() => loop.start());
    return () => {
      flyIn.stop();
      loop.stop();
    };
  }, [zoom]);

  function closeIntro() {
    introSeen = true;
    setIntro(false);
  }

  async function go(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const id = await create({ query: q, userId: USER_ID });
      setText("");
      router.push(`/topic/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StarField width={width} height={height} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Animated.View
              style={{
                zIndex: 5,
                transform: [
                  { translateX: zoom.interpolate({ inputRange: [-1, 0, 1], outputRange: [-260, 0, dash] }) },
                  { rotate: zoom.interpolate({ inputRange: [-1, 0, 0.5, 1], outputRange: ["-25deg", "0deg", "16deg", "0deg"] }) },
                ],
              }}
            >
              <Pressable testID="nova" onPress={() => { resetDemo({ userId: USER_ID }).catch(() => {}); setIntro(true); }} hitSlop={8}>
                <Mascot size={56} flying />
              </Pressable>
            </Animated.View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.brand}>✦ INNERVATE</Text>
              <Text style={s.tagline}>
                Duolingo for <Text style={s.taglineEm}>anything</Text>
              </Text>
            </View>
          </View>
          <Text style={s.h1}>What do you want to learn?</Text>
          <Text style={s.sub}>
            Anything. Nova, your moon rabbit guide, turns the best teachers on YouTube into a course you'll actually finish.
          </Text>

          <View style={s.inputRow}>
            <TextInput
              testID="topic-input"
              value={text}
              onChangeText={setText}
              placeholder="e.g. how jet engines work"
              placeholderTextColor={C.muted}
              style={s.input}
              returnKeyType="go"
              onSubmitEditing={() => go(text)}
              autoCorrect={false}
            />
            <Pressable testID="topic-go" onPress={() => go(text)} style={[s.go, !text.trim() && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>Go</Text>}
            </Pressable>
          </View>

          <View style={s.chips}>
            {IDEAS.map((i) => (
              <Pressable key={i} onPress={() => go(i)} style={s.chip}>
                <Text style={s.chipText}>{i}</Text>
              </Pressable>
            ))}
          </View>

          {!!topics?.length && <Text style={s.section}>Your courses</Text>}
          {topics?.map((t) => (
            <Pressable key={t._id} onPress={() => router.push(`/topic/${t._id}`)} style={s.course}>
              <View style={s.courseBadge}>
                <Text style={s.courseEmoji}>{t.emoji ?? "📘"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.courseTitle}>{t.title}</Text>
                <Text style={s.courseSub} numberOfLines={1}>
                  {t.status === "planning" ? "Designing your course…" : t.goal}
                </Text>
              </View>
              <Text style={s.chev}>›</Text>
            </Pressable>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
      {intro && <Intro onClose={closeIntro} />}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 24, paddingTop: 28, gap: 14, paddingBottom: 60 },
  // Right padding keeps the header clear of Expo Go's floating tools button.
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 52, zIndex: 5 },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(5,7,20,0.88)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    zIndex: 50,
  },
  bubble: {
    marginTop: 14,
    backgroundColor: C.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(201,190,255,0.45)",
    padding: 24,
    gap: 12,
    alignSelf: "stretch",
    shadowColor: C.accent,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  bubbleHi: { color: C.text, fontSize: 26, fontWeight: "800", textAlign: "center" },
  bubbleText: { color: "#C9CFEE", fontSize: 16, lineHeight: 24, textAlign: "center" },
  bubbleBtn: { backgroundColor: C.accent, borderRadius: 18, paddingVertical: 15, alignItems: "center", marginTop: 6 },
  bubbleBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  brand: { color: C.accent, fontWeight: "800", fontSize: 13, letterSpacing: 4 },
  tagline: { color: C.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.2 },
  taglineEm: { color: C.gold, fontStyle: "italic", fontWeight: "800" },
  h1: { color: C.text, fontSize: 36, fontWeight: "800", lineHeight: 42, marginTop: 18, letterSpacing: -0.5 },
  sub: { color: C.muted, fontSize: 16, lineHeight: 23 },
  inputRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    backgroundColor: C.card,
    color: C.text,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 17,
    fontSize: 17,
    borderWidth: 1,
    borderColor: C.line,
  },
  go: {
    backgroundColor: C.accent,
    borderRadius: 20,
    paddingHorizontal: 24,
    justifyContent: "center",
    shadowColor: C.accent,
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  goText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  chip: {
    backgroundColor: "rgba(143,124,255,0.10)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "rgba(143,124,255,0.32)",
  },
  chipText: { color: "#DAD5FF", fontSize: 14, fontWeight: "600" },
  section: { color: C.muted, fontWeight: "700", marginTop: 28, textTransform: "uppercase", fontSize: 12, letterSpacing: 2 },
  course: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.card,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.line,
  },
  courseBadge: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.cardHi, alignItems: "center", justifyContent: "center" },
  courseEmoji: { fontSize: 26 },
  courseTitle: { color: C.text, fontWeight: "700", fontSize: 17 },
  courseSub: { color: C.muted, fontSize: 13, marginTop: 3 },
  chev: { color: C.muted, fontSize: 26 },
});
