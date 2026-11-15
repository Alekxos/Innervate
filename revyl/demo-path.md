# Revyl end-to-end test: the demo path

Create this as one Revyl test against the iOS simulator build
(`npx expo run:ios --configuration Release`, then upload the `.app` from
`ios/build/Build/Products/Release-iphonesimulator/Innervate.app`, zipped).
Each step is written the way Revyl's natural-language steps expect.

1. Tap the field "What do you want to learn?" (testID `topic-input`) and type "how jet engines work".
2. Tap "Go" (`topic-go`).
3. Wait until a "UNIT 1" card and at least 3 lesson titles are visible (up to 30 s).
4. Validate that a "Built from" row shows at least one source.
5. Tap the first lesson (`lesson-0`).
6. Wait until a video player is visible and "I've got it, quiz me" appears (up to 60 s).
7. Tap "I've got it, quiz me" (`skip-to-quiz`).
8. Validate "QUESTION 1 OF" is visible.
9. Tap an answer. If it is marked wrong, validate that "Rewinding to" appears, wait for the question to come back, then tap a different answer.
10. When "Continue" (`continue`) appears, tap it. Repeat steps 9 and 10 until "Lesson complete" is visible.
11. Validate "day streak" is visible with 🔥 1.
12. Tap "Back to roadmap" and validate the first lesson shows a check mark and the second lesson is unlocked.
