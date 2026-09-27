"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { encodeWav, wavePath } from "@/lib/audio/dsp";
import { AudioEngine, getEngine } from "@/lib/audio/engine";
import { applyGain, limit, measureLufs, peakOf } from "@/lib/audio/loudness";
import { clock, dom } from "./clock";
import { audioStore } from "./idb";
import { defaultLanes, LANE_IDS, TEMPLATES } from "./templates";
import { COLORS, HEADER_W, SCALES, TRACK_TYPES, VOICES } from "./constants";
import { clamp, dbToGain, fmt } from "./format";
import type { Clip, Lane, LibraryFilter, MixSnapshot, Sound, TrackType } from "./types";

type Snapshot = { clips: Clip[]; lanes: Lane[] };

export interface LibDrag {
  soundId: string;
  name: string;
  type: TrackType;
  x: number;
  y: number;
}
export interface Ghost {
  lane: string;
  start: number;
  len: number;
}
export interface ContextMenu {
  clipId: string;
  x: number;
  y: number;
}

export interface Toast {
  msg: string;
  color: string;
  id: number;
  action?: { label: string; run: () => void };
}

/** Context for the command palette; `lane`/`at` set when opened by double-clicking a track. */
export interface PaletteCtx {
  lane?: string;
  at?: number;
}

export interface StudioState {
  // document
  sounds: Sound[];
  clips: Clip[];
  lanes: Lane[];
  projectName: string;
  master: number;
  duck: boolean;
  duckDb: number;
  limiter: boolean;
  target: number | null;
  past: Snapshot[];
  future: Snapshot[];
  /** True once a session exists in storage (so reloads restore it instead of the demo). */
  hasSession: boolean;

  // transport
  ready: boolean;
  playing: boolean;
  recording: boolean;
  recAt: number;
  recLane: string | null;
  loop: boolean;
  previewId: string | null;
  exporting: boolean;
  countIn: number | null;
  countInOn: boolean;

  // view
  pps: number;
  viewW: number;
  vw: number;
  libOpen: boolean;
  inspOpen: boolean;
  snapOn: boolean;
  /** Track row height in px (user adjustable). */
  laneH: number;
  bpm: number;
  gridMode: "time" | "beats";
  /** Export loudness target in LUFS; null = no normalisation. */
  loudTarget: number | null;
  loudness: { lufs: number; peakDb: number; at: number; source: "mix" | "export" } | null;
  measuring: boolean;
  filter: LibraryFilter;
  search: string;
  selected: string | null;

  // interaction
  drag: LibDrag | null;
  ghost: Ghost | null;
  snapT: number | null;
  tag: string | null;
  activeClip: string | null;
  fileDrag: boolean;
  fileMark: { lane: string; at: number } | null;
  libHover: boolean;
  menu: ContextMenu | null;
  renaming: string | null;

  // overlays
  toast: Toast | null;
  drawer: boolean;
  shortcuts: boolean;
  palette: PaletteCtx | null;

  // brief
  sent: boolean;
  station: string;
  email: string;
  notes: string;
  voice: string;
  deliverables: string[];
  turnaround: string;
}

interface Actions {
  init(): Promise<void>;
  set: (patch: Partial<StudioState>) => void;
  toastMsg(msg: string, color?: string, action?: Toast["action"]): void;
  newSession(templateId: string): void;

  commit(): void;
  undo(): void;
  redo(): void;

  mix(): MixSnapshot;
  sessionEnd(clips?: Clip[]): number;
  total(): number;
  scale(): [number, number];

  play(force?: boolean): void;
  stop(): void;
  togglePlay(): void;
  seek(t: number): void;
  tick(): void;
  restartIfPlaying(): void;
  preview(id: string): void;
  stopPreview(): void;

