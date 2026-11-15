import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { getTranscript, searchYouTube } from "./lib/youtube";
import { json } from "./lib/llm";
import { ROADMAP_SYSTEM, roadmapSchema } from "./pipeline";

/**
 * Checks that Convex's servers can search YouTube and read transcripts.
 *   npx convex run debug:probe '{"q":"what is an eigenvector"}'
 */
export const probe = internalAction({
  args: { q: v.string() },
  handler: async (_ctx, { q }) => {
    const hits = await searchYouTube(q, 5);
    const results = [];
    for (const h of hits.slice(0, 3)) {
      try {
        const lines = await getTranscript(h.videoId);
        results.push({ ...h, ok: true, lines: lines.length, sample: lines.slice(0, 3) });
      } catch (e: any) {
        results.push({ ...h, ok: false, error: String(e?.message ?? e) });
      }
    }
    return { hits: hits.length, results };
  },
});

/**
 * Times the roadmap prompt on several models (the key stays on Convex).
 *   npx convex run debug:bench '{"models":["gpt-5-mini","gpt-4.1-mini"]}'
 */
export const bench = internalAction({
  args: { models: v.array(v.string()), topic: v.optional(v.string()) },
  handler: async (_ctx, { models, topic }) => {
    const out: Record<string, string> = {};
    const list = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    }).then((r) => r.json());
    out.available = (list.data ?? [])
      .map((m: any) => m.id)
      .filter((id: string) => /^(gpt-[45]|o\d)/.test(id) && !/audio|realtime|transcribe|tts|search|image/.test(id))
      .sort()
      .join(" ");
    await Promise.all(
      models.map(async (model) => {
        const t = Date.now();
        try {
          const r = await json<any>({
            name: "roadmap",
            schema: roadmapSchema,
            system: ROADMAP_SYSTEM,
            user: `Topic: ${topic ?? "how jet engines work"}`,
            model,
          });
          out[model] = `${((Date.now() - t) / 1000).toFixed(1)}s ${r.units.length}x${r.units[0]?.lessons.length} ${r.title} | ${r.units.map((u: any) => u.title).join(" / ")}`;
        } catch (e: any) {
          out[model] = `ERR ${((Date.now() - t) / 1000).toFixed(1)}s ${e?.message?.slice(0, 200)}`;
        }
      }),
    );
    return out;
  },
});
