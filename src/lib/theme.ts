export const C = {
  bg: "#0B0E14",
  card: "#151A23",
  cardHi: "#1C2330",
  line: "#263042",
  text: "#F2F4F8",
  muted: "#8A93A6",
  accent: "#7C5CFF",
  accentSoft: "#2A2150",
  mint: "#2EE6A6",
  mintSoft: "#123A2F",
  gold: "#FFC24B",
  red: "#FF5C7A",
  redSoft: "#3A1621",
};

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