  snapTime(t: number, len: number, exclude: string | null): { t: number; snapT: number | null };
  addClip(soundId: string, lane?: string | null, start?: number): void;
  removeClip(id: string): void;
  updateClip(id: string, patch: Partial<Clip>, restart?: boolean): void;
  duplicate(id?: string | null): void;
  toggleReverse(id?: string | null): void;
  measureLoudness(): Promise<void>;
  split(): void;

  addLane(type: TrackType): void;
  setLane(id: string, patch: Partial<Lane>, restart?: boolean): void;
  removeLane(id: string): void;

  zoomBy(k: number, clientX?: number): void;
  zoomFit(): void;

  importFiles(files: File[], target: { lane: string; at: number } | "library" | null): Promise<void>;
  toggleRecord(): Promise<void>;
  exportWav(): Promise<void>;
}

export type Studio = StudioState & Actions;

let nid = 1;
const uid = (p: string) => `${p}${nid++}`;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let recorder: MediaRecorder | null = null;
let countStream: MediaStream | null = null;
let takes = 0;
let initing = false;

/** Keep generated ids ahead of any restored ones. */
function bumpIds(ids: string[]) {
  for (const id of ids) {
    const n = parseInt(id.replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n >= nid) nid = n + 1;
  }
  takes = Math.max(takes, ids.filter((i) => i.startsWith("u")).length);
}

const undoAction = () => ({ label: "Undo", run: () => useStudio.getState().undo() });

const initialW = typeof window === "undefined" ? 1440 : window.innerWidth;

