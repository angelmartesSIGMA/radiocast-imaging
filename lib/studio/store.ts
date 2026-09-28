"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { encodeWav, wavePath } from "@/lib/audio/dsp";
import { AudioEngine, getEngine } from "@/lib/audio/engine";
import { applyGain, limit, measureLufs, peakOf } from "@/lib/audio/loudness";
import { clock, dom } from "./clock";
import { laneColor } from "./colors";
import { audioStore } from "./idb";
import { LEGACY_KEY } from "./legacy";
import { ApiError, fetchAudio, samplesApi, sessionApi, uploadAsset } from "./remote";
import { ASSET_PREFIX, SAMPLE_PREFIX, type SessionData } from "@/lib/db/types";
import type { MediaItem } from "@/lib/db/media";
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
/** Drop target id for "make a new track here" (the space below the last track). */
export const NEW_LANE = "__new__";

export interface Ghost {
  lane: string;
  start: number;
  len: number;
  /** Track type a new lane would get when `lane` is NEW_LANE. */
  type?: TrackType;
}
export type MenuKind = "clip" | "lane" | "area" | "ruler" | "sound";
export interface ContextMenu {
  kind: MenuKind;
  /** Clip, lane or sound id (unused for the ruler). */
  id: string;
  x: number;
  y: number;
  /** Timeline position under the pointer, when relevant. */
  at?: number;
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
  /** Cloud session this studio edits (null until loaded). */
  sessionId: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  loadError: string | null;

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
  /** A clip is being dragged (move mode) — shows the new-track drop zone. */
  clipDrag: boolean;
  /** Track being dragged to reorder, and where it would land. */
  laneDrag: { id: string; index: number } | null;
  snapT: number | null;
  tag: string | null;
  activeClip: string | null;
  fileDrag: boolean;
  fileMark: { lane: string; at: number } | null;
  libHover: boolean;
  menu: ContextMenu | null;
  /** Copied clip (its position is kept relative for paste). */
  clipboard: Clip | null;
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
  init(sessionId: string): Promise<void>;
  save(): Promise<void>;
  sessionData(): SessionData;
  ensureBuffer(soundId: string): Promise<boolean>;
  retryUpload(soundId: string): void;
  renderMaster(): Promise<{ buf: AudioBuffer; lufs: number; peakDb: number } | null>;
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
  addClip(soundId: string, lane?: string | null, start?: number, opts?: { noCommit?: boolean; quiet?: boolean }): string | null;
  /** Move a clip off anything it overlaps: to a free track of the same kind, or a new one. */
  placeClip(id: string, quiet?: boolean): void;
  /** Free space around a clip in its lane: [earliest start, latest end]. */
  roomFor(id: string): [number, number];
  overlaps(lane: string, start: number, end: number, exclude?: string | null): boolean;
  createLane(type: TrackType, afterId?: string): Lane;
  moveLane(id: string, toIndex: number): void;
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
  toggleRecord(lane?: string): Promise<void>;
  copyClip(id?: string | null): void;
  cutClip(id?: string | null): void;
  paste(lane?: string | null, at?: number): void;
  splitAt(id: string, t: number): void;
  trimToPlayhead(id: string, edge: "start" | "end"): void;
  normalizeClip(id: string): void;
  duplicateLane(id: string): void;
  clearLane(id: string): void;
  removeSound(id: string): void;
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


let hydrated = false;
let saveSeq = 0;
/** Signed download URLs for stored sounds (assets and samples). */
const remoteUrls = new Map<string, string>();
const loading = new Map<string, Promise<boolean>>();
const pendingUploads = new Map<string, { blob: Blob; fileName: string }>();

function mediaSound(m: MediaItem, source: "asset" | "sample"): Sound {
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    type: m.type,
    dur: m.duration || 1,
    path: m.waveform || "M0 20 L100 20 Z",
    user: source === "asset",
    source,
    category: m.category ?? null,
  };
}

