/// <reference types="node" />
// Plays the phone's role against the real deployment, end to end:
//   npx tsx scripts/e2e.ts "how jet engines work"
// Creates a topic for userId "rc-test", reads transcripts on this machine for
// lessons waiting on them (like src/lib/useTranscriptWorker.ts), and reports
// timings plus clip and question quality checks.
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { chunk, fetchTranscript, Line } from "../convex/lib/youtube";

const USER = "rc-test";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2].replace(/^"|"$/g, "")]),
);
const client = new ConvexHttpClient(env.EXPO_PUBLIC_CONVEX_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const fullLines = new Map<string, Line[]>(); // videoId -> raw caption lines, for checks
const handled = new Set<string>();

async function work(t0: number) {
  const waiting = await client.query(api.topics.awaitingTranscripts, { userId: USER });
  for (const l of waiting) {
    if (handled.has(l._id)) continue;
    handled.add(l._id);
    const job = await client.mutation(api.topics.claimTranscripts, { lessonId: l._id });
    if (!job) continue;
    const ts = Date.now();
    const settled = await Promise.allSettled(job.candidates.map((id) => fetchTranscript(id)));
    const transcripts = [];
    for (const [i, r] of settled.entries()) {
      if (r.status === "fulfilled") {
        fullLines.set(job.candidates[i], r.value);
        const lines = chunk(r.value)
          .slice(0, 220)
          .map((x) => ({ t: Math.round(x.t * 10) / 10, d: Math.round(x.d * 10) / 10, text: x.text }));
        transcripts.push({ videoId: job.candidates[i], lines });
      } else console.log(`   transcript ERR ${job.candidates[i]}: ${r.reason?.message}`);
    }
    const kb = Math.round(JSON.stringify(transcripts).length / 1024);
    console.log(
      `${((Date.now() - t0) / 1000).toFixed(1)}s  "${l.title}": read ${transcripts.length}/${job.candidates.length} transcripts in ${((Date.now() - ts) / 1000).toFixed(1)}s (${kb} KB)`,
    );
    if (transcripts.length) await client.mutation(api.topics.submitTranscripts, { lessonId: l._id, transcripts });
    else await client.mutation(api.topics.reportTranscriptFailure, { lessonId: l._id, error: "none on Mac" });
  }
}

async function main() {
  const query = process.argv[2] ?? "how jet engines work";
  const t0 = Date.now();
  const el = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const topicId = await client.mutation(api.topics.create, { query, userId: USER });
  console.log(`created ${topicId} for "${query}"`);
  let firstRow = false, ready = false, sourcesShown = false;
  let lesson1: Id<"lessons"> | null = null;
  while (Date.now() - t0 < 180_000) {
    const rm = await client.query(api.topics.roadmap, { topicId, userId: USER });
    const t = rm!.topic;
    const n = rm!.units.reduce((a, u) => a + u.lessons.length, 0);
    if (!firstRow && n) { firstRow = true; console.log(`${el()}  first lesson row visible`); }
    if (!ready && t.status === "ready") {
      ready = true;
      console.log(`${el()}  roadmap ready: ${t.emoji} ${t.title} — ${rm!.units.length} units, ${n} lessons. Goal: ${t.goal}`);
      for (const u of rm!.units) console.log(`     ${u.title}: ${u.lessons.map((x) => x.title).join(" | ")}`);
      lesson1 = rm!.units[0].lessons[0]._id;
    }
    if (t.status === "failed") throw new Error(`topic failed: ${t.error}`);
    if (!sourcesShown && t.sourcesStatus !== "searching") {
      sourcesShown = true;
      console.log(`${el()}  sources ${t.sourcesStatus}: ${t.sources.map((s) => `${s.title} [${s.kind}] ${s.url}`).join(" ; ")}`);
    }
    await work(t0);
    if (lesson1) {
      const r = await client.query(api.topics.lesson, { lessonId: lesson1 });
      if (r!.lesson.status === "ready" || r!.lesson.status === "failed") {
        console.log(`${el()}  lesson 1 ${r!.lesson.status} ${r!.lesson.error ?? ""}`);
        if (r!.lesson.status === "ready") report(r!);
        // let sources finish if still running
        if (sourcesShown) return;
      }
    }
    await sleep(400);
  }
  console.log("timed out");
}

function report(r: any) {
  const { clip } = r.lesson;
  const len = clip.end - clip.start;
  console.log(`\nCLIP  "${clip.title}" by ${clip.channel}  https://youtu.be/${clip.videoId}?t=${Math.floor(clip.start)}`);
  console.log(`      ${clip.start.toFixed(1)}s -> ${clip.end.toFixed(1)}s (${len.toFixed(0)}s) ${len >= 75 && len <= 180 ? "OK" : "LENGTH OUT OF RANGE"}  why: ${clip.why}`);
  const lines = fullLines.get(clip.videoId) ?? r.lesson.transcript;
  const opening = lines.filter((l: Line) => l.t >= clip.start - 1).slice(0, 3).map((l: Line) => l.text).join(" ");
  console.log(`      opens with: "${opening}"`);
  for (const q of r.questions) {
    const w = q.rewind;
    const near = norm(lines.filter((l: Line) => l.t + l.d >= w.start - 20 && l.t <= w.end + 20).map((l: Line) => l.text).join(" "));
    const words = norm(w.quote).split(" ");
    const hit = words.filter((x: string) => near.includes(x)).length / Math.max(1, words.length);
    const exact = near.includes(norm(w.quote));
    const inside = w.start >= clip.start - 0.01 && w.end <= clip.end + 0.01;
    console.log(`\nQ  ${q.prompt}`);
    q.choices.forEach((c: string, i: number) => console.log(`   ${i === q.correctIndex ? "*" : " "} ${c}`));
    console.log(`   rewind ${w.start.toFixed(1)}-${w.end.toFixed(1)}s ${inside ? "inside clip" : "OUTSIDE CLIP"}; quote "${w.quote}" ${exact ? "exact match" : `${Math.round(hit * 100)}% words nearby`}`);
    console.log(`   choices=${q.choices.length} correctIndex=${q.correctIndex} ${q.choices.length === 4 && q.correctIndex >= 0 && q.correctIndex < 4 ? "OK" : "BAD"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
