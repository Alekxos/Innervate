// Night-sky palette: deep indigo space, starlight text, violet accent, aurora mint, warm gold.
export const C = {
  bg: "#070A1A",
  card: "#111734",
  cardHi: "#1A2248",
  line: "#2A3363",
  text: "#F3F5FF",
  muted: "#8E97C4",
  accent: "#8F7CFF",
  accentSoft: "#201C4D",
  mint: "#62E6C3",
  mintSoft: "#103B3A",
  gold: "#FFD68A",
  red: "#FF6F8E",
  redSoft: "#3A1730",
};

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