async function runUpload(soundId: string, blob: Blob, fileName: string) {
  const st = useStudio.getState();
  const snd = st.sounds.find((x) => x.id === soundId);
  if (!snd) return;
  const mark = (status: Sound["status"]) =>
    useStudio.setState((s) => ({ sounds: s.sounds.map((x) => (x.id === soundId ? { ...x, status } : x)) }));
  pendingUploads.set(soundId, { blob, fileName });
  mark("uploading");
  try {
    await uploadAsset(
      {
        id: soundId.slice(ASSET_PREFIX.length),
        sessionId: st.sessionId,
        name: snd.name,
        kind: snd.kind,
        type: snd.type,
        duration: snd.dur,
        waveform: snd.path,
      },
      blob,
      fileName,
    );
    pendingUploads.delete(soundId);
    mark(undefined);
  } catch (e) {
    mark("error");
    useStudio
      .getState()
      .toastMsg(`“${snd.name}” didn’t upload (${e instanceof Error ? e.message : "error"}) — it plays, but won’t be saved`, COLORS.red, {
        label: "Retry",
        run: () => useStudio.getState().retryUpload(soundId),
      });
  }
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
      sessionId: null,
      saveState: "idle",
      loadError: null,

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
      clipDrag: false,
      laneDrag: null,
      snapT: null,
      tag: null,
      activeClip: null,
      fileDrag: false,
      fileMark: null,
      libHover: false,
      menu: null,
      clipboard: null,
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

      async init(sessionId) {
        if (initing) return;
        initing = true;
        hydrated = false;
        const engine = getEngine();
        const sounds = engine.buildLibrary();
        set({ sounds, sessionId, ready: false, loadError: null, saveState: "idle", past: [], future: [] });
        try {
          const [{ session, media }, sampleList] = await Promise.all([
            sessionApi.get(sessionId),
            samplesApi.list().catch(() => ({ samples: [] as MediaItem[] })),
          ]);
          const d = session.data as Partial<SessionData> & { pendingTemplate?: string; pendingSample?: string | null };
          // Stored audio appears in the library straight away; its audio streams in behind it.
          const remote = [...media.map((m) => mediaSound(m, "asset")), ...sampleList.samples.map((m) => mediaSound(m, "sample"))];
          for (const m of [...media, ...sampleList.samples]) if (m.url) remoteUrls.set(m.id, m.url);
          takes = media.filter((m) => m.kind === "Mic").length;
          let clips = d.clips;
          let lanes = d.lanes;
          let target = d.target !== undefined ? d.target : session.target_s;
          let fresh = false;
          if (!clips || !lanes) {
            const t = TEMPLATES.find((x) => x.id === d.pendingTemplate) ?? TEMPLATES[0];
            clips = buildClips(t.id);
            lanes = defaultLanes(t.laneFx);
            target = t.target;
            fresh = true;
          }
          bumpIds([...clips.map((c) => c.id), ...lanes.map((l) => l.id)]);
          const known = new Set([...sounds, ...remote].map((x) => x.id));
          const missing = clips.filter((c) => !known.has(c.soundId)).length;
          set({
            sounds: [...sounds, ...remote],
            projectName: session.name,
            clips: clips.filter((c) => known.has(c.soundId)),
            lanes,
            target: target ?? null,
            master: d.master ?? 0,
            duck: d.duck ?? true,
            duckDb: d.duckDb ?? -12,
            limiter: d.limiter ?? true,
            bpm: d.bpm ?? 120,
            gridMode: d.gridMode ?? "time",
            loudTarget: d.loudTarget !== undefined ? d.loudTarget : -14,
            ready: true,
          });
          for (const c of get().clips) get().placeClip(c.id, true);
          if (fresh && d.pendingSample) get().addClip(SAMPLE_PREFIX + d.pendingSample, null, 0, { noCommit: true, quiet: true });
          set({ past: [], future: [], selected: null });
          hydrated = true;
          if (missing) get().toastMsg(`${missing} clip${missing > 1 ? "s" : ""} used audio that no longer exists and ${missing > 1 ? "were" : "was"} removed`, COLORS.amber);
          if (fresh || missing) void get().save();
          else set({ saveState: "saved" });
          // Download the stored audio this session actually uses.
          const used = new Set(get().clips.map((c) => c.soundId));
          await Promise.all([...used].filter((id) => remoteUrls.has(id)).map((id) => get().ensureBuffer(id)));
          get().restartIfPlaying();
        } catch (e) {
          initing = false;
          set({ ready: true, loadError: e instanceof ApiError && e.status === 404 ? "This session doesn’t exist or was deleted." : e instanceof Error ? e.message : "Couldn’t load the session" });
        }
      },

      sessionData() {
        const s = get();
        return {
          version: 1,
          clips: s.clips,
          lanes: s.lanes,
          master: s.master,
          duck: s.duck,
          duckDb: s.duckDb,
          limiter: s.limiter,
          target: s.target,
          bpm: s.bpm,
          gridMode: s.gridMode,
          loudTarget: s.loudTarget,
        };
      },

      async save() {
        const s = get();
        if (!s.sessionId || !hydrated) return;
        const seq = ++saveSeq;
        set({ saveState: "saving" });
        try {
          await sessionApi.save(s.sessionId, {
            name: s.projectName,
            data: s.sessionData(),
            duration_s: +s.sessionEnd().toFixed(3),
            target_s: s.target,
            clip_count: s.clips.length,
          });
          if (seq === saveSeq) set({ saveState: "saved" });
        } catch {
          if (seq === saveSeq) set({ saveState: "error" });
        }
      },

      async ensureBuffer(soundId) {
        const engine = getEngine();
        if (engine.buffers.has(soundId)) return true;
        const url = remoteUrls.get(soundId);
        if (!url) return false;
        let job = loading.get(soundId);
        if (!job) {
          job = (async () => {
            const mark = (status: Sound["status"], extra: Partial<Sound> = {}) =>
              set((st) => ({ sounds: st.sounds.map((x) => (x.id === soundId ? { ...x, status, ...extra } : x)) }));
            mark("loading");
            try {
              const cached = await audioStore.get(soundId);
              const blob = cached?.blob ?? (await fetchAudio(url));
              const buf = await engine.decode(await blob.arrayBuffer());
              engine.buffers.set(soundId, buf);
              if (!cached) {
                const snd = get().sounds.find((x) => x.id === soundId);
                if (snd) void audioStore.put({ id: soundId, name: snd.name, kind: snd.kind, type: snd.type, blob });
              }
              mark(undefined, { dur: buf.duration });
              return true;
            } catch {
              mark("error");
              loading.delete(soundId);
              return false;
            }
          })();
          loading.set(soundId, job);
        }
        return job;
      },

      retryUpload(soundId) {
        const p = pendingUploads.get(soundId);
        if (p) void runUpload(soundId, p.blob, p.fileName);
      },

      newSession(templateId) {
        const t = TEMPLATES.find((x) => x.id === templateId);
        if (!t) return;
        set({ palette: null });
        get().toastMsg(`Creating “${t.name}”…`);
        sessionApi
          .create({ template: t.id })
          .then(({ id }) => {
            window.location.href = `/studio/${id}`;
          })
          .catch((e: Error) => get().toastMsg(`Couldn’t create a session: ${e.message}`, COLORS.red));
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
        set({ previewId: id });
        void s.ensureBuffer(id).then((ok) => {
          if (get().previewId !== id) return;
          if (!ok && !engine.buffers.has(id)) {
            set({ previewId: null });
            return;
          }
          engine.preview(id, () => set({ previewId: null }));
        });
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

      addClip(soundId, lane, start, opts) {
        const s = get();
        const snd = s.sounds.find((x) => x.id === soundId);
        if (!snd) return null;
        if (!opts?.noCommit) s.commit();
        const l =
          lane === NEW_LANE
            ? s.createLane(snd.type)
            : get().lanes.find((x) => x.id === lane) ?? get().lanes.find((x) => x.type === snd.type) ?? get().lanes[0];
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
        set({ clips: [...get().clips, c], selected: c.id });
        get().placeClip(c.id, opts?.quiet);
        get().restartIfPlaying();
        if (!getEngine().buffers.has(soundId)) void get().ensureBuffer(soundId).then((ok) => ok && get().restartIfPlaying());
        return c.id;
      },

      overlaps(lane, start, end, exclude) {
        return get().clips.some((o) => o.lane === lane && o.id !== exclude && start < o.start + o.len - 1e-3 && end > o.start + 1e-3);
      },

      roomFor(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        if (!c) return [0, Infinity];
        let lo = 0;
        let hi = Infinity;
        for (const o of s.clips) {
          if (o.lane !== c.lane || o.id === id) continue;
          const oEnd = o.start + o.len;
          if (oEnd <= c.start + 1e-3) lo = Math.max(lo, oEnd);
          else if (o.start >= c.start + c.len - 1e-3) hi = Math.min(hi, o.start);
        }
        return [lo, hi];
      },

      placeClip(id, quiet) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        if (!c || !s.overlaps(c.lane, c.start, c.start + c.len, id)) return;
        const lane = s.lanes.find((l) => l.id === c.lane);
        if (!lane) return;
        const i = s.lanes.indexOf(lane);
        // Nearest same-type track below, then above, that has room.
        const order = [...s.lanes.slice(i + 1), ...s.lanes.slice(0, i).reverse()];
        let dest = order.find((l) => l.type === lane.type && !s.overlaps(l.id, c.start, c.start + c.len, id));
        const created = !dest;
        if (!dest) dest = s.createLane(lane.type, lane.id);
        set((st) => ({ clips: st.clips.map((x) => (x.id === id ? { ...x, lane: dest!.id } : x)) }));
        if (!quiet)
          get().toastMsg(
            created ? `Overlapping clip moved to a new track, “${dest.label}”` : `Overlapping clip moved to “${dest.label}”`,
            laneColor(dest, get().lanes).color,
            undoAction(),
          );
      },

      createLane(type, afterId) {
        const s = get();
        const same = s.lanes.filter((l) => l.type === type);
        const n = same.length;
        // Next free name and a hue nobody of this type is using yet.
        let num = n + 1;
        while (s.lanes.some((l) => l.label === `${TRACK_TYPES[type].label} ${num}`)) num++;
        const used = new Set(same.map((l, i) => l.hue ?? i));
        let hue = 0;
        while (used.has(hue) && hue < 8) hue++;
        const l: Lane = {
          id: uid("L"),
          type,
          hue,
          label: n ? `${TRACK_TYPES[type].label} ${num}` : TRACK_TYPES[type].label,
          fx: type === "voice" ? "broadcast" : undefined,
          gain: 0,
          mute: false,
          solo: false,
        };
        const at = afterId ? s.lanes.findIndex((x) => x.id === afterId) + 1 : s.lanes.length;
        const lanes = [...s.lanes];
        lanes.splice(at <= 0 ? lanes.length : at, 0, l);
        set({ lanes });
        return l;
      },

      moveLane(id, toIndex) {
        const s = get();
        const from = s.lanes.findIndex((l) => l.id === id);
        if (from < 0) return;
        const to = clamp(toIndex, 0, s.lanes.length - 1);
        if (to === from) return;
        s.commit();
        const lanes = [...s.lanes];
        const [l] = lanes.splice(from, 1);
        lanes.splice(to, 0, l);
        set({ lanes });
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
        // Finished edits (not live drags) that move a clip must not leave it hidden under another.
        if (restart && (patch.start != null || patch.lane != null || patch.len != null)) get().placeClip(id);
        if (restart) get().restartIfPlaying();
      },
      duplicate(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === (id ?? s.selected));
        if (!c) return;
        const n = { ...c, id: uid("c"), start: c.start + c.len };
        s.commit();
        set((st) => ({ clips: [...st.clips, n], selected: n.id, menu: null }));
        get().placeClip(n.id);
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
        get().commit();
        get().createLane(type);
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
        // Several files dropped on the "new track" zone share the one track they create.
        let targetLane = target && target !== "library" ? target.lane : null;
        for (const f of audio) {
          try {
            const buf = await getEngine().decode(await f.arrayBuffer());
            const laneObj = targetLane ? get().lanes.find((l) => l.id === targetLane) : undefined;
            const type: TrackType = laneObj ? laneObj.type : buf.duration > 10 ? "bed" : "voice";
            const lane =
              target === "library"
                ? null
                : targetLane === NEW_LANE
                  ? NEW_LANE
                  : laneObj
                    ? laneObj.id
                    : get().lanes.find((l) => l.type === type)?.id ?? null;
            const placed = addUserSound(buf, f, f.name.replace(/\.[^.]+$/, ""), "Upload", type, lane, at, f.name);
            if (targetLane === NEW_LANE && placed) targetLane = placed;
            at += buf.duration;
          } catch {
            get().toastMsg(`Couldn’t read ${f.name}`, COLORS.red);
          }
        }
      },

      copyClip(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === (id ?? s.selected));
        if (!c) return;
        const name = s.sounds.find((x) => x.id === c.soundId)?.name ?? "clip";
        set({ clipboard: { ...c }, menu: null });
        s.toastMsg(`Copied “${name}”`);
      },
      cutClip(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === (id ?? s.selected));
        if (!c) return;
        set({ clipboard: { ...c } });
        s.commit();
        set((st) => ({ clips: st.clips.filter((x) => x.id !== c.id), selected: null, menu: null }));
        get().restartIfPlaying();
        s.toastMsg("Cut — paste with ⌘V", COLORS.violet, undoAction());
      },
      paste(lane, at) {
        const s = get();
        const cb = s.clipboard;
        if (!cb) {
          s.toastMsg("Nothing copied yet");
          return;
        }
        if (!s.sounds.some((x) => x.id === cb.soundId)) return;
        const target = s.lanes.find((l) => l.id === lane) ?? s.lanes.find((l) => l.id === cb.lane) ?? s.lanes[0];
        s.commit();
        const n: Clip = { ...cb, id: uid("c"), lane: target.id, start: Math.max(0, at ?? clock.t) };
        set((st) => ({ clips: [...st.clips, n], selected: n.id, menu: null }));
        get().placeClip(n.id);
        get().restartIfPlaying();
      },
      splitAt(id, t) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        if (!c || t <= c.start + 0.02 || t >= c.start + c.len - 0.02) {
          s.toastMsg("Pick a point inside the clip to split it");
          return;
        }
        s.commit();
        const a = t - c.start;
        const right: Clip = { ...c, id: uid("c"), start: t, offset: c.offset + a, len: c.len - a, fadeIn: 0, fadeOut: Math.min(c.fadeOut, c.len - a) };
        set((st) => ({
          clips: st.clips.flatMap((x) => (x.id === id ? [{ ...x, len: a, fadeOut: 0, fadeIn: Math.min(x.fadeIn, a) }, right] : [x])),
          menu: null,
        }));
        get().restartIfPlaying();
        s.toastMsg(`Split at ${fmt(t)}`, COLORS.violet, undoAction());
      },
      trimToPlayhead(id, edge) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        const t = clock.t;
        if (!c || t <= c.start + 0.02 || t >= c.start + c.len - 0.02) {
          s.toastMsg("Put the playhead inside the clip first");
          return;
        }
        s.commit();
        const a = t - c.start;
        const patch: Partial<Clip> =
          edge === "start"
            ? { start: t, offset: c.offset + a, len: c.len - a, fadeIn: Math.min(c.fadeIn, c.len - a) }
            : { len: a, fadeOut: Math.min(c.fadeOut, a) };
        s.updateClip(id, patch, false);
        set({ menu: null });
        get().restartIfPlaying();
      },
      normalizeClip(id) {
        const s = get();
        const c = s.clips.find((x) => x.id === id);
        if (!c) return;
        const peak = getEngine().clipPeak(c.soundId, !!c.reverse, c.offset, c.len);
        if (!peak) return;
        const gain = Math.round(clamp(-1 - 20 * Math.log10(peak), -24, 12) * 2) / 2;
        s.commit();
        s.updateClip(id, { gain }, false);
        set({ menu: null });
        get().restartIfPlaying();
        s.toastMsg(`Normalised to −1 dB peak (${gain > 0 ? "+" : ""}${gain.toFixed(1)} dB)`, COLORS.violet, undoAction());
      },
      duplicateLane(id) {
        const s = get();
        const l = s.lanes.find((x) => x.id === id);
        if (!l) return;
        s.commit();
        const copy = s.createLane(l.type, l.id);
        s.setLane(copy.id, { fx: l.fx, gain: l.gain, mute: l.mute, label: `${l.label} copy` }, false);
        const clips = get().clips.filter((c) => c.lane === id).map((c) => ({ ...c, id: uid("c"), lane: copy.id }));
        set((st) => ({ clips: [...st.clips, ...clips], menu: null }));
        get().restartIfPlaying();
      },
      clearLane(id) {
        const s = get();
        const l = s.lanes.find((x) => x.id === id);
        if (!l || !s.clips.some((c) => c.lane === id)) return;
        s.commit();
        set((st) => ({ clips: st.clips.filter((c) => c.lane !== id), menu: null, selected: null }));
        get().restartIfPlaying();
        s.toastMsg(`Cleared “${l.label}”`, COLORS.red, undoAction());
      },
      removeSound(id) {
        const s = get();
        const snd = s.sounds.find((x) => x.id === id);
        if (!snd?.user) return;
        const used = s.clips.filter((c) => c.soundId === id).length;
        s.commit();
        set((st) => ({ sounds: st.sounds.filter((x) => x.id !== id), clips: st.clips.filter((c) => c.soundId !== id), menu: null }));
        void audioStore.remove(id);
        if (id.startsWith(ASSET_PREFIX)) void fetch(`/api/assets/${id.slice(ASSET_PREFIX.length)}`, { method: "DELETE" });
        get().restartIfPlaying();
        // Undo restores the clips but not the audio file, so say so plainly.
        s.toastMsg(used ? `Deleted “${snd.name}” and ${used} clip${used > 1 ? "s" : ""}` : `Deleted “${snd.name}”`, COLORS.red);
      },

      async toggleRecord(laneArg) {
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
        const argL = laneArg ? s.lanes.find((l) => l.id === laneArg) : undefined;
        const lane = argL?.id ?? (selL?.type === "voice" ? selL.id : s.lanes.find((l) => l.type === "voice")?.id);
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

      async renderMaster() {
        const s = get();
        const end = s.sessionEnd();
        if (!end) return null;
        await Promise.all([...new Set(s.clips.map((c) => c.soundId))].map((id) => s.ensureBuffer(id)));
        const buf = await getEngine().render(get().mix(), end);
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
        return { buf, lufs, peakDb };
      },

      async exportWav() {
        const s = get();
        if (!s.sessionEnd()) {
          s.toastMsg("Nothing to export yet");
          return;
        }
        if (s.exporting) return;
        set({ exporting: true });
        try {
          const r = await s.renderMaster();
          if (!r) return;
          const { buf, lufs, peakDb } = r;
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
        } finally {
          set({ exporting: false });
        }
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
      version: 3,
      // v2 kept the whole session in localStorage. Sessions now live in Supabase, so stash any
      // old one for the dashboard's one-time "import" and keep only preferences.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (version < 3 && Array.isArray(p.clips) && p.clips.length) {
          try {
            localStorage.setItem(
              LEGACY_KEY,
              JSON.stringify({ name: p.projectName, clips: p.clips, lanes: p.lanes, target: p.target, master: p.master, bpm: p.bpm }),
            );
          } catch {
            /* storage full or blocked */
          }
        }
        return p as never;
      },
      // Session content lives in Supabase; only per-browser preferences stay here.
      partialize: (s) => ({
        countInOn: s.countInOn,
        snapOn: s.snapOn,
        laneH: s.laneH,
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

function addUserSound(buf: AudioBuffer, blob: Blob, name: string, kind: string, type: TrackType, lane: string | null, at: number, fileName?: string) {
  const id = ASSET_PREFIX + crypto.randomUUID();
  getEngine().buffers.set(id, buf);
  void audioStore.put({ id, name, kind, type, blob });
  const s: Sound = { id, name, kind, type, dur: buf.duration, path: wavePath(buf.getChannelData(0)), user: true, source: "asset", status: "uploading" };
  useStudio.setState((st) => ({ sounds: [...st.sounds, s] }));
  const ext = (blob.type.split("/")[1] || "wav").split(";")[0].replace("mpeg", "mp3").replace("x-wav", "wav");
  void runUpload(id, blob, fileName ?? `${name}.${ext}`);
  const st = useStudio.getState();
  if (lane) {
    const clipId = st.addClip(id, lane, at, { quiet: true });
    const after = useStudio.getState();
    const c = after.clips.find((x) => x.id === clipId);
    const l = c && after.lanes.find((x) => x.id === c.lane);
    if (l) st.toastMsg(`“${name}” placed on ${l.label} at ${fmt(at)}`, laneColor(l, after.lanes).color, undoAction());
    return l?.id ?? null;
  }
  st.toastMsg(`“${name}” saved to Your audio`, TRACK_TYPES[type].color);
  return null;
}
