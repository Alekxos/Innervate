import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { getTranscript, searchYouTube } from "./lib/youtube";

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
