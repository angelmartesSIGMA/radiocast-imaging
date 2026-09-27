import { SR } from "@/lib/studio/constants";
import { dbToGain } from "@/lib/studio/format";
import type { MixSnapshot } from "@/lib/studio/types";
import { normalize, wavePath } from "./dsp";
import { GENERATORS } from "./generators";

type Ctx = AudioContext | OfflineAudioContext;

/**
 * Thin Web Audio wrapper. Holds decoded buffers, schedules a mix snapshot,
 * and exposes the transport clock + output meters. All editor state lives
 * in the store; this class never reads it directly.
 */
export class AudioEngine {
  ctx: AudioContext;
  private out: GainNode;
  private aL: AnalyserNode;
  private aR: AnalyserNode;
  private mbuf = new Float32Array(1024);
  private sources: AudioScheduledSourceNode[] = [];
  private playWhen = 0;
  private playFrom = 0;
  private pv: AudioBufferSourceNode | null = null;
  private pvStart = 0;
  private pvDur = 0;
  private peaks: [number, number] = [0, 0];
  buffers = new Map<string, AudioBuffer>();
  running = false;

  constructor() {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    const sp = this.ctx.createChannelSplitter(2);
    this.out.connect(sp);
    this.aL = this.ctx.createAnalyser();
    this.aR = this.ctx.createAnalyser();
    this.aL.fftSize = this.aR.fftSize = 1024;
    sp.connect(this.aL, 0);
    sp.connect(this.aR, 1);
  }

  /** Synthesize the built-in library. Returns sound metadata. */
  buildLibrary() {
    return GENERATORS.map((g) => {
      const n = Math.floor(g.dur * SR);
      const L = new Float32Array(n);
      const R = new Float32Array(n);
      g.fn(L, R, n);
      normalize([L, R]);
      const b = this.ctx.createBuffer(2, n, SR);
      b.copyToChannel(L, 0);
      b.copyToChannel(R, 1);
      this.buffers.set(g.id, b);
      return {
        id: g.id,
        name: g.name,
        kind: g.kind,
        type: g.type,
        dur: g.dur,
        path: wavePath(L),
        user: false,
      };
    });
  }

  async decode(ab: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
  }

  /** Wire a mix snapshot into `dest`, starting playback of timeline time `from` at context time `when`. */
  schedule(ctx: Ctx, dest: AudioNode, mix: MixSnapshot, from: number, when: number) {
    const { clips, lanes, duck, duckDb, master, limiter } = mix;
    const nodes: AudioScheduledSourceNode[] = [];
    const anySolo = lanes.some((l) => l.solo);
    const audible = (id: string) => {
      const l = lanes.find((x) => x.id === id);
      return !!l && (anySolo ? l.solo : !l.mute);
    };
    const mg = ctx.createGain();
    mg.gain.value = dbToGain(master);
    if (limiter) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -1.5;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.08;
      mg.connect(lim);
      lim.connect(dest);
    } else mg.connect(dest);

