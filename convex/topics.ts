import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { source, clip, candidate } from "./schema";

// ---------- Public API used by the app ----------

export const create = mutation({
  args: { query: v.string(), userId: v.string() },
  handler: async (ctx, { query, userId }) => {
    const q = query.trim();
    if (!q) throw new Error("Empty topic");
    const topicId = await ctx.db.insert("topics", {
      query: q,
      title: q,
      status: "planning",
      sources: [],
      sourcesStatus: "searching",
      userId,
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.generateRoadmap, { topicId });
    await ctx.scheduler.runAfter(0, internal.pipeline.findSources, { topicId });
    return topicId;
  },
});

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const mine = await ctx.db
      .query("topics")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
    return mine.filter((t) => t.status !== "failed");
  },
});

export const roadmap = query({
  args: { topicId: v.id("topics"), userId: v.string() },
  handler: async (ctx, { topicId, userId }) => {
    const topic = await ctx.db.get(topicId);
    if (!topic) return null;
    const units = await ctx.db
      .query("units")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    const done = await ctx.db
      .query("progress")
      .withIndex("by_user_topic", (q) => q.eq("userId", userId).eq("topicId", topicId))
      .collect();
    const doneIds = new Set(done.map((d) => d.lessonId));
    const firstOpen = lessons.find((l) => !doneIds.has(l._id));
    const streak = await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return {
      topic,
      streak: streak ? { current: streak.current, xp: streak.xp } : { current: 0, xp: 0 },
      completed: doneIds.size,
      units: units.map((u) => ({
        ...u,
        lessons: lessons
          .filter((l) => l.unitId === u._id)
          .map((l) => ({
            _id: l._id,
            title: l.title,
            objective: l.objective,
            order: l.order,
            status: l.status,
            channel: l.clip?.channel,
            done: doneIds.has(l._id),
            unlocked: doneIds.has(l._id) || l._id === firstOpen?._id,
          })),
      })),
    };
  },
});

export const lesson = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    const next = await ctx.db
      .query("lessons")
      .withIndex("by_topic", (q) => q.eq("topicId", lesson.topicId).gt("order", lesson.order))
      .first();
    return { lesson, questions, nextLessonId: next?._id ?? null };
  },
});

/** Called when a lesson screen opens: builds the lesson lazily if needed. */
export const ensureLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return;
    if (lesson.status === "planned" || lesson.status === "failed") {
      await ctx.db.patch(lessonId, { status: "building", stage: "Finding the best teacher", error: undefined });
      await ctx.scheduler.runAfter(0, internal.pipeline.buildLesson, { lessonId });
    } else if (isStaleClaim(lesson)) {
      // A phone claimed the transcripts and went away: hand the job out again.
      await ctx.db.patch(lessonId, { status: "awaiting_transcripts", claimedAt: undefined });
    }
  },
});

// ---------- Phone-side transcript step ----------
// YouTube bot-blocks transcript requests from Convex's servers, so the server
// finds candidate videos and the phone reads their transcripts and sends them back.

const CLAIM_TIMEOUT_MS = 45_000;
const line = v.object({ t: v.number(), d: v.number(), text: v.string() });

function isStaleClaim(l: { status: string; candidates?: unknown[]; claimedAt?: number }) {
  return (
    l.status === "building" &&
    !!l.candidates?.length &&
    !!l.claimedAt &&
    Date.now() - l.claimedAt > CLAIM_TIMEOUT_MS
  );
}

/** Lessons of this user that are waiting for the phone to read transcripts. */
export const awaitingTranscripts = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const waiting = await ctx.db
      .query("lessons")
      .withIndex("by_status", (q) => q.eq("status", "awaiting_transcripts"))
      .take(50);
    const out = [];
    for (const l of waiting) {
      const topic = await ctx.db.get(l.topicId);
      if (topic?.userId === userId) out.push({ _id: l._id, title: l.title });
    }
    return out;
  },
});

/** Atomically takes the transcript job. Returns the candidates to the first caller only. */
export const claimTranscripts = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const l = await ctx.db.get(lessonId);
    if (!l || !l.candidates?.length) return null;
    if (l.status !== "awaiting_transcripts" && !isStaleClaim(l)) return null;
    await ctx.db.patch(lessonId, {
      status: "building",
      claimedAt: Date.now(),
      stage: `Reading ${l.candidates.length} transcripts`,
    });
    return { candidates: l.candidates.map((c) => c.videoId) };
  },
});

