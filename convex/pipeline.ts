import { v } from "convex/values";
import { ActionCtx, internalAction } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { arr, int, json, num, obj, str, webSearchJson } from "./lib/llm";
import { chunk, fmt, getTranscript, Line, searchYouTube, VideoHit } from "./lib/youtube";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 1. Roadmap: generated once, up front, then fixed.
// ---------------------------------------------------------------------------

type Roadmap = {
  title: string;
  emoji: string;
  goal: string;
  days: number;
  units: { title: string; lessons: { title: string; objective: string; searchQuery: string }[] }[];
};

export const roadmapSchema = obj({
  title: str,
  emoji: str,
  goal: str,
  days: int,
  units: arr(
    obj({
      title: str,
      lessons: arr(obj({ title: str, objective: str, searchQuery: str })),
    }),
  ),
});

export const ROADMAP_SYSTEM = `You design bite-sized video courses, like Duolingo for any subject.
Model the sequence on how the best real courses and syllabi teach this subject (university courses, well-known textbooks, respected YouTube series).
Rules:
- Exactly 4 units, each with exactly 3 lessons, ordered from first principles to the goal.
- Each lesson teaches ONE concept that a great YouTube teacher could explain in about 2 minutes.
- "objective": one sentence, starting with a verb, of what the learner can do after.
- "searchQuery": the YouTube search that finds a clear explainer of exactly that concept (4-8 words, no channel names).
- "title" of the course: short and friendly (max 5 words). "emoji": one emoji.
- "goal": a concrete outcome at the end, e.g. a small project, a mock exam, or "explain X to a friend in 5 minutes".
- "days": how many days at one lesson a day (12-30).
- Lesson titles max 6 words.`;

export const generateRoadmap = internalAction({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const topic = await ctx.runQuery(internal.topics.getTopic, { topicId });
    if (!topic) return;
    try {
      const plan = await json<Roadmap>({
        name: "roadmap",
        schema: roadmapSchema,
        system: ROADMAP_SYSTEM,
        user: `Topic: ${topic.query}`,
      });

      await ctx.runMutation(internal.topics.patchTopic, {
        topicId,
        title: plan.title,
        emoji: plan.emoji,
        goal: plan.goal,
        days: plan.days,
      });

      // Insert rows one by one: Convex live queries push each row to the phone,
      // so the roadmap visibly assembles itself.
      let order = 0;
      const lessonIds = [];
      for (const [ui, unit] of plan.units.entries()) {
        const unitId = await ctx.runMutation(internal.topics.addUnit, {
          topicId,
          order: ui,
          title: unit.title,
        });
        await sleep(120);
        for (const l of unit.lessons) {
          lessonIds.push(
            await ctx.runMutation(internal.topics.addLesson, {
              topicId,
              unitId,
              order: order++,
              title: l.title,
              objective: l.objective,
              searchQuery: l.searchQuery,
            }),
          );
          await sleep(90);
        }
      }
      await ctx.runMutation(internal.topics.patchTopic, { topicId, status: "ready" });

      // Build the first lesson right away (and the second in the background).
      for (const lessonId of lessonIds.slice(0, 2)) {
        if (await ctx.runMutation(internal.topics.markBuilding, { lessonId })) {
          await ctx.scheduler.runAfter(0, internal.pipeline.buildLesson, { lessonId });
        }
      }
    } catch (e: any) {
      await ctx.runMutation(internal.topics.patchTopic, {
        topicId,
        status: "failed",
        error: String(e?.message ?? e),
      });
    }
  },
});

// ---------------------------------------------------------------------------
// 2. Sources: real syllabi and series the roadmap is modelled on (web search).
// ---------------------------------------------------------------------------

export const findSources = internalAction({
  args: { topicId: v.id("topics") },
  handler: async (ctx, { topicId }) => {
    const topic = await ctx.runQuery(internal.topics.getTopic, { topicId });
    if (!topic) return;
    try {
      const out = await webSearchJson<{ sources: { title: string; url: string; kind: string }[] }>({
        name: "sources",
        schema: obj({ sources: arr(obj({ title: str, url: str, kind: str })) }),
        instructions:
          "Find 3 or 4 well-regarded, real curricula for learning the topic: university syllabi or open courseware, a standard textbook, and a respected YouTube series. Use only real pages you found, and title each one by its real publisher and name (never attribute a page to a university or author it is not from). kind is one of syllabus, course, book, channel; a channel or series must link to the channel or playlist, not a single video. Titles max 7 words, e.g. 'MIT 18.06 Linear Algebra'.",
        input: `Topic: ${topic.query}`,
      });
      await ctx.runMutation(internal.topics.patchTopic, {
        topicId,
        sources: out.sources.slice(0, 4),
        sourcesStatus: "done",
      });
    } catch (e: any) {
      console.warn("findSources failed", e?.message);
      await ctx.runMutation(internal.topics.patchTopic, { topicId, sourcesStatus: "failed" });
    }
  },
});

