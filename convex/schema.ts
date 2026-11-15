import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const source = v.object({
  title: v.string(),
  url: v.optional(v.string()),
  kind: v.string(), // "syllabus" | "course" | "book" | "channel" | "article"
});

export const clip = v.object({
  videoId: v.string(),
  title: v.string(),
  channel: v.string(),
  start: v.number(),
  end: v.number(),
  why: v.optional(v.string()),
});

export default defineSchema({
  topics: defineTable({
    query: v.string(),
    title: v.string(),
    emoji: v.optional(v.string()),
    goal: v.optional(v.string()),
    days: v.optional(v.number()),
    status: v.union(
      v.literal("planning"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    sources: v.array(source),
    sourcesStatus: v.optional(v.string()),
    userId: v.string(),
  }).index("by_user", ["userId"]),

  units: defineTable({
    topicId: v.id("topics"),
    order: v.number(),
    title: v.string(),
  }).index("by_topic", ["topicId", "order"]),

  lessons: defineTable({
    topicId: v.id("topics"),
    unitId: v.id("units"),
    order: v.number(), // global order within the topic
    title: v.string(),
    objective: v.string(),
    searchQuery: v.string(),
    status: v.union(
      v.literal("planned"),
      v.literal("building"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    stage: v.optional(v.string()), // human readable build progress
    error: v.optional(v.string()),
    clip: v.optional(clip),
    transcript: v.optional(
      v.array(v.object({ t: v.number(), d: v.number(), text: v.string() })),
    ),
  })
    .index("by_topic", ["topicId", "order"])
    .index("by_unit", ["unitId", "order"]),

  questions: defineTable({
    lessonId: v.id("lessons"),
    order: v.number(),
    prompt: v.string(),
    choices: v.array(v.string()),
    correctIndex: v.number(),
    explanation: v.string(),
    rewind: v.object({ start: v.number(), end: v.number(), quote: v.string() }),
  }).index("by_lesson", ["lessonId", "order"]),

  progress: defineTable({
    userId: v.string(),
    topicId: v.id("topics"),
    lessonId: v.id("lessons"),
    xp: v.number(),
  })
    .index("by_user_topic", ["userId", "topicId"])
    .index("by_user_lesson", ["userId", "lessonId"]),

  streaks: defineTable({
    userId: v.string(),
    current: v.number(),
    best: v.number(),
    lastDay: v.string(), // YYYY-MM-DD
    xp: v.number(),
  }).index("by_user", ["userId"]),
});