    // Merge voice clip spans so beds duck once per phrase rather than per clip.
    const voiceSpans: [number, number][] = clips
      .filter((c) => lanes.find((l) => l.id === c.lane)?.type === "voice" && audible(c.lane))
      .map((c) => [c.start, c.start + c.len]);
    voiceSpans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of voiceSpans) {
      const m = merged[merged.length - 1];
      if (m && s[0] <= m[1] + 0.4) m[1] = Math.max(m[1], s[1]);
      else merged.push([s[0], s[1]]);
    }

    const laneGain: Record<string, GainNode> = {};
    for (const l of lanes) {
      const g = ctx.createGain();
      g.gain.value = dbToGain(l.gain);
      laneGain[l.id] = g;
      if (l.type === "bed" && duck && merged.length) {
        const d = ctx.createGain();
        g.connect(d);
        d.connect(mg);
        d.gain.setValueAtTime(1, when);
        const to = dbToGain(duckDb);
        for (const [a, b] of merged) {
          if (b <= from) continue;
          if (a <= from) d.gain.setValueAtTime(to, when);
          else d.gain.setTargetAtTime(to, Math.max(when, when + a - from - 0.15), 0.06);
          d.gain.setTargetAtTime(1, when + b - from, 0.25);
        }
      } else g.connect(mg);
    }

    for (const c of clips) {
      if (!audible(c.lane)) continue;
      const buf = this.buffers.get(c.soundId);
      if (!buf) continue;
      const end = c.start + c.len;
      if (end <= from) continue;
      const off = Math.max(0, from - c.start);
      const at = when + Math.max(0, c.start - from);
      const rem = c.len - off;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const lin = dbToGain(c.gain);
      if (c.fadeIn > 0 && off < c.fadeIn) {
        g.gain.setValueAtTime((lin * off) / c.fadeIn, at);
        g.gain.linearRampToValueAtTime(lin, at + (c.fadeIn - off));
      } else g.gain.setValueAtTime(lin, at);
      if (c.fadeOut > 0) {
        const fs = c.len - c.fadeOut - off;
        if (fs > 0) g.gain.setValueAtTime(lin, at + fs);
        else g.gain.setValueAtTime(lin * (rem / c.fadeOut), at);
        g.gain.linearRampToValueAtTime(0, at + rem);
      }
      src.connect(g);
      g.connect(laneGain[c.lane]);
      src.start(at, c.offset + off, rem);
      nodes.push(src);
    }
    return nodes;
  }

  start(mix: MixSnapshot, from: number) {
    this.stopSources();
    this.stopPreview();
    void this.ctx.resume();
    this.playWhen = this.ctx.currentTime + 0.05;
    this.playFrom = from;
    this.sources = this.schedule(this.ctx, this.out, mix, from, this.playWhen);
    this.running = true;
  }

  stop() {
    this.stopSources();
    this.running = false;
  }

  private stopSources() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  /** Current transport position in seconds (only meaningful while running). */
  position() {
    return this.playFrom + Math.max(0, this.ctx.currentTime - this.playWhen);
  }

  preview(id: string, onEnd: () => void) {
    this.stopPreview();
    void this.ctx.resume();
    const buf = this.buffers.get(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.out);
    src.start();
    src.onended = () => {
      if (this.pv === src) {
        this.pv = null;
        onEnd();
      }
    };
    this.pv = src;
    this.pvStart = this.ctx.currentTime;
    this.pvDur = buf.duration;
  }

  /** 0–1 progress of the current library preview. */
  previewProgress() {
    if (!this.pv || !this.pvDur) return 0;
    return Math.min(1, (this.ctx.currentTime - this.pvStart) / this.pvDur);
  }

  /** Short sine blip for the record count-in. */
  beep(freq = 880, dur = 0.09) {
    void this.ctx.resume();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.ctx.currentTime;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  stopPreview() {
    if (!this.pv) return;
    const p = this.pv;
    this.pv = null;
    try {
      p.stop();
    } catch {
      /* noop */
    }
  }

  /** Decaying peak levels (linear) for L/R. Call once per animation frame. */
  meters(): [number, number] {
    const active = this.running || !!this.pv;
    const read = (a: AnalyserNode, prev: number) => {
      if (!active) return prev * 0.85;
      a.getFloatTimeDomainData(this.mbuf);
      let p = 0;
      for (let i = 0; i < this.mbuf.length; i++) {
        const v = Math.abs(this.mbuf[i]);
        if (v > p) p = v;
      }
      return Math.max(p, prev * 0.92);
    };
    this.peaks = [read(this.aL, this.peaks[0]), read(this.aR, this.peaks[1])];
    return this.peaks;
  }

  async render(mix: MixSnapshot, end: number): Promise<AudioBuffer> {
    const off = new OfflineAudioContext(2, Math.ceil((end + 0.1) * SR), SR);
    this.schedule(off, off.destination, mix, 0, 0);
    return off.startRendering();
  }

  close() {
    this.stop();
    this.stopPreview();
    void this.ctx.close().catch(() => {});
  }
}

let engine: AudioEngine | null = null;

export function getEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
