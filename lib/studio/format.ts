/** m:ss.d */
export function fmt(t: number): string {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${d}`;
}

/** m:ss */
export function fmtShort(t: number): string {
  t = Math.max(0, t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function fmtSec(t: number): string {
  return t < 10 ? `${t.toFixed(2)}s` : `${t.toFixed(1)}s`;
}

export function fmtDb(v: number): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(1)} dB`;
}

export const dbToGain = (x: number) => Math.pow(10, x / 20);

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Percentage for a range input's filled track. */
export const fillPct = (v: number, min: number, max: number) =>
  `${clamp(((v - min) / (max - min)) * 100, 0, 100)}%`;
