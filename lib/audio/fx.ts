/**
 * Per-track processing presets, built from stock Web Audio nodes so they work
 * identically in live playback and in the offline export render.
 */

type Ctx = BaseAudioContext;

export interface FxPreset {
  id: string;
  label: string;
  blurb: string;
  /** Seconds of tail the effect adds after the last clip (reverb/echo). */
  tail: number;
}

export const FX_PRESETS: FxPreset[] = [
  { id: "none", label: "No FX", blurb: "Straight through", tail: 0 },
  { id: "broadcast", label: "Broadcast", blurb: "Tight compression, presence and air — the classic imaging voice", tail: 0 },
  { id: "big", label: "Big voice", blurb: "Broadcast chain plus a short plate for size", tail: 1.4 },
  { id: "telephone", label: "Telephone", blurb: "Narrow band, a little grit", tail: 0 },
  { id: "megaphone", label: "Megaphone", blurb: "Driven mids for shouty call-outs", tail: 0 },
  { id: "hall", label: "Hall reverb", blurb: "Long, wide tail — great on stingers and last words", tail: 3.2 },
  { id: "echo", label: "Echo", blurb: "Quarter-note delay that trails off (at 120 BPM)", tail: 2.4 },
];

export const fxLabel = (id?: string) => FX_PRESETS.find((p) => p.id === (id ?? "none"))?.label ?? "No FX";
export const fxTail = (id?: string) => FX_PRESETS.find((p) => p.id === id)?.tail ?? 0;

const irCache = new Map<string, AudioBuffer>();

/** Synthetic stereo impulse response: decaying noise with a darker tail. */
function impulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}:${decay}`;
  const hit = irCache.get(key);
  if (hit) return hit;
  const n = Math.floor(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += (Math.random() * 2 - 1 - lp) * (0.9 - t * 0.7); // gets darker over time
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  irCache.set(key, buf);
  return buf;
}

function shaper(ctx: Ctx, amount: number): WaveShaperNode {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = curve;
  ws.oversample = "2x";
  return ws;
}

function biquad(ctx: Ctx, type: BiquadFilterType, freq: number, gain = 0, q = 0.707) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.gain.value = gain;
  f.Q.value = q;
  return f;
}

function gainNode(ctx: Ctx, v: number) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

/** Wire nodes in series and return the ends. */
function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return { input: nodes[0], output: nodes[nodes.length - 1] };
}

function broadcast(ctx: Ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -26;
  comp.knee.value = 6;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.12;
  return chain(
    biquad(ctx, "highpass", 90),
    biquad(ctx, "peaking", 250, -2, 1),
    biquad(ctx, "peaking", 3500, 4, 0.9),
    biquad(ctx, "highshelf", 9000, 3),
    comp,
    gainNode(ctx, 1.8),
  );
}

/** Parallel dry/wet send around `wet`. */
function withSend(ctx: Ctx, wet: { input: AudioNode; output: AudioNode }, mix: number) {
  const input = gainNode(ctx, 1);
  const output = gainNode(ctx, 1);
  input.connect(output);
  const send = gainNode(ctx, mix);
  input.connect(send);
  send.connect(wet.input);
  wet.output.connect(output);
  return { input, output };
}

function reverb(ctx: Ctx, seconds: number, decay: number) {
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, seconds, decay);
  return chain(biquad(ctx, "highpass", 200), conv, biquad(ctx, "lowpass", 7000));
}

export function buildFx(ctx: Ctx, id: string | undefined): { input: AudioNode; output: AudioNode } {
  switch (id) {
    case "broadcast":
      return broadcast(ctx);
    case "big": {
      const b = broadcast(ctx);
      const r = withSend(ctx, reverb(ctx, 1.4, 3), 0.28);
      b.output.connect(r.input);
      return { input: b.input, output: r.output };
    }
    case "telephone":
      return chain(
        biquad(ctx, "highpass", 450, 0, 0.9),
        biquad(ctx, "peaking", 1600, 6, 1.2),
        shaper(ctx, 2.2),
        biquad(ctx, "lowpass", 3200, 0, 0.9),
        gainNode(ctx, 1.3),
      );
    case "megaphone":
      return chain(
        biquad(ctx, "bandpass", 1300, 0, 1.1),
        gainNode(ctx, 3),
        shaper(ctx, 5),
        biquad(ctx, "lowpass", 4200),
        gainNode(ctx, 0.9),
      );
    case "hall":
      return withSend(ctx, reverb(ctx, 3.2, 2.2), 0.45);
    case "echo": {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = 0.5; // quarter note at 120 BPM
      const fb = gainNode(ctx, 0.38);
      const tone = biquad(ctx, "lowpass", 3500);
      delay.connect(tone);
      tone.connect(fb);
      fb.connect(delay);
      return withSend(ctx, { input: delay, output: tone }, 0.4);
    }
    default: {
      const g = gainNode(ctx, 1);
      return { input: g, output: g };
    }
  }
}
