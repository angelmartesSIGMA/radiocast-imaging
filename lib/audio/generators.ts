import { SR } from "@/lib/studio/constants";
import type { TrackType } from "@/lib/studio/types";

const TAU = Math.PI * 2;

type Fill = (L: Float32Array, R: Float32Array, n: number) => void;

export interface Generator {
  id: string;
  name: string;
  kind: string;
  type: TrackType;
  dur: number;
  fn: Fill;
}

/** Linear fade at both edges to avoid clicks. */
function edge(L: Float32Array, R: Float32Array, n: number, a: number, b: number) {
  const na = Math.floor(a * SR);
  const nb = Math.floor(b * SR);
  for (let i = 0; i < na && i < n; i++) {
    const k = i / na;
    L[i] *= k;
    R[i] *= k;
  }
  for (let i = 0; i < nb && i < n; i++) {
    const k = i / nb;
    L[n - 1 - i] *= k;
    R[n - 1 - i] *= k;
  }
}

const noise = () => Math.random() * 2 - 1;

/** Built-in library, synthesised in the browser so the prototype ships with no audio assets. */
export const GENERATORS: Generator[] = [
  {
    id: "pulse",
    name: "Pulse bed 120",
    kind: "Bed",
    type: "bed",
    dur: 16,
    fn(L, R, n) {
      const ch = [
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [261.63, 329.63, 392],
        [196, 246.94, 293.66],
      ];
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const c = ch[Math.floor(t / 4) % 4];
        const e8 = Math.exp(-(t % 0.25) * 7);
        let s = 0;
        for (const f of c) s += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t);
        s *= 0.07 * (0.35 + 0.65 * e8);
        const bt = t % 0.5;
        const bass = Math.sin(((TAU * c[0]) / 2) * t) * 0.22 * Math.exp(-bt * 3);
        const kick =
          Math.sin(TAU * (50 * bt + (70 / 18) * (1 - Math.exp(-bt * 18)))) *
          Math.exp(-bt * 9) *
          0.5;
        const hat = bt >= 0.25 ? noise() * Math.exp(-(bt - 0.25) * 60) * 0.1 : 0;
        L[i] = s + bass + kick + hat * 0.7;
        R[i] = s + bass + kick + hat;
      }
      edge(L, R, n, 0.2, 0.8);
    },
  },
  {
    id: "pad",
    name: "Night pad",
    kind: "Bed",
    type: "bed",
    dur: 20,
    fn(L, R, n) {
      const fs = [110, 164.81, 220, 277.18, 329.63];
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        let l = 0;
        let r = 0;
        fs.forEach((f, k) => {
          const a = 0.5 + 0.5 * Math.sin(TAU * 0.08 * t + k * 1.3);
          l += Math.sin(TAU * f * t) * a;
          r += Math.sin(TAU * f * 1.004 * t) * a;
        });
        L[i] = l * 0.12;
        R[i] = r * 0.12;
      }
      edge(L, R, n, 1.5, 2);
    },
  },
  {
    id: "riser",
    name: "Riser sweep",
    kind: "Sweep",
    type: "fx",
    dur: 2.4,
    fn(L, R, n) {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const x = t / 2.4;
        ph += (TAU * 150 * Math.pow(20, x)) / SR;
        const nz = noise();
        const v = (Math.sin(ph) * 0.3 + nz * 0.35 * x) * x * x;
        L[i] = v;
        R[i] = v * 0.92 + nz * 0.04 * x;
      }
      edge(L, R, n, 0.01, 0.02);
    },
  },
  {
    id: "whoosh",
    name: "Stereo whoosh",
    kind: "Sweep",
    type: "fx",
    dur: 1.4,
    fn(L, R, n) {
      let y = 0;
      for (let i = 0; i < n; i++) {
        const x = i / n;
        const env = Math.pow(Math.sin(Math.PI * x), 2);
        y += (0.02 + 0.3 * env) * (noise() - y);
        const v = y * env * 2;
        L[i] = v * (1 - x * 0.8);
        R[i] = v * (0.2 + x * 0.8);
      }
    },
  },
  {
    id: "reverse",
    name: "Reverse swell",
    kind: "Sweep",
    type: "fx",
    dur: 1.8,
    fn(L, R, n) {
      for (let i = 0; i < n; i++) {
        const t = (n - 1 - i) / SR;
        const v =
          noise() * 0.4 * Math.exp(-t * 3) +
          Math.sin(TAU * 440 * t) * 0.3 * Math.exp(-t * 2) +
          Math.sin(TAU * 660 * t) * 0.15 * Math.exp(-t * 2.5);
        L[i] = v;
        R[i] = v * 0.95;
      }
      edge(L, R, n, 0.05, 0.004);
    },
  },
  {
    id: "impact",
    name: "Impact hit",
    kind: "Hit",
    type: "fx",
    dur: 1.6,
    fn(L, R, n) {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (TAU * (55 + 90 * Math.exp(-t * 12))) / SR;
        const v = Math.sin(ph) * Math.exp(-t * 2.8) * 0.85 + noise() * Math.exp(-t * 9) * 0.5;
        L[i] = v;
        R[i] = v;
      }
      edge(L, R, n, 0.002, 0.05);
    },
  },
  {
    id: "subdrop",
    name: "Sub drop",
    kind: "Hit",
    type: "fx",
    dur: 2.2,
    fn(L, R, n) {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (TAU * 110 * Math.pow(30 / 110, Math.min(1, t / 1.2))) / SR;
        const v = Math.sin(ph) * Math.exp(-t * 1.4);
        L[i] = v;
        R[i] = v;
      }
      edge(L, R, n, 0.004, 0.08);
    },
  },
  {
    id: "zap",
    name: "Laser zap",
    kind: "FX",
    type: "fx",
    dur: 0.6,
    fn(L, R, n) {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        ph += (TAU * 2400 * Math.pow(180 / 2400, t / 0.6)) / SR;
        const v = (Math.sin(ph) > 0 ? 1 : -1) * 0.3 * Math.exp(-t * 4);
        L[i] = v;
        R[i] = v;
      }
      edge(L, R, n, 0.002, 0.03);
    },
  },
  {
    id: "stutter",
    name: "Glitch stutter",
    kind: "FX",
    type: "fx",
    dur: 0.94,
    fn(L, R, n) {
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const g = t % 0.117 < 0.06 ? 1 : 0;
        const v =
          (Math.sin(TAU * 523.25 * t) + Math.sin(TAU * 784 * t) * 0.6) * g * 0.3 * (1 - t / 0.94);
        L[i] = v;
        R[i] = t % 0.234 < 0.117 ? v : v * 0.4;
      }
      edge(L, R, n, 0.002, 0.02);
    },
  },
  {
    id: "chime",
    name: "Logo chime",
    kind: "Stinger",
    type: "fx",
    dur: 2.0,
    fn(L, R, n) {
      const notes: [number, number][] = [
        [0, 659.25],
        [0.16, 783.99],
        [0.32, 1046.5],
      ];
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        let v = 0;
        for (const [t0, f] of notes) {
          if (t < t0) continue;
          const d = t - t0;
          v +=
            (Math.sin(TAU * f * d) + 0.3 * Math.sin(TAU * 2 * f * d)) *
            Math.exp(-d * 3) *
            Math.min(1, d * 200);
        }
        L[i] = v * 0.3;
        R[i] = v * 0.28;
      }
    },
  },
];