// ---------------------------------------------------------------------------
// 3. Lesson: best clip from real videos + questions tied to exact seconds.
// ---------------------------------------------------------------------------

type Candidate = VideoHit & { lines: Line[]; chunks: Line[] };

type Pick = {
  videoIndex: number;
  start: number;
  end: number;
  why: string;
  questions: {
    prompt: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
    rewindStart: number;
    rewindEnd: number;
    quote: string;
  }[];
};

const pickSchema = obj({
  videoIndex: int,
  start: num,
  end: num,
  why: str,
  questions: arr(
    obj({
      prompt: str,
      choices: arr(str),
      correctIndex: int,
      explanation: str,
      rewindStart: num,
      rewindEnd: num,
      quote: str,
    }),
  ),
});

const isStartupTopic = (q: string) => /startup|start-up|founder|y ?combinator|\byc\b/i.test(q);
const isYC = (channel: string) => /^y ?combinator$/i.test(channel.trim());

// Prefer real explainers: 2 to 40 minutes long, not shorts.
const isExplainer = (h: VideoHit) => h.seconds >= 120 && h.seconds <= 2400;
const MAX_CANDIDATES = 4;

async function searchCandidates(queries: string[]): Promise<{ hits: VideoHit[]; errors: string[] }> {
  const errors: string[] = [];
  const seen = new Set<string>();
  const hits: VideoHit[] = [];
  for (const q of queries) {
    try {
      for (const h of await searchYouTube(q, 12)) {
        if (isExplainer(h) && !seen.has(h.videoId)) {
          seen.add(h.videoId);
          hits.push(h);
        }
      }
    } catch (e: any) {
      errors.push(`search: ${e?.message}`);
    }
    if (hits.length >= 3) break;
  }
  return { hits: hits.slice(0, MAX_CANDIDATES), errors };
}

/** All-server path, used only when SUPADATA_API_KEY is set. */
async function withServerTranscripts(hits: VideoHit[]): Promise<{ cands: Candidate[]; errors: string[] }> {
  const errors: string[] = [];
  const settled = await Promise.allSettled(hits.map((h) => getTranscript(h.videoId)));
  const cands: Candidate[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.length > 10) {
      cands.push({ ...hits[i], lines: r.value, chunks: chunk(r.value) });
    } else if (r.status === "rejected") {
      errors.push(`${hits[i].videoId}: ${r.reason?.message ?? r.reason}`);
    }
  });
  return { cands, errors };
}

/** Stage A: find candidate videos. Transcripts come from the phone (or Supadata). */
export const buildLesson = internalAction({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const c = await ctx.runQuery(internal.topics.getLessonContext, { lessonId });
    if (!c || !c.topic) return;
    const { lesson, topic } = c;
    try {
      // Startup topics: look on Y Combinator's channel first and put its videos first.
      const yc = isStartupTopic(topic.query);
      const found = await searchCandidates([
        ...(yc ? [`Y Combinator ${lesson.title}`] : []),
        lesson.searchQuery,
        `${lesson.title} ${topic.query} explained`,
      ]);
      const errors = found.errors;
      const hits = yc
        ? [...found.hits.filter((h) => isYC(h.channel)), ...found.hits.filter((h) => !isYC(h.channel))]
        : found.hits;
      if (!hits.length) throw new Error(`No explainer videos found. ${errors.join("; ")}`);
      if (process.env.SUPADATA_API_KEY) {
        const { cands, errors: tErrors } = await withServerTranscripts(hits);
        if (!cands.length) throw new Error(`No transcripts. ${tErrors.slice(0, 3).join("; ")}`);
        await pickAndSave(ctx, lessonId, cands);
        return;
      }
      await ctx.runMutation(internal.topics.saveCandidates, {
        lessonId,
        candidates: hits.map(({ videoId, title, channel, seconds, views }) => ({
          videoId,
          title,
          channel,
          seconds,
          views,
        })),
      });
    } catch (e: any) {
      console.error("buildLesson failed", e);
      await ctx.runMutation(internal.topics.failLesson, {
        lessonId,
        error: String(e?.message ?? e).slice(0, 500),
      });
    }
  },
});

/** Stage B: transcripts (chunks) arrived from the phone; pick the clip and write questions. */
export const pickClip = internalAction({
  args: {
    lessonId: v.id("lessons"),
    videos: v.array(
      v.object({
        videoId: v.string(),
        title: v.string(),
        channel: v.string(),
        seconds: v.number(),
        views: v.number(),
        lines: v.array(v.object({ t: v.number(), d: v.number(), text: v.string() })),
      }),
    ),
  },
  handler: async (ctx, { lessonId, videos }) => {
    try {
      await pickAndSave(
        ctx,
        lessonId,
        videos.map((x) => ({ ...x, chunks: x.lines })),
      );
    } catch (e: any) {
      console.error("pickClip failed", e);
      await ctx.runMutation(internal.topics.failLesson, {
        lessonId,
        error: String(e?.message ?? e).slice(0, 500),
      });
    }
  },
});