/** The phone sends ~8 second transcript chunks; the server picks the clip and writes questions. */
export const submitTranscripts = mutation({
  args: {
    lessonId: v.id("lessons"),
    transcripts: v.array(v.object({ videoId: v.string(), lines: v.array(line) })),
  },
  handler: async (ctx, { lessonId, transcripts }) => {
    const l = await ctx.db.get(lessonId);
    if (!l || l.status !== "building" || !l.candidates?.length || !l.claimedAt) return false;
    const videos = [];
    for (const t of transcripts) {
      const c = l.candidates.find((x) => x.videoId === t.videoId);
      if (c && t.lines.length > 5) videos.push({ ...c, lines: t.lines.slice(0, 400) });
    }
    if (!videos.length) {
      await ctx.db.patch(lessonId, {
        status: "failed",
        error: "No usable transcripts",
        stage: undefined,
        candidates: undefined,
        claimedAt: undefined,
      });
      return false;
    }
    // Clearing candidates makes a second submit a no-op.
    await ctx.db.patch(lessonId, {
      candidates: undefined,
      claimedAt: undefined,
      stage: "Picking the perfect 2 minutes",
    });
    await ctx.scheduler.runAfter(0, internal.pipeline.pickClip, { lessonId, videos });
    return true;
  },
});

/** The phone could not read any transcript. */
export const reportTranscriptFailure = mutation({
  args: { lessonId: v.id("lessons"), error: v.string() },
  handler: async (ctx, { lessonId, error }) => {
    const l = await ctx.db.get(lessonId);
    if (!l || l.status !== "building" || !l.candidates?.length) return;
    await ctx.db.patch(lessonId, {
      status: "failed",
      error: `Transcripts: ${error}`.slice(0, 500),
      stage: undefined,
      candidates: undefined,
      claimedAt: undefined,
    });
  },
});

export const saveCandidates = internalMutation({
  args: { lessonId: v.id("lessons"), candidates: v.array(candidate) },
  handler: (ctx, { lessonId, candidates }) =>
    ctx.db.patch(lessonId, {
      status: "awaiting_transcripts",
      candidates,
      claimedAt: undefined,
      stage: "Reading transcripts",
    }),
});

function today(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export const complete = mutation({
  args: { lessonId: v.id("lessons"), userId: v.string(), xp: v.number() },
  handler: async (ctx, { lessonId, userId, xp }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) throw new Error("No lesson");
    const existing = await ctx.db
      .query("progress")
      .withIndex("by_user_lesson", (q) => q.eq("userId", userId).eq("lessonId", lessonId))
      .unique();
    if (!existing) {
      await ctx.db.insert("progress", { userId, topicId: lesson.topicId, lessonId, xp });
    }
    const s = await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    let current = 1;
    if (s) {
      current = s.lastDay === today() ? s.current : s.lastDay === today(-1) ? s.current + 1 : 1;
      await ctx.db.patch(s._id, {
        current,
        best: Math.max(s.best, current),
        lastDay: today(),
        xp: s.xp + (existing ? 0 : xp),
      });
    } else {
      await ctx.db.insert("streaks", { userId, current: 1, best: 1, lastDay: today(), xp });
    }
    // Prefetch the next lesson so it is ready when the user taps it.
    const next = await ctx.db
      .query("lessons")
      .withIndex("by_topic", (q) => q.eq("topicId", lesson.topicId).gt("order", lesson.order))
      .first();
    if (next && next.status === "planned") {
      await ctx.db.patch(next._id, { status: "building", stage: "Finding the best teacher" });
      await ctx.scheduler.runAfter(0, internal.pipeline.buildLesson, { lessonId: next._id });
    }
    return { streak: current, nextLessonId: next?._id ?? null };
  },
});

// ---------- Internal helpers used by the pipeline ----------

export const getTopic = internalQuery({
  args: { topicId: v.id("topics") },
  handler: (ctx, { topicId }) => ctx.db.get(topicId),
});

export const getLessonContext = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson) return null;
    const topic = await ctx.db.get(lesson.topicId);
    const unit = await ctx.db.get(lesson.unitId);
    const siblings = await ctx.db
      .query("lessons")
      .withIndex("by_topic", (q) => q.eq("topicId", lesson.topicId))
      .collect();
    return { lesson, topic, unit, siblings: siblings.map((s) => s.title) };
  },
});

