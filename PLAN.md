# Innervate build plan (hackathon demo)

## Stack
- **Expo (React Native, TypeScript, expo-router)**: runs on Alekxos's iPhone through Expo Go in minutes with no Xcode signing, and `expo run:ios` gives the simulator `.app` that Revyl needs.
- **Convex**: database plus server actions. Its live queries mean roadmap rows show up on the phone the moment the backend inserts them, which is the "roadmap streams in" beat for free.
- **react-native-youtube-iframe**: YouTube's official embedded player with start/end and seekTo. No downloading or rehosting.
- **OpenAI** (credits from the Capy email) for roadmap, clip picking and questions.

## Sponsor tools (checked against their sites)
- **Convex**: the whole backend.
- **Revyl** (AI mobile app testing, CLI plus YAML tests): one end-to-end test of the demo path (enter topic, roadmap appears, open lesson, answer wrong, rewind, answer right, node completes) run on their cloud iOS device. Pitch line: "every build is verified by Revyl".
- **Capy** (cloud coding agent that works on GitHub repos, Capy Max is free for 30 days from the email): hand it parallel tasks on the repo, e.g. streak screen, seed topics, polish.

## Convex data model
- `topics`: query, title, goal, status, sources [{title, url, kind}]
- `units`: topicId, order, title
- `lessons`: topicId, unitId, order, title, objective, searchQuery, status (planned, building, ready, failed), clip {videoId, title, channel, start, end}
- `questions`: lessonId, prompt, choices, correctIndex, explanation, rewind {start, end, quote}
- `progress`: deviceId, topicId, lessonId, completedAt; `streaks`: deviceId, current, lastDay

## Pipeline
1. `createTopic` mutation schedules `generateRoadmap`.
2. `generateRoadmap` (action): LLM produces goal, cited syllabus sources, 4 units x 3 lessons, each lesson with a YouTube search query. Rows are inserted one by one so the phone fills in live. The roadmap is then fixed.
3. Lesson 1 (and 2) are built right away; the rest build when tapped.
4. `buildLesson` (action): search YouTube, fetch timestamped transcripts of the top candidates, LLM picks the best video and a 90 to 180 second window that skips intros and sponsor reads, snapped to sentence boundaries. Then 2 or 3 questions, each with a `rewind` window pointing at the transcript lines that justify the answer.
5. Fallback: 3 pre-generated topics seeded in Convex in case wifi or an API fails.

## Screens on the demo path
1. Home: "What do you want to learn?" plus suggestion chips.
2. Roadmap: units and lesson nodes streaming in, sources, goal, streak.
3. Lesson: clip plays from start to end, then the quiz.
4. Quiz: wrong answer replays the rewind window with the quote shown, then retry.
5. Complete: node lights up, streak +1, next lesson unlocks.

## Order of work
1. Spike transcript to timestamp on 3 topics (the technical bet).
2. Expo + Convex scaffold, schema, roadmap generation.
3. buildLesson + player.
4. Quiz + rewind.
5. Progress, streak, polish.
6. Seed fallback topics, Revyl test, Capy tasks in parallel.

## Main risk
YouTube may block transcript fetches from cloud servers. Mitigation: test from Convex first; fall back to a transcript API or fetching on the phone.
