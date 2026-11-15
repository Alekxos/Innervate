// YouTube search + timestamped transcripts, without an API key.
// Runs inside Convex actions (plain fetch). If YouTube blocks the server,
// set SUPADATA_API_KEY in the Convex env to use a transcript API instead.

export type VideoHit = {
  videoId: string;
  title: string;
  channel: string;
  seconds: number;
  views: number;
};

export type Line = { t: number; d: number; text: string };

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "en-US,en;q=0.9",
  Cookie: "CONSENT=YES+1; SOCS=CAI",
};

function parseDuration(s: string | undefined): number {
  if (!s) return 0;
  return s
    .split(":")
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}

function parseViews(s: string | undefined): number {
  if (!s) return 0;
  const n = Number(s.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function extractJson(html: string, marker: string): any | null {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  // Walk braces to find the end of the object (strings may contain braces).
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function collect(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    for (const x of obj) collect(x, key, out);
    return out;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    else collect(obj[k], key, out);
  }
  return out;
}

export async function searchYouTube(query: string, limit = 8): Promise<VideoHit[]> {
  // sp=EgIQAQ== filters to videos only.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    query,
  )}&sp=EgIQAQ%253D%253D&hl=en&gl=US`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
  const html = await res.text();
  const data = extractJson(html, "var ytInitialData");
  if (!data) throw new Error("YouTube search: could not parse results");
  const renderers = collect(data, "videoRenderer");
  const hits: VideoHit[] = [];
  for (const r of renderers) {
    if (!r?.videoId) continue;
    hits.push({
      videoId: r.videoId,
      title: r.title?.runs?.map((x: any) => x.text).join("") ?? "",
      channel: r.ownerText?.runs?.[0]?.text ?? "",
      seconds: parseDuration(r.lengthText?.simpleText),
      views: parseViews(r.viewCountText?.simpleText),
    });
    if (hits.length >= limit) break;
  }
  return hits;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function transcriptViaInnertube(videoId: string): Promise<Line[]> {
  const watch = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: HEADERS,
  });
  const html = await watch.text();
  const key = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const playerRes = await fetch(
    `https://www.youtube.com/youtubei/v1/player?prettyPrint=false${key ? `&key=${key}` : ""}`,
    {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
        videoId,
      }),
    },
  );
  if (!playerRes.ok) throw new Error(`player HTTP ${playerRes.status}`);
  const player = await playerRes.json();
  const tracks: any[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    const reason = player?.playabilityStatus?.reason;
    throw new Error(`no captions${reason ? ` (${reason})` : ""}`);
  }
  const en =
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en")) ??
    tracks[0];
  const base = String(en.baseUrl).replace(/&fmt=[^&]*/, "");
  const capRes = await fetch(base, { headers: HEADERS });
  const xml = await capRes.text();
  const lines: Line[] = [];
  // srv1 format: <text start="1.23" dur="4.5">...</text>
  for (const m of xml.matchAll(/<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)) {
    lines.push({ t: Number(m[1]), d: Number(m[2]), text: decode(m[3]) });
  }
  // srv3 format: <p t="1230" d="4500">...</p>
  if (!lines.length) {
    for (const m of xml.matchAll(/<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)) {
      const text = decode(m[3].replace(/<[^>]+>/g, ""));
      if (text) lines.push({ t: Number(m[1]) / 1000, d: Number(m[2]) / 1000, text });
    }
  }
  if (!lines.length) throw new Error("empty transcript");
  return lines;
}

async function transcriptViaSupadata(videoId: string, apiKey: string): Promise<Line[]> {
  const res = await fetch(
    `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=en`,
    { headers: { "x-api-key": apiKey } },
  );
  if (!res.ok) throw new Error(`supadata HTTP ${res.status}`);
  const data = await res.json();
  return (data.content ?? []).map((c: any) => ({
    t: c.offset / 1000,
    d: c.duration / 1000,
    text: decode(c.text),
  }));
}

export async function getTranscript(videoId: string): Promise<Line[]> {
  const supadata = process.env.SUPADATA_API_KEY;
  if (supadata) return transcriptViaSupadata(videoId, supadata);
  return transcriptViaInnertube(videoId);
}

/** Merge caption fragments into ~8 second chunks so the LLM sees fewer, fuller lines. */
export function chunk(lines: Line[], target = 8): Line[] {
  const out: Line[] = [];
  let cur: Line | null = null;
  for (const l of lines) {
    if (!cur) cur = { ...l };
    else {
      cur.text += " " + l.text;
      cur.d = l.t + l.d - cur.t;
    }
    if (cur.d >= target || /[.?!]$/.test(cur.text) && cur.d >= target / 2) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