export const patchTopic = internalMutation({
  args: {
    topicId: v.id("topics"),
    title: v.optional(v.string()),
    emoji: v.optional(v.string()),
    goal: v.optional(v.string()),
    days: v.optional(v.number()),
    status: v.optional(v.union(v.literal("planning"), v.literal("ready"), v.literal("failed"))),
    error: v.optional(v.string()),
    sources: v.optional(v.array(source)),
    sourcesStatus: v.optional(v.string()),
  },
  handler: async (ctx, { topicId, ...fields }) => {
    await ctx.db.patch(topicId, fields);
  },
});

export const addUnit = internalMutation({
  args: { topicId: v.id("topics"), order: v.number(), title: v.string() },
  handler: (ctx, args) => ctx.db.insert("units", args),
});

export const addLesson = internalMutation({
  args: {
    topicId: v.id("topics"),
    unitId: v.id("units"),
    order: v.number(),
    title: v.string(),
    objective: v.string(),
    searchQuery: v.string(),
  },
  handler: (ctx, args) => ctx.db.insert("lessons", { ...args, status: "planned" }),
});

export const markBuilding = internalMutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const l = await ctx.db.get(lessonId);
    if (l && l.status === "planned") {
      await ctx.db.patch(lessonId, { status: "building", stage: "Finding the best teacher" });
      return true;
    }
    return false;
  },
});

export const setStage = internalMutation({
  args: { lessonId: v.id("lessons"), stage: v.string() },
  handler: (ctx, { lessonId, stage }) => ctx.db.patch(lessonId, { stage }),
});

export const failLesson = internalMutation({
  args: { lessonId: v.id("lessons"), error: v.string() },
  handler: (ctx, { lessonId, error }) =>
    ctx.db.patch(lessonId, {
      status: "failed",
      error,
      stage: undefined,
      candidates: undefined,
      claimedAt: undefined,
    }),
});

export const saveLesson = internalMutation({
  args: {
    lessonId: v.id("lessons"),
    clip,
    transcript: v.array(v.object({ t: v.number(), d: v.number(), text: v.string() })),
    questions: v.array(
      v.object({
        prompt: v.string(),
        choices: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
        rewind: v.object({ start: v.number(), end: v.number(), quote: v.string() }),
      }),
    ),
  },
  handler: async (ctx, { lessonId, clip, transcript, questions }) => {
    const old = await ctx.db
      .query("questions")
      .withIndex("by_lesson", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const q of old) await ctx.db.delete(q._id);
    for (const [order, q] of questions.entries()) {
      await ctx.db.insert("questions", { lessonId, order, ...q });
    }
    await ctx.db.patch(lessonId, {
      status: "ready",
      stage: undefined,
      error: undefined,
      candidates: undefined,
      claimedAt: undefined,
      clip,
      transcript,
    });
  },
});

/** Removes a topic and everything under it (units, lessons, questions, progress).
 *   npx convex run topics:deleteTopic '{"topicId":"..."}' */
export const deleteTopic = internalMutation({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    for (const l of lessons) {
      const qs = await ctx.db
        .query("questions")
        .withIndex("by_lesson", (q) => q.eq("lessonId", l._id))
        .collect();
      for (const q of qs) await ctx.db.delete(q._id);
      await ctx.db.delete(l._id);
    }
    const units = await ctx.db
      .query("units")
      .withIndex("by_topic", (q) => q.eq("topicId", topicId))
      .collect();
    for (const u of units) await ctx.db.delete(u._id);
    const progress = (await ctx.db.query("progress").collect()).filter((p) => p.topicId === topicId);
    for (const p of progress) await ctx.db.delete(p._id);
    await ctx.db.delete(topicId);
    return { lessons: lessons.length, units: units.length, progress: progress.length };
  },
});

/** Demo reset: streak 0 and XP 0; finishing a lesson today makes it 1.
 *   npx convex run topics:resetStreak '{"userId":"demo-learner"}' */
export const resetStreak = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const s = await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (s) await ctx.db.patch(s._id, { current: 0, xp: 0, lastDay: "" });
    return s ? { before: { current: s.current, xp: s.xp, lastDay: s.lastDay } } : null;
  },
});