export const useStudio = create<Studio>()(
  persist(
    (set, get) => ({
      sounds: [],
      clips: [],
      lanes: defaultLanes(),
      projectName: "Station ID — Summer",
      master: 0,
      duck: true,
      duckDb: -12,
      limiter: true,
      target: 20,
      past: [],
      future: [],
      hasSession: false,

      ready: false,
      playing: false,
      recording: false,
      recAt: 0,
      recLane: null,
      loop: false,
      previewId: null,
      exporting: false,
      countIn: null,
      countInOn: true,

      pps: 40,
      viewW: 900,
      vw: initialW,
      libOpen: initialW >= 1200,
      inspOpen: initialW >= 1024,
      snapOn: true,
      laneH: 68,
      bpm: 120,
      gridMode: "time",
      loudTarget: -14,
      loudness: null,
      measuring: false,
      filter: "all",
      search: "",
      selected: null,

      drag: null,
      ghost: null,
      snapT: null,
      tag: null,
      activeClip: null,
      fileDrag: false,
      fileMark: null,
      libHover: false,
      menu: null,
      renaming: null,

      toast: null,
      drawer: false,
      shortcuts: false,
      palette: null,

      sent: false,
      station: "",
      email: "",
      notes: "",
      voice: VOICES[0],
      deliverables: ["Station ID"],
      turnaround: "standard",

      // ───────────────────────────── basics
      set: (patch) => set(patch),

      async init() {
        if (initing) return;
        initing = true;
        const engine = getEngine();
        const sounds = engine.buildLibrary();
        const st = get();
        bumpIds([...st.clips.map((c) => c.id), ...st.lanes.map((l) => l.id)]);
        if (!st.hasSession) {
          const t = TEMPLATES[0];
          set({ sounds, ready: true, hasSession: true, clips: buildClips(t.id), lanes: defaultLanes(t.laneFx), target: t.target, projectName: t.title });
        } else set({ sounds, ready: true });

        // Restore uploads and takes from IndexedDB.
        const rows = await audioStore.all();
        const restored: Sound[] = [];
        for (const r of rows) {
          try {
            const buf = await engine.decode(await r.blob.arrayBuffer());
            engine.buffers.set(r.id, buf);
            restored.push({ id: r.id, name: r.name, kind: r.kind, type: r.type, dur: buf.duration, path: wavePath(buf.getChannelData(0)), user: true });
          } catch {
            void audioStore.remove(r.id);
          }
        }
        bumpIds(restored.map((x) => x.id));
        const known = new Set([...sounds, ...restored].map((x) => x.id));
        set((cur) => ({ sounds: [...cur.sounds, ...restored], clips: cur.clips.filter((c) => known.has(c.soundId)) }));
      },

      newSession(templateId) {
        const t = TEMPLATES.find((x) => x.id === templateId);
        if (!t) return;
        const s = get();
        if (s.playing) s.stop();
        s.commit();
        clock.set(0);
        set({ clips: buildClips(t.id), lanes: defaultLanes(t.laneFx), target: t.target, projectName: t.title, selected: null, palette: null });
        const prev = { projectName: s.projectName, target: s.target };
        get().toastMsg(`Started “${t.name}”`, COLORS.violet, {
          label: "Undo",
          run: () => {
            get().undo();
            set(prev);
          },
        });
        requestAnimationFrame(() => get().zoomFit());
      },

      toastMsg(msg, color = COLORS.violet, action) {
        clearTimeout(toastTimer);
        set({ toast: { msg, color, id: Date.now(), action } });
        toastTimer = setTimeout(() => set({ toast: null }), action ? 5000 : 2800);
      },

      // ───────────────────────────── history
      commit() {
        const { clips, lanes, past } = get();
        set({ past: [...past.slice(-119), { clips, lanes }], future: [] });
      },
      undo() {
        const { past, future, clips, lanes, selected } = get();
        const h = past[past.length - 1];
        if (!h) return;
        set({
          past: past.slice(0, -1),
          future: [...future, { clips, lanes }],
          clips: h.clips,
          lanes: h.lanes,
          selected: h.clips.some((c) => c.id === selected) ? selected : null,
        });
        get().restartIfPlaying();
      },
      redo() {
        const { past, future, clips, lanes } = get();
        const h = future[future.length - 1];
        if (!h) return;
        set({ future: future.slice(0, -1), past: [...past, { clips, lanes }], clips: h.clips, lanes: h.lanes });
        get().restartIfPlaying();
      },

      // ───────────────────────────── derived
      mix() {
        const { clips, lanes, duck, duckDb, master, limiter } = get();
        return { clips, lanes, duck, duckDb, master, limiter };
      },
      sessionEnd(clips = get().clips) {
        let e = 0;
        for (const c of clips) e = Math.max(e, c.start + c.len);
        return e;
      },
      total() {
        const { pps, viewW, target } = get();
        return Math.max(get().sessionEnd() + 12, (target ?? 0) + 8, (viewW - HEADER_W) / pps, 20);
      },
      scale() {
        const { pps, gridMode, bpm } = get();
        if (gridMode === "beats") {
          const beat = 60 / bpm;
          // [major, minor] in beats: bars/beats when zoomed in, bigger steps when zoomed out.
          const steps: [number, number][] = [
            [1, 0.25],
            [4, 1],
            [8, 2],
            [16, 4],
            [32, 8],
          ];
          const pick = steps.find(([mj]) => mj * beat * pps >= 60) ?? steps[steps.length - 1];
          return [pick[0] * beat, pick[1] * beat];
        }
        return SCALES.find((sc) => sc[0] * pps >= 72) ?? SCALES[SCALES.length - 1];
      },

      // ───────────────────────────── transport
      play(force) {
        const s = get();
        const end = s.sessionEnd();
        if (!end && !force) {
          s.toastMsg("Drag a sound onto a track first");
          return;
        }
        if (!force && clock.t >= end - 0.05) clock.set(0);
        getEngine().start(s.mix(), clock.t);
        set({ playing: true, previewId: null });
      },
      stop() {
        getEngine().stop();
        set({ playing: false });
      },
      togglePlay() {
        const s = get();
        if (s.recording) {
          recorder?.stop();
          return;
        }
        if (s.playing) s.stop();
        else s.play();
      },
      seek(t) {
        clock.set(Math.max(0, t));
        get().restartIfPlaying();
      },
      restartIfPlaying() {
        const s = get();
        if (s.playing && !s.recording) getEngine().start(s.mix(), clock.t);
      },
      tick() {
        const s = get();
        if (!s.playing) return;
        const engine = getEngine();
        const t = engine.position();
        const end = s.sessionEnd();
        const loopEnd = s.target ?? end;
        if (s.loop && !s.recording && loopEnd > 0 && t >= loopEnd) {
          clock.set(0);
          engine.start(s.mix(), 0);
          return;
        }
        clock.set(t);
        if (!s.recording && t >= end + AudioEngine.tail(s.mix()) + 0.15) s.stop();
      },
      preview(id) {
        const s = get();
        const engine = getEngine();
        if (s.previewId === id) {
          s.stopPreview();
          return;
        }
        if (s.playing) s.stop();
        engine.preview(id, () => set({ previewId: null }));
        set({ previewId: id });
      },
      stopPreview() {
        getEngine().stopPreview();
        if (get().previewId) set({ previewId: null });
      },

      // ───────────────────────────── editing
      snapTime(t, len, exclude) {
        const s = get();
        const th = 9 / s.pps;
        let best: { d: number; t: number; s: number } | null = null;
        const cands = [0, clock.t];
        if (s.target) cands.push(s.target);
        for (const c of s.clips) if (c.id !== exclude) cands.push(c.start, c.start + c.len);
        for (const c of cands) {
          const d1 = Math.abs(t - c);
          if (d1 < th && (!best || d1 < best.d)) best = { d: d1, t: c, s: c };
          if (len) {
            const d2 = Math.abs(t + len - c);
            if (d2 < th && (!best || d2 < best.d)) best = { d: d2, t: c - len, s: c };
          }
        }
        if (s.snapOn && best) return { t: Math.max(0, best.t), snapT: best.s };
        if (s.snapOn) {
          const q = s.scale()[1];
          return { t: Math.max(0, Math.round(t / q) * q), snapT: null };
        }
        return { t: Math.max(0, t), snapT: null };
      },

      addClip(soundId, lane, start) {
        const s = get();
        const snd = s.sounds.find((x) => x.id === soundId);
        if (!snd) return;
        const l =
          s.lanes.find((x) => x.id === lane) ??
          s.lanes.find((x) => x.type === snd.type) ??
          s.lanes[0];
        const bed = l.type === "bed";
        const c: Clip = {
          id: uid("c"),
          soundId,
          lane: l.id,
          start: Math.max(0, start ?? clock.t),
          offset: 0,
          len: snd.dur,
          gain: bed ? -6 : 0,
          fadeIn: 0,
          fadeOut: bed ? Math.min(1, snd.dur / 4) : 0,
        };
        s.commit();
        set({ clips: [...get().clips, c], selected: c.id });
        get().restartIfPlaying();
      },
      removeClip(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        const name = c && s.sounds.find((x) => x.id === c.soundId)?.name;
        s.commit();
        if (name) s.toastMsg(`Deleted “${name}”`, COLORS.red, undoAction());
        set((st) => ({ clips: st.clips.filter((c) => c.id !== id), selected: st.selected === id ? null : st.selected, menu: null }));
        get().restartIfPlaying();
      },
      updateClip(id, patch, restart = true) {
        set((st) => ({ clips: st.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
        if (restart) get().restartIfPlaying();
      },
      duplicate(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === (id ?? s.selected));
        if (!c) return;
        const n = { ...c, id: uid("c"), start: c.start + c.len };
        s.commit();
        set((st) => ({ clips: [...st.clips, n], selected: n.id, menu: null }));
        get().restartIfPlaying();
      },
      toggleReverse(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === (id ?? s.selected));
        if (!c) return;
        const snd = s.sounds.find((x) => x.id === c.soundId);
        s.commit();
        // Keep the same audible region: mirror the offset inside the source.
        const offset = snd ? Math.max(0, snd.dur - c.offset - c.len) : c.offset;
        s.updateClip(c.id, { reverse: !c.reverse, offset, fadeIn: c.fadeOut, fadeOut: c.fadeIn });
        set({ menu: null });
        s.toastMsg(c.reverse ? "Clip plays forwards" : "Clip reversed", COLORS.violet, undoAction());
      },

      split() {
        const s = get();
        const t = clock.t;
        const hit = (c: Clip) => t > c.start + 0.05 && t < c.start + c.len - 0.05;
        let targets = s.clips.filter((c) => c.id === s.selected && hit(c));
        if (!targets.length) targets = s.clips.filter(hit);
        if (!targets.length) {
          s.toastMsg("Move the playhead over a clip to split it");
          return;
        }
        s.commit();
        const ids = new Set(targets.map((c) => c.id));
        const next: Clip[] = [];
        for (const c of s.clips) {
          if (!ids.has(c.id)) {
            next.push(c);
            continue;
          }
          const a = t - c.start;
          next.push(
            { ...c, len: a, fadeOut: 0, fadeIn: Math.min(c.fadeIn, a) },
            { ...c, id: uid("c"), start: t, offset: c.offset + a, len: c.len - a, fadeIn: 0, fadeOut: Math.min(c.fadeOut, c.len - a) },
          );
        }
        set({ clips: next, menu: null });
        get().restartIfPlaying();
        s.toastMsg(`Split ${targets.length} clip${targets.length > 1 ? "s" : ""} at ${fmt(t)}`, COLORS.violet, undoAction());
      },

      addLane(type) {
        const s = get();
        const n = s.lanes.filter((l) => l.type === type).length;
        const l: Lane = {
          id: uid("L"),
          type,
          label: n ? `${TRACK_TYPES[type].label} ${n + 1}` : TRACK_TYPES[type].label,
          fx: type === "voice" ? "broadcast" : undefined,
          gain: 0,
          mute: false,
          solo: false,
        };
        s.commit();
        set({ lanes: [...get().lanes, l] });
      },
      setLane(id, patch, restart = true) {
        set((st) => ({ lanes: st.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
        if (restart) get().restartIfPlaying();
      },
      removeLane(id) {
        const s = get();
        const l = s.lanes.find((x) => x.id === id);
        s.commit();
        if (l) s.toastMsg(`Removed “${l.label}”`, COLORS.red, undoAction());
        set((st) => ({ lanes: st.lanes.filter((l) => l.id !== id), clips: st.clips.filter((c) => c.lane !== id) }));
        get().restartIfPlaying();
      },

      // ───────────────────────────── view
      zoomBy(k, clientX) {
        const sc = dom.scroll;
        const old = get().pps;
        const pps = clamp(old * k, 6, 600);
        let t = clock.t;
        let px: number | null = null;
        if (sc && clientX != null) {
          const r = sc.getBoundingClientRect();
          px = clientX - r.left;
          t = (sc.scrollLeft + px - HEADER_W) / old;
        }
        set({ pps });
        requestAnimationFrame(() => {
          if (!sc) return;
          const ax = px ?? sc.clientWidth / 2;
          sc.scrollLeft = Math.max(0, HEADER_W + t * pps - ax);
          clock.set(clock.t);
        });
      },
      zoomFit() {
        const s = get();
        const end = Math.max(8, s.sessionEnd() + 1, (s.target ?? 0) + 1);
        set({ pps: Math.max(6, (s.viewW - HEADER_W - 40) / end) });
        requestAnimationFrame(() => {
          if (dom.scroll) dom.scroll.scrollLeft = 0;
          clock.set(clock.t);
        });
      },

      // ───────────────────────────── files & recording
      async importFiles(files, target) {
        const s = get();
        const audio = files.filter(
          (f) => (f.type || "").startsWith("audio/") || /\.(wav|mp3|aiff?|m4a|ogg|flac|aac)$/i.test(f.name),
        );
        if (!audio.length) {
          if (files.length) s.toastMsg("Those don’t look like audio files", COLORS.red);
          return;
        }
        let at = target && target !== "library" ? target.at : clock.t;
        for (const f of audio) {
          try {
            const buf = await getEngine().decode(await f.arrayBuffer());
            const laneObj = target && target !== "library" ? get().lanes.find((l) => l.id === target.lane) : undefined;
            const type: TrackType = laneObj ? laneObj.type : buf.duration > 10 ? "bed" : "voice";
            const lane =
              target === "library" ? null : laneObj ? laneObj.id : get().lanes.find((l) => l.type === type)?.id ?? null;
            addUserSound(buf, f, f.name.replace(/\.[^.]+$/, ""), "Upload", type, lane, at);
            at += buf.duration;
          } catch {
            get().toastMsg(`Couldn’t read ${f.name}`, COLORS.red);
          }
        }
      },

      async toggleRecord() {
        const s = get();
        if (s.recording) {
          recorder?.stop();
          return;
        }
        if (s.countIn != null) {
          // Cancel during count-in.
          countStream?.getTracks().forEach((t) => t.stop());
          countStream = null;
          set({ countIn: null });
          return;
        }
        if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
          s.toastMsg("Recording isn’t supported in this browser", COLORS.red);
          return;
        }
        const selC = s.clips.find((c) => c.id === s.selected);
        const selL = selC && s.lanes.find((l) => l.id === selC.lane);
        const lane = selL?.type === "voice" ? selL.id : s.lanes.find((l) => l.type === "voice")?.id;
        if (!lane) {
          s.toastMsg("Add a voice track to record onto", COLORS.red);
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (get().playing) get().stop();
          if (get().countInOn) {
            countStream = stream;
            for (let n = 3; n >= 1; n--) {
              if (countStream !== stream) return; // cancelled
              set({ countIn: n });
              getEngine().beep(n === 1 ? 1320 : 880);
              await new Promise((r) => setTimeout(r, 800));
            }
            if (countStream !== stream) return;
            countStream = null;
            set({ countIn: null });
          }
          const chunks: Blob[] = [];
          const rec = new MediaRecorder(stream);
          recorder = rec;
          if (get().playing) get().stop();
          const recAt = clock.t;
          rec.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          rec.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            getEngine().stop();
            set({ recording: false, playing: false, recLane: null });
            recorder = null;
            try {
              const blob = new Blob(chunks, { type: rec.mimeType });
              const buf = await getEngine().decode(await blob.arrayBuffer());
              takes += 1;
              addUserSound(buf, blob, `Take ${takes}`, "Mic", "voice", lane, recAt);
            } catch {
              get().toastMsg("That take couldn’t be saved", COLORS.red);
            }
          };
          rec.start();
          set({ recording: true, recAt, recLane: lane });
          get().play(true);
        } catch {
          set({ countIn: null });
          get().toastMsg("Microphone access was blocked", COLORS.red);
        }
      },

      async exportWav() {
        const s = get();
        const end = s.sessionEnd();
        if (!end) {
          s.toastMsg("Nothing to export yet");
          return;
        }
        if (s.exporting) return;
        set({ exporting: true });
        try {
          const buf = await getEngine().render(s.mix(), end);
          const ceiling = dbToGain(-1);
          // Loudness normalise (optional), then a look-ahead limiter to a −1 dBFS ceiling.
          if (s.loudTarget != null) {
            const before = await measureLufs(buf);
            if (Number.isFinite(before)) applyGain(buf, dbToGain(s.loudTarget - before));
          }
          if (s.limiter || s.loudTarget != null) limit(buf, ceiling);
          let lufs = await measureLufs(buf);
          // Limiting can pull loudness under target; one corrective pass gets it back.
          if (s.loudTarget != null && Number.isFinite(lufs) && Math.abs(lufs - s.loudTarget) > 0.2) {
            applyGain(buf, dbToGain(s.loudTarget - lufs));
            limit(buf, ceiling);
            lufs = await measureLufs(buf);
          }
          const peakDb = 20 * Math.log10(peakOf(buf) || 1e-6);
          set({ loudness: { lufs, peakDb, at: Date.now(), source: "export" } });

          const a = document.createElement("a");
          a.href = URL.createObjectURL(encodeWav(buf));
          a.download = `${(s.projectName || "imaging").replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim() || "imaging"}.wav`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          const loud = Number.isFinite(lufs) ? `${lufs.toFixed(1)} LUFS · ` : "";
          if (peakDb > 0) get().toastMsg(`Exported, but it clips (${peakDb.toFixed(1)} dBFS) — turn on the limiter`, COLORS.amber);
          else get().toastMsg(`Exported WAV · ${loud}peak ${peakDb.toFixed(1)} dBFS`, COLORS.green);
        } catch {
          get().toastMsg("Export failed", COLORS.red);
        }
        set({ exporting: false });
      },

      async measureLoudness() {
        const s = get();
        const end = s.sessionEnd();
        if (!end || s.measuring) return;
        set({ measuring: true });
        try {
          const buf = await getEngine().render(s.mix(), end);
          const lufs = await measureLufs(buf);
          const peakDb = 20 * Math.log10(peakOf(buf) || 1e-6);
          set({ loudness: { lufs, peakDb, at: Date.now(), source: "mix" } });
        } catch {
          get().toastMsg("Couldn’t measure loudness", COLORS.red);
        }
        set({ measuring: false });
      },
    }),
    {
      name: "radiocast-imaging",
      version: 2,
      // v1 only stored preferences; they carry over as-is.
      migrate: (persisted) => persisted as never,
      // Audio lives in IndexedDB (see idb.ts); everything else is small enough for localStorage.
      partialize: (s) => ({
        hasSession: s.hasSession,
        clips: s.clips,
        lanes: s.lanes,
        countInOn: s.countInOn,
        projectName: s.projectName,
        master: s.master,
        duck: s.duck,
        duckDb: s.duckDb,
        limiter: s.limiter,
        target: s.target,
        snapOn: s.snapOn,
        laneH: s.laneH,
        bpm: s.bpm,
        gridMode: s.gridMode,
        loudTarget: s.loudTarget,
        station: s.station,
        email: s.email,
        voice: s.voice,
        turnaround: s.turnaround,
        deliverables: s.deliverables,
      }),
    },
  ),
);

function buildClips(templateId: string): Clip[] {
  const t = TEMPLATES.find((x) => x.id === templateId);
  const engine = getEngine();
  if (!t) return [];
  return t.clips.flatMap((tc) => {
    const buf = engine.buffers.get(tc.sound);
    if (!buf) return [];
    return [
      {
        id: uid("c"),
        soundId: tc.sound,
        lane: LANE_IDS[tc.lane],
        start: tc.start,
        offset: 0,
        len: Math.min(tc.len ?? buf.duration, buf.duration),
        gain: tc.gain ?? 0,
        fadeIn: tc.fadeIn ?? 0,
        fadeOut: tc.fadeOut ?? 0,
      },
    ];
  });
}

function addUserSound(buf: AudioBuffer, blob: Blob, name: string, kind: string, type: TrackType, lane: string | null, at: number) {
  const id = uid("u");
  getEngine().buffers.set(id, buf);
  void audioStore.put({ id, name, kind, type, blob });
  const s: Sound = { id, name, kind, type, dur: buf.duration, path: wavePath(buf.getChannelData(0)), user: true };
  useStudio.setState((st) => ({ sounds: [...st.sounds, s] }));
  const st = useStudio.getState();
  if (lane) {
    st.addClip(id, lane, at);
    const l = useStudio.getState().lanes.find((x) => x.id === lane)!;
    st.toastMsg(`“${name}” placed on ${l.label} at ${fmt(at)}`, TRACK_TYPES[l.type].color);
  } else st.toastMsg(`“${name}” saved to Your audio`, TRACK_TYPES[type].color);
}
