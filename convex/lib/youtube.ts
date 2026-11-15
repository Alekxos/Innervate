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

function toHits(data: any, limit: number): VideoHit[] {
  const hits: VideoHit[] = [];
  for (const r of collect(data, "videoRenderer")) {
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

// Innertube search: small JSON, no consent/"sorry" redirects (the HTML results
// page redirect-loops when Convex runs several searches at once).
async function searchViaInnertube(query: string, limit: number): Promise<VideoHit[]> {
  const res = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", "Accept-Language": "en-US,en;q=0.9" },
    body: JSON.stringify({
      context: { client: { clientName: "WEB", clientVersion: "2.20251112.01.00", hl: "en", gl: "US" } },
      query,
      params: "EgIQAQ==", // videos only
    }),
  });
  if (!res.ok) throw new Error(`search HTTP ${res.status}`);
  return toHits(await res.json(), limit);
}

async function searchViaHtml(query: string, limit: number): Promise<VideoHit[]> {
  // sp=EgIQAQ== filters to videos only.
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    query,
  )}&sp=EgIQAQ%253D%253D&hl=en&gl=US`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
  const data = extractJson(await res.text(), "var ytInitialData");
  if (!data) throw new Error("YouTube search: could not parse results");
  return toHits(data, limit);
}

export async function searchYouTube(query: string, limit = 8): Promise<VideoHit[]> {
  let first = "";
  try {
    const hits = await searchViaInnertube(query, limit);
    if (hits.length) return hits;
    first = "innertube: 0 hits";
  } catch (e: any) {
    first = `innertube: ${e?.message}`;
  }
  try {
    return await searchViaHtml(query, limit);
  } catch (e: any) {
    throw new Error(`${first}; html: ${e?.message}`);
  }
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The ANDROID Innertube client returns caption tracks without an API key or
// the ~1MB watch page, and without cookies (iOS fetch may drop a Cookie header).
const ANDROID_VERSION = "20.10.38";
const ANDROID_UA = `com.google.android.youtube/${ANDROID_VERSION} (Linux; U; Android 14) gzip`;

/** Parses YouTube caption XML: srv1 (<text start dur>) or srv3 (<p t d>). */
export function parseCaptionXml(xml: string): Line[] {
  const lines: Line[] = [];
  const srv1 = /<text start="([\d.]+)" dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = srv1.exec(xml))) {
    const text = decode(m[3].replace(/<[^>]+>/g, ""));
    if (text) lines.push({ t: Number(m[1]), d: Number(m[2]), text });
  }
  if (!lines.length) {
    const srv3 = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
    while ((m = srv3.exec(xml))) {
      const text = decode(m[3].replace(/<[^>]+>/g, ""));
      if (text) lines.push({ t: Number(m[1]) / 1000, d: Number(m[2]) / 1000, text });
    }
  }
  return lines;
}

async function transcriptViaInnertube(videoId: string): Promise<Line[]> {
  const playerRes = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "User-Agent": ANDROID_UA,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: "ANDROID",
          clientVersion: ANDROID_VERSION,
          androidSdkVersion: 34,
          hl: "en",
          gl: "US",
        },
      },
      videoId,
    }),
  });
  if (!playerRes.ok) throw new Error(`player HTTP ${playerRes.status}`);
  const player = await playerRes.json();
  const tracks: any[] =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) {
    const reason = player?.playabilityStatus?.reason;
    throw new Error(`no captions${reason ? ` (${reason})` : ""}`);
  }
  const isEn = (t: any) => String(t.languageCode ?? "").indexOf("en") === 0;
  const en =
    tracks.find((t) => isEn(t) && t.kind !== "asr") ??
    tracks.find((t) => isEn(t)) ??
    tracks[0];
  const base = String(en.baseUrl).replace(/&fmt=[^&]*/, "");
  const capRes = await fetch(base, { headers: { "User-Agent": ANDROID_UA } });
  if (!capRes.ok) throw new Error(`captions HTTP ${capRes.status}`);
  const lines = parseCaptionXml(await capRes.text());
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

/** Direct YouTube fetch (no key). Used by the phone, which YouTube does not bot-block. */
export function fetchTranscript(videoId: string): Promise<Line[]> {
  return transcriptViaInnertube(videoId);
}

export async function getTranscript(videoId: string): Promise<Line[]> {
  const supadata = typeof process !== "undefined" ? process.env?.SUPADATA_API_KEY : undefined;
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
