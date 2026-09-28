import type { TrackType } from "@/lib/studio/types";

export const TRACK_TYPES_LIST: TrackType[] = ["voice", "bed", "fx"];
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const trackType = (v: unknown): TrackType => (TRACK_TYPES_LIST.includes(v as TrackType) ? (v as TrackType) : "fx");
/** SVG waveform paths only contain these characters. */
export const waveform = (v: unknown) => (typeof v === "string" && v.length < 40000 && /^[MLZ0-9.\s-]+$/.test(v) ? v : null);

export const KINDS = ["Bed", "Sweep", "Hit", "FX", "Stinger", "Voice"];
