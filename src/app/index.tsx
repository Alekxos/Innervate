import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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
import { StarField } from "../components/StarField";
import { C } from "../lib/theme";
import { USER_ID } from "../lib/user";

const IDEAS = ["Sourdough baking", "Options pricing", "How jet engines work", "Linear algebra", "Music theory"];

export default function Home() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.topics.create);
  const topics = useQuery(api.topics.list, { userId: USER_ID });
  const { width, height } = useWindowDimensions();

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
          <Text style={s.brand}>✦ INNERVATE</Text>
          <Text style={s.h1}>What do you want to learn?</Text>
          <Text style={s.sub}>Anything. We turn the best teachers on YouTube into a course you'll actually finish.</Text>

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  wrap: { padding: 24, paddingTop: 28, gap: 14, paddingBottom: 60 },
  brand: { color: C.accent, fontWeight: "800", fontSize: 13, letterSpacing: 4 },
  h1: { color: C.text, fontSize: 36, fontWeight: "800", lineHeight: 42, marginTop: 28, letterSpacing: -0.5 },
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
