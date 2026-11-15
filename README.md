# Innervate

Duolingo for anything: type a topic, get a stable roadmap built from real
curricula, and learn from the exact 2 minutes of the best YouTube explainer,
with questions that rewind to the seconds that explain the answer.

Stack: Expo (React Native) + Convex + OpenAI. Tested with Revyl, built with Capy.

## Run it (Mac)

```bash
npm install
npx convex dev            # log in, create project "innervate"; writes .env.local and convex/_generated
# in another terminal:
npx convex env set OPENAI_API_KEY sk-...        # from the Capy OpenAI credits
# optional: npx convex env set OPENAI_MODEL gpt-5.4-mini   (the default)
# optional: npx convex env set SUPADATA_API_KEY ...  (read transcripts on the server instead of the phone)
npx convex run debug:probe '{"q":"what is an eigenvector"}'   # search works from Convex; transcripts are bot-blocked there
npx expo start            # scan the QR code with the iPhone camera (Expo Go)
```

Check YouTube access from your own machine: `npx tsx scripts/probe-youtube.ts "sourdough starter"`.

End-to-end test without the phone (this Mac plays the phone's transcript role, user `rc-test`):
`npx tsx scripts/e2e.ts "how jet engines work"` prints timings, the clip and quality checks for each question.
Time the roadmap prompt across models: `npx convex run debug:bench '{"models":["gpt-5.4-mini","gpt-5-mini"]}'`.

## How it works

- `convex/topics.ts`: create topic, live roadmap and lesson queries, progress and streaks.
- `convex/pipeline.ts`:
  - `generateRoadmap`: 4 units x 3 lessons with YouTube search queries, inserted row by row so the phone shows it assembling. Fixed after creation.
  - `findSources`: OpenAI web search for real syllabi, books and series shown as "Built from".
  - `buildLesson` (stage A): searches YouTube (works from Convex), keeps the top 4 explainers (2 to 40 minutes) as `candidates`, and sets the lesson to `awaiting_transcripts`. Runs lazily (first two lessons up front, the next one after each completion).
  - `pickClip` (stage B): gets the transcripts, has the LLM pick the best video and a 75 to 180 second segment, and write 3 questions each with a rewind window and quote. Choices are shuffled on the server.
- Phone-side transcripts: YouTube answers transcript requests from Convex's servers with "Sign in to confirm you're not a bot", but not from phones. `src/lib/useTranscriptWorker.ts` (mounted in `_layout.tsx`) watches `topics.awaitingTranscripts`, takes the job with `topics.claimTranscripts` (first caller only; a claim older than 45 s can be retaken), reads the transcripts on the device with `convex/lib/youtube.ts` (one Innertube player call plus one caption download per video, no cookies, no watch page), and sends ~8 second chunks to `topics.submitTranscripts`, which schedules `pickClip`. If `SUPADATA_API_KEY` is set, stage A reads transcripts on the server instead and goes straight to stage B.
- `src/app`: Home, Roadmap (`topic/[id]`), Lesson (`lesson/[id]`: watch, quiz, rewind, done).
- `revyl/demo-path.md`: the end-to-end test of the demo path.

Clips play through YouTube's embedded player with start times; nothing is downloaded or rehosted.