async function pickAndSave(ctx: ActionCtx, lessonId: Id<"lessons">, cands: Candidate[]) {
  const c = await ctx.runQuery(internal.topics.getLessonContext, { lessonId });
  if (!c || !c.topic) return;
  const { lesson, topic } = c;
  const stage = (s: string) => ctx.runMutation(internal.topics.setStage, { lessonId, stage: s });
  const MAX_CHUNKS = 220; // ~30 minutes per video keeps the prompt fast
  const listing = cands
    .map(
      (v, i) =>
        `### Video ${i}: "${v.title}" by ${v.channel} (${fmt(v.seconds)}, ${v.views.toLocaleString()} views)\n` +
        v.chunks
          .slice(0, MAX_CHUNKS)
          .map((l) => `[${Math.round(l.t)}s] ${l.text}`)
          .join("\n"),
    )
    .join("\n\n");

  await stage("Picking the perfect 2 minutes");
  const pick = await json<Pick>({
    name: "clip",
    schema: pickSchema,
    system: `You are a master teacher curating the single best YouTube segment for one lesson.
Given timestamped transcripts (seconds in brackets), choose ONE video and ONE continuous segment that teaches the lesson concept on its own.
Segment rules:
- 75 to 180 seconds long. Start at the beginning of a sentence where the explanation begins; never during an intro, greeting, channel plug or sponsor read. End right after the idea lands.
- Prefer the clearest, most visual explainer even if it is not the most viewed.
Then write exactly 3 multiple-choice questions answerable ONLY from what is said in that segment:
- 4 short choices each, one correct; plausible distractors that reflect real misconceptions.
- rewindStart/rewindEnd: the 8 to 25 second window inside the segment where the answer is explained. quote: the key words said there (max 20 words, verbatim from the transcript).
- explanation: one encouraging sentence on why the answer is right.
- "why": one short sentence a learner sees on why this teacher was picked (e.g. "Clearest visual intuition for eigenvectors").`,
    user: `Course: ${topic.title} (${topic.query})
Lesson: ${lesson.title}
Objective: ${lesson.objective}
Other lessons in the course (do not teach these): ${c.siblings.filter((s) => s !== lesson.title).join("; ")}${isStartupTopic(topic.query) && cands.some((v) => isYC(v.channel)) ? "\nStrongly prefer the Y Combinator video if it covers this lesson at all." : ""}

${listing}`,
  });

  await stage("Writing your questions");
  const vid = cands[Math.min(Math.max(pick.videoIndex, 0), cands.length - 1)];
  const total = vid.seconds || (vid.lines.at(-1)!.t + vid.lines.at(-1)!.d);
  // Snap start to the beginning of the caption line that contains it.
  const snap = (t: number) => {
    const line = [...vid.lines].reverse().find((l) => l.t <= t + 0.5);
    return line ? line.t : t;
  };
  // End where the caption line containing it finishes, so the clip ends on a full sentence.
  const snapEnd = (t: number) => {
    const line = vid.lines.find((l) => l.t + l.d >= t - 0.5);
    return line ? line.t + line.d : t;
  };
  const start = Math.max(0, snap(pick.start));
  let end = snapEnd(Math.max(pick.end, start + 75));
  if (end - start > 180) end = start + 180;
  end = Math.min(total, end);

  const questions = pick.questions
    .filter((q) => q.choices.length >= 2 && q.correctIndex >= 0 && q.correctIndex < q.choices.length)
    .slice(0, 3)
    .map((q) => {
      let rs = Math.min(Math.max(q.rewindStart, start), end - 5);
      let re = Math.min(Math.max(q.rewindEnd, rs + 8), end);
      if (re - rs > 30) re = rs + 30;
      rs = Math.max(start, snap(rs));
      // Models tend to list the right answer first: shuffle the choices.
      const order = q.choices.map((_, i) => i).sort(() => Math.random() - 0.5);
      return {
        prompt: q.prompt,
        choices: order.map((i) => q.choices[i]),
        correctIndex: order.indexOf(q.correctIndex),
        explanation: q.explanation,
        rewind: { start: rs, end: re, quote: q.quote },
      };
    });
  if (!questions.length) throw new Error("No valid questions generated");

  const transcript = vid.lines
    .filter((l) => l.t + l.d >= start && l.t <= end)
    .map((l) => ({ t: l.t, d: l.d, text: l.text }));

  await ctx.runMutation(internal.topics.saveLesson, {
    lessonId,
    clip: { videoId: vid.videoId, title: vid.title, channel: vid.channel, start, end, why: pick.why },
    transcript,
    questions,
  });
}
