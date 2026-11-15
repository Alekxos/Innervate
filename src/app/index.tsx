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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { C } from "../lib/theme";
import { USER_ID } from "../lib/user";

const IDEAS = ["Sourdough baking", "Options pricing", "How jet engines work", "Linear algebra", "Music theory"];

export default function Home() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useMutation(api.topics.create);
  const topics = useQuery(api.topics.list, { userId: USER_ID });

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
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <Text style={s.brand}>innervate</Text>
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
              <Text style={s.courseEmoji}>{t.emoji ?? "📘"}</Text>
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
  wrap: { padding: 24, paddingTop: 32, gap: 14 },
  brand: { color: C.accent, fontWeight: "800", fontSize: 18, letterSpacing: 1 },
  h1: { color: C.text, fontSize: 34, fontWeight: "800", lineHeight: 40, marginTop: 24 },
  sub: { color: C.muted, fontSize: 16, lineHeight: 22 },
  inputRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  input: {
    flex: 1,
    backgroundColor: C.card,
    color: C.text,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 17,
    borderWidth: 1,
    borderColor: C.line,
  },
  go: { backgroundColor: C.accent, borderRadius: 16, paddingHorizontal: 22, justifyContent: "center" },
  goText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.line },
  chipText: { color: C.text, fontSize: 14 },
  section: { color: C.muted, fontWeight: "700", marginTop: 24, textTransform: "uppercase", fontSize: 12, letterSpacing: 1 },
  course: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: C.card, padding: 16, borderRadius: 18 },
  courseEmoji: { fontSize: 30 },
  courseTitle: { color: C.text, fontWeight: "700", fontSize: 17 },
  courseSub: { color: C.muted, fontSize: 13, marginTop: 2 },
  chev: { color: C.muted, fontSize: 28 },
});
