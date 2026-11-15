// Same check as debug:probe, but from your own machine:
//   npx tsx scripts/probe-youtube.ts "what is an eigenvector"
import { getTranscript, searchYouTube, chunk } from "../convex/lib/youtube";

async function main() {
  const q = process.argv[2] ?? "what is an eigenvector";
  const hits = await searchYouTube(q, 5);
  console.log(`search "${q}": ${hits.length} hits`);
  for (const h of hits.slice(0, 3)) {
    try {
      const lines = await getTranscript(h.videoId);
      console.log(`OK  ${h.videoId} ${h.title} (${h.channel}) ${lines.length} lines, ${chunk(lines).length} chunks`);
      console.log("    ", lines.slice(0, 2).map((l) => `[${l.t.toFixed(1)}] ${l.text}`).join(" | "));
    } catch (e: any) {
      console.log(`ERR ${h.videoId} ${h.title}: ${e?.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
