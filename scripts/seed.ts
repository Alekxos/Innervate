/// <reference types="node" />
// Demo fallback: builds 3 complete topics for the app's demo learner through
// the real pipeline, with this machine reading transcripts (the phone's role).
//   npx tsx scripts/seed.ts            (defaults below)
//   npx tsx scripts/seed.ts "Topic A" "Topic B"
//   npx tsx scripts/seed.ts --retry-failed   (rebuild failed early lessons of existing topics)
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { chunk, fetchTranscript } from "../convex/lib/youtube";
import { USER_ID } from "../src/lib/user";

const TOPICS = ["How jet engines work", "Sourdough baking", "Options pricing"];
const LESSONS_PER_TOPIC = 2;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l: string) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m: any) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const client = new ConvexHttpClient(env.EXPO_PUBLIC_CONVEX_URL);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readTranscripts(lessonId: Id<"lessons">) {
  const job = await client.mutation(api.topics.claimTranscripts, { lessonId });
  if (!job) return;
  const settled = await Promise.allSettled(job.candidates.map((id) => fetchTranscript(id)));
  const transcripts = [];
  for (const [i, r] of settled.entries()) {
    if (r.status !== "fulfilled") continue;
    const lines = chunk(r.value)
      .slice(0, 220)
      .map((x) => ({ t: Math.round(x.t * 10) / 10, d: Math.round(x.d * 10) / 10, text: x.text }));
    transcripts.push({ videoId: job.candidates[i], lines });
  }
  if (transcripts.length) await client.mutation(api.topics.submitTranscripts, { lessonId, transcripts });
  else await client.mutation(api.topics.reportTranscriptFailure, { lessonId, error: "none on seed machine" });
}

async function main() {
  const args = process.argv.slice(2);
  const t0 = Date.now();
  let ids: Id<"topics">[];
  if (args[0] === "--retry-failed") {
    ids = (await client.query(api.topics.list, { userId: USER_ID })).map((t) => t._id);
    for (const topicId of ids) {
      const rm = await client.query(api.topics.roadmap, { topicId, userId: USER_ID });
      for (const l of rm!.units.flatMap((u) => u.lessons).slice(0, LESSONS_PER_TOPIC)) {
        if (l.status === "failed") await client.mutation(api.topics.ensureLesson, { lessonId: l._id });
      }
    }
    console.log(`retrying failed lessons in ${ids.length} topics`);
  } else {
    const queries = args.length ? args : TOPICS;
    ids = await Promise.all(
      queries.map((query) => client.mutation(api.topics.create, { query, userId: USER_ID })),
    );
    console.log(`created ${ids.length} topics for ${USER_ID}`);
  }
  const handled = new Set<string>();
  const done = new Set<string>();
  while (Date.now() - t0 < 300_000) {
    for (const l of await client.query(api.topics.awaitingTranscripts, { userId: USER_ID })) {
      if (handled.has(l._id)) continue;
      handled.add(l._id);
      readTranscripts(l._id).catch((e) => console.log(`transcripts ${l.title}: ${e?.message}`));
    }
    let complete = true;
    for (const topicId of ids) {
      const rm = await client.query(api.topics.roadmap, { topicId, userId: USER_ID });
      if (!rm || rm.topic.status === "failed") {
        console.log(`topic failed: ${rm?.topic.error}`);
        continue;
      }
      const first = rm.units.flatMap((u) => u.lessons).slice(0, LESSONS_PER_TOPIC);
      if (first.length < LESSONS_PER_TOPIC) complete = false;
      for (const l of first) {
        if (l.status === "ready" || l.status === "failed") {
          if (!done.has(l._id)) {
            done.add(l._id);
            console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${rm.topic.emoji ?? ""} ${rm.topic.title} / ${l.title}: ${l.status}${l.channel ? ` (${l.channel})` : ""}`);
          }
        } else complete = false;
      }
      if (rm.topic.sourcesStatus === "searching") complete = false;
    }
    if (complete) {
      console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return;
    }
    await sleep(500);
  }
  console.log("timed out");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
