/**
 * Integrated loudness (ITU-R BS.1770 style) and a look-ahead peak limiter,
 * run on rendered buffers at export time.
 */

type Coefs = [number, number, number, number, number]; // b0 b1 b2 a1 a2 (normalised by a0)

/** BS.1770 K-weighting stage 1: +4 dB high shelf at 1.5 kHz (Q 1/√2). */
function shelfCoefs(sr: number): Coefs {
  const A = Math.pow(10, 4 / 40);
  const w0 = (2 * Math.PI * 1500) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const sa = 2 * Math.sqrt(A) * alpha;
  const a0 = A + 1 - (A - 1) * cos + sa;
  return [
    (A * (A + 1 + (A - 1) * cos + sa)) / a0,
    (-2 * A * (A - 1 + (A + 1) * cos)) / a0,
    (A * (A + 1 + (A - 1) * cos - sa)) / a0,
    (2 * (A - 1 - (A + 1) * cos)) / a0,
    (A + 1 - (A - 1) * cos - sa) / a0,
  ];
}

/** BS.1770 K-weighting stage 2: 38 Hz high-pass (Q 0.5). */
function highpassCoefs(sr: number): Coefs {
  const w0 = (2 * Math.PI * 38) / sr;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * 0.5);
  const a0 = 1 + alpha;
  return [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

function biquad(x: Float32Array, [b0, b1, b2, a1, a2]: Coefs): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

function kWeight(buf: AudioBuffer): Float32Array[] {
  const sh = shelfCoefs(buf.sampleRate);
  const hp = highpassCoefs(buf.sampleRate);
  return Array.from({ length: buf.numberOfChannels }, (_, c) => biquad(biquad(buf.getChannelData(c), sh), hp));
}

/** Integrated loudness in LUFS (absolute gate −70, relative gate −10). */
export async function measureLufs(buf: AudioBuffer): Promise<number> {
  const chans = kWeight(buf);
  const sr = buf.sampleRate;
  const block = Math.round(0.4 * sr);
  const hop = Math.round(0.1 * sr);
  const blocks: number[] = [];
  for (let s = 0; s + block <= buf.length; s += hop) {
    let sum = 0;
    for (const d of chans) {
      let e = 0;
      for (let i = s; i < s + block; i++) e += d[i] * d[i];
      sum += e / block;
    }
    blocks.push(sum);
  }
  if (!blocks.length) return -Infinity;
  const lufs = (ms: number) => -0.691 + 10 * Math.log10(ms);
  const abs = blocks.filter((b) => lufs(b) > -70);
  if (!abs.length) return -Infinity;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((b) => lufs(b) > lufs(meanAbs) - 10);
  const mean = rel.reduce((a, b) => a + b, 0) / Math.max(1, rel.length);
  return lufs(mean);
}

export function peakOf(buf: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > m) m = a;
    }
  }
  return m;
}

export function applyGain(buf: AudioBuffer, k: number) {
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

/**
 * Look-ahead brickwall limiter (in place). Gain reduction reaches its target
 * before each peak arrives (5 ms look-ahead) and recovers over `releaseMs`.
 */
export function limit(buf: AudioBuffer, ceiling: number, lookMs = 5, releaseMs = 80) {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const d of chans) p = Math.max(p, Math.abs(d[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // Sliding-window minimum over the look-ahead so reduction starts early.
  const la = Math.max(1, Math.round((lookMs / 1000) * buf.sampleRate));
  const win = new Float32Array(n);
  const dq: number[] = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + la) head++;
    win[i] = need[dq[head]];
  }
  // Smooth: instant attack (already early), exponential release.
  const rel = Math.exp(-1 / ((releaseMs / 1000) * buf.sampleRate));
  let g = 1;
  for (let i = 0; i < n; i++) {
    g = win[i] < g ? win[i] : win[i] + (g - win[i]) * rel;
    for (const d of chans) d[i] *= g;
  }
}
