import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { chunk, fetchTranscript } from "../../convex/lib/youtube";
import { USER_ID } from "./user";

const MAX_CHUNKS = 220; // matches the server prompt cap; keeps payloads small

/**
 * YouTube bot-blocks transcript requests from Convex's servers but not from
 * phones. The server finds candidate videos; this worker reads their
 * transcripts on the device and sends ~8 second chunks back.
 * Mount once, inside ConvexProvider.
 */
export function useTranscriptWorker() {
  const waiting = useQuery(api.topics.awaitingTranscripts, { userId: USER_ID });
  const claim = useMutation(api.topics.claimTranscripts);
  const submit = useMutation(api.topics.submitTranscripts);
  const fail = useMutation(api.topics.reportTranscriptFailure);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!waiting) return;
    for (const l of waiting) {
      if (inFlight.current.has(l._id)) continue;
      inFlight.current.add(l._id);
      run(l._id).finally(() => inFlight.current.delete(l._id));
    }

    async function run(lessonId: Id<"lessons">) {
      try {
        const job = await claim({ lessonId });
        if (!job) return; // another screen or device took it
        const settled = await Promise.allSettled(job.candidates.map((id) => fetchTranscript(id)));
        const transcripts: { videoId: string; lines: { t: number; d: number; text: string }[] }[] = [];
        const errors: string[] = [];
        settled.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const lines = chunk(r.value)
              .slice(0, MAX_CHUNKS)
              .map((x) => ({ t: Math.round(x.t * 10) / 10, d: Math.round(x.d * 10) / 10, text: x.text }));
            transcripts.push({ videoId: job.candidates[i], lines });
          } else {
            errors.push(`${job.candidates[i]}: ${String(r.reason?.message ?? r.reason)}`);
          }
        });
        if (transcripts.length) await submit({ lessonId, transcripts });
        else await fail({ lessonId, error: errors.slice(0, 3).join("; ") || "no transcripts" });
      } catch (e: any) {
        try {
          await fail({ lessonId, error: String(e?.message ?? e) });
        } catch {}
      }
    }
  }, [waiting, claim, submit, fail]);
}
