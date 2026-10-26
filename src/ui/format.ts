export function formatTime(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, "0")}`;
}

export function formatRuler(sec: number): string {
  const m = Math.floor(sec / 60);
  const rest = sec - m * 60;
  return `${m}:${Number.isInteger(rest) ? String(rest).padStart(2, "0") : rest.toFixed(1).padStart(4, "0")}`;
}
