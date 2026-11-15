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
# optional: npx convex env set OPENAI_MODEL gpt-5-mini
# optional fallback if YouTube blocks Convex: npx convex env set SUPADATA_API_KEY ...
npx convex run debug:probe '{"q":"what is an eigenvector"}'   # checks YouTube search + transcripts from Convex
npx expo start            # scan the QR code with the iPhone camera (Expo Go)
```

Check YouTube access from your own machine: `npx tsx scripts/probe-youtube.ts "sourdough starter"`.

## How it works

- `convex/topics.ts`: create topic, live roadmap and lesson queries, progress and streaks.
- `convex/pipeline.ts`:
  - `generateRoadmap`: 4 units x 3 lessons with YouTube search queries, inserted row by row so the phone shows it assembling. Fixed after creation.
  - `findSources`: OpenAI web search for real syllabi, books and series shown as "Built from".
  - `buildLesson`: YouTube search, timestamped transcripts, the LLM picks the best video and a 75 to 180 second segment, and writes 3 questions each with a rewind window and quote. Runs lazily (first two lessons up front, the next one after each completion).
- `src/app`: Home, Roadmap (`topic/[id]`), Lesson (`lesson/[id]`: watch, quiz, rewind, done).
- `revyl/demo-path.md`: the end-to-end test of the demo path.

Clips play through YouTube's embedded player with start times; nothing is downloaded or rehosted.
