import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import YoutubePlayer, { YoutubeIframeRef } from "react-native-youtube-iframe";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { C, fmt } from "../../lib/theme";
import { USER_ID } from "../../lib/user";

type Phase = "watch" | "quiz" | "rewind" | "done";

export default function Lesson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lessonId = id as Id<"lessons">;
  const data = useQuery(api.topics.lesson, { lessonId });
  const ensure = useMutation(api.topics.ensureLesson);
  const complete = useMutation(api.topics.complete);

  useEffect(() => {
    ensure({ lessonId });
  }, [ensure, lessonId]);

  const { width } = useWindowDimensions();
  const playerRef = useRef<YoutubeIframeRef | null>(null);
  const seekedAt = useRef(0);
  const [phase, setPhase] = useState<Phase>("watch");
  const [playing, setPlaying] = useState(true);
  const [now, setNow] = useState(0);
  const [qi, setQi] = useState(0);
  const [wrong, setWrong] = useState<number[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [xp, setXp] = useState(0);
  const [result, setResult] = useState<{ streak: number; nextLessonId: Id<"lessons"> | null } | null>(null);

  const lesson = data?.lesson;
  const clip = lesson?.clip;
  const questions = data?.questions ?? [];
  const q = questions[qi];

  // Poll the player clock to stop at the clip end / rewind end and drive captions.
  const endAt = phase === "rewind" && q ? q.rewind.end : clip?.end;
  useEffect(() => {
    if (!playing || !clip) return;
    const t = setInterval(async () => {
      const cur = (await playerRef.current?.getCurrentTime()) ?? 0;
      setNow(cur);
      if (Date.now() - seekedAt.current < 1200) return; // let a seek land first
      if (endAt && cur >= endAt - 0.2) {
        setPlaying(false);
        if (phase === "watch" || phase === "rewind") setPhase("quiz");
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, clip, endAt, phase]);

  const caption = useMemo(() => {
    const lines = lesson?.transcript ?? [];
    return lines.find((l) => now >= l.t && now < l.t + Math.max(l.d, 1.5))?.text;
  }, [lesson?.transcript, now]);

  const answer = useCallback(
    (i: number) => {
      if (!q || picked !== null) return;
      setPicked(i);
      if (i === q.correctIndex) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setXp((x) => x + (wrong.length ? 5 : 10));
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setWrong((w) => [...w, i]);
        // The rewind: jump to the exact seconds that explain the answer.
        setTimeout(() => {
          setPicked(null);
          setPhase("rewind");
          seekedAt.current = Date.now();
          playerRef.current?.seekTo(q.rewind.start, true);
          setPlaying(true);
        }, 900);
      }
    },
    [q, picked, wrong.length],
  );

  async function next() {
    setPicked(null);
    setWrong([]);
    if (qi + 1 < questions.length) {
      setQi(qi + 1);
      return;
    }
    setPhase("done");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResult(await complete({ lessonId, userId: USER_ID, xp: xp }));
  }

  function skipToQuiz() {
    setPlaying(false);
    setPhase("quiz");
  }

  function replayClip() {
    if (!clip) return;
    seekedAt.current = Date.now();
    playerRef.current?.seekTo(clip.start, true);
    setPhase("watch");
    setPlaying(true);
  }

  // ----- Loading / building states -----
  if (!data || !lesson) return <Center><ActivityIndicator color={C.accent} /></Center>;
  if (lesson.status !== "ready" || !clip) {
    return (
      <Center>
        {lesson.status === "failed" ? (
          <>
            <Text style={s.h2}>Couldn't find a great clip</Text>
            <Text style={s.muted}>{lesson.error}</Text>
            <Btn label="Try again" onPress={() => ensure({ lessonId })} />
          </>
        ) : (
          <>
            <ActivityIndicator color={C.accent} size="large" />
            <Text style={s.h2}>{lesson.title}</Text>
            <Text style={s.muted}>{lesson.stage ?? "Finding the best teacher"}…</Text>
          </>
        )}
        <Pressable onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={s.muted}>Back to roadmap</Text>
        </Pressable>
      </Center>
    );
  }

  const playerH = Math.round((width * 9) / 16);
  const clipLen = clip.end - clip.start;
  const progress = Math.min(1, Math.max(0, (now - clip.start) / clipLen));

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.top}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={s.close}>✕</Text>
        </Pressable>
        <View style={s.bar}>
          <View style={[s.barFill, { width: `${phase === "done" ? 100 : ((qi + (phase === "quiz" ? 0.5 : 0)) / Math.max(questions.length, 1)) * 100}%` }]} />
        </View>
        <Text style={s.xp}>⚡ {xp}</Text>
      </View>

      <View style={{ height: playerH, backgroundColor: "#000" }}>
        <YoutubePlayer
          ref={playerRef}
          height={playerH}
          width={width}
          videoId={clip.videoId}
          play={playing}
          onReady={() => {
            seekedAt.current = Date.now();
            playerRef.current?.seekTo(clip.start, true);
          }}
          onChangeState={(st: string) => {
            if (st === "ended") setPlaying(false);
          }}
          initialPlayerParams={{ start: Math.floor(clip.start), controls: false, rel: false, preventFullScreen: true, iv_load_policy: 3 }}
          webViewProps={{ allowsInlineMediaPlayback: true, mediaPlaybackRequiresUserAction: false }}
        />
        {phase === "rewind" && q && (
          <View style={s.rewindBadge}>
            <Text style={s.rewindText}>⏪ Rewinding to {fmt(q.rewind.start)}</Text>
          </View>
        )}
      </View>
      {phase === "watch" && <View style={[s.clipBar, { width: `${progress * 100}%` }]} />}

      <ScrollView contentContainerStyle={s.body}>
        {(phase === "watch" || phase === "rewind") && (
          <>
            <Text style={s.caption}>{phase === "rewind" && q ? `“${q.rewind.quote}”` : caption ?? " "}</Text>
            {phase === "watch" && (
              <>
                <Text style={s.lessonTitle}>{lesson.title}</Text>
                <Text style={s.teacher}>
                  {clip.channel} · {fmt(clip.start)}–{fmt(clip.end)} of “{clip.title}”
                </Text>
                {clip.why && <Text style={s.why}>✨ {clip.why}</Text>}
                <Btn testID="skip-to-quiz" label="I've got it, quiz me" onPress={skipToQuiz} ghost />
              </>
            )}
            {phase === "rewind" && <Text style={s.muted}>Here's the part that explains it. Watch, then try again.</Text>}
          </>
        )}

        {phase === "quiz" && q && (
          <>
            <Text style={s.qLabel}>QUESTION {qi + 1} OF {questions.length}</Text>
            <Text style={s.prompt}>{q.prompt}</Text>
            {q.choices.map((c, i) => {
              const isPicked = picked === i;
              const correct = isPicked && i === q.correctIndex;
              const bad = (isPicked && i !== q.correctIndex) || wrong.includes(i);
              return (
                <Pressable
                  key={i}
                  testID={`choice-${i}`}
                  disabled={bad || picked !== null}
                  onPress={() => answer(i)}
                  style={[s.choice, correct && s.choiceRight, bad && s.choiceWrong]}
                >
                  <Text style={[s.choiceText, bad && { color: C.muted, textDecorationLine: "line-through" }]}>{c}</Text>
                </Pressable>
              );
            })}
            {picked === q.correctIndex && (
              <View style={s.feedback}>
                <Text style={s.feedbackTitle}>{wrong.length ? "Got it! +5 XP" : "Nailed it! +10 XP"}</Text>
                <Text style={s.feedbackText}>{q.explanation}</Text>
                <Btn testID="continue" label="Continue" onPress={next} />
              </View>
            )}
            {picked === null && <Btn label="↺ Rewatch clip" onPress={replayClip} ghost />}
          </>
        )}

        {phase === "done" && (
          <View style={s.done}>
            <Text style={s.bigEmoji}>🎉</Text>
            <Text style={s.h1}>Lesson complete</Text>
            <View style={s.doneStats}>
              <View style={s.doneStat}>
                <Text style={s.doneNum}>⚡ {xp}</Text>
                <Text style={s.muted}>XP earned</Text>
              </View>
              <View style={s.doneStat}>
                <Text style={s.doneNum}>🔥 {result?.streak ?? "…"}</Text>
                <Text style={s.muted}>day streak</Text>
              </View>
            </View>
            {result?.nextLessonId && (
              <Btn testID="next-lesson" label="Next lesson →" onPress={() => router.replace(`/lesson/${result.nextLessonId}`)} />
            )}
            <Btn testID="back-to-roadmap" label="Back to roadmap" onPress={() => router.back()} ghost />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={[s.safe, { alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }]}>{children}</View>;
}

function Btn({ label, onPress, ghost, testID }: { label: string; onPress: () => void; ghost?: boolean; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[s.btn, ghost && s.btnGhost]}>
      <Text style={[s.btnText, ghost && { color: C.text }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  top: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 10 },
  close: { color: C.muted, fontSize: 22 },
  bar: { flex: 1, height: 12, borderRadius: 6, backgroundColor: C.card, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: C.mint, borderRadius: 6 },
  xp: { color: C.gold, fontWeight: "800" },
  clipBar: { height: 3, backgroundColor: C.accent },
  rewindBadge: { position: "absolute", top: 10, left: 10, backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  rewindText: { color: "#fff", fontWeight: "800" },
  body: { padding: 22, gap: 12, paddingBottom: 60 },
  caption: { color: C.text, fontSize: 18, lineHeight: 26, minHeight: 52, fontWeight: "600" },
  lessonTitle: { color: C.text, fontSize: 24, fontWeight: "800", marginTop: 8 },
  teacher: { color: C.muted, fontSize: 14 },
  why: { color: C.mint, fontSize: 14 },
  qLabel: { color: C.accent, fontWeight: "800", fontSize: 12, letterSpacing: 1 },
  prompt: { color: C.text, fontSize: 21, fontWeight: "700", lineHeight: 28, marginBottom: 6 },
  choice: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 2, borderColor: C.line },
  choiceRight: { borderColor: C.mint, backgroundColor: C.mintSoft },
  choiceWrong: { borderColor: C.red, backgroundColor: C.redSoft },
  choiceText: { color: C.text, fontSize: 16 },
  feedback: { backgroundColor: C.mintSoft, borderRadius: 16, padding: 16, gap: 8, marginTop: 6 },
  feedbackTitle: { color: C.mint, fontWeight: "800", fontSize: 18 },
  feedbackText: { color: C.text, fontSize: 15, lineHeight: 21 },
  btn: { backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  btnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: C.line },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  muted: { color: C.muted, fontSize: 15, textAlign: "center" },
  h1: { color: C.text, fontSize: 30, fontWeight: "800" },
  h2: { color: C.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  done: { alignItems: "stretch", gap: 14, marginTop: 10 },
  bigEmoji: { fontSize: 64, textAlign: "center" },
  doneStats: { flexDirection: "row", gap: 12 },
  doneStat: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16, alignItems: "center", gap: 4 },
  doneNum: { color: C.gold, fontSize: 24, fontWeight: "800" },
});
