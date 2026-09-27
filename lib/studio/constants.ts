import type { LibraryFilter, TrackType } from "./types";

export const SR = 44100;
/** Width of the sticky track header column, in px. */
export const HEADER_W = 208;
export const LANE_H = 96;
export const RULER_H = 34;

export const TRACK_TYPES: Record<
  TrackType,
  { label: string; color: string; soft: string; hint: string }
> = {
  voice: {
    label: "Voice",
    color: "#A78BFA",
    soft: "rgba(139,92,246,0.16)",
    hint: "Drop a voice read here, or hit record",
  },
  bed: {
    label: "Music bed",
    color: "#34D399",
    soft: "rgba(52,211,153,0.13)",
    hint: "Drop a music bed",
  },
  fx: {
    label: "FX",
    color: "#FBBF24",
    soft: "rgba(251,191,36,0.13)",
    hint: "Drop sweeps, hits and drops",
  },
};

export const VOICES = [
  "Deep & warm",
  "Bright & upbeat",
  "Conversational",
  "Big CHR energy",
] as const;

export const DELIVERABLES = [
  "Station ID",
  "Sweeper",
  "Liner",
  "Promo",
  "Show open",
] as const;

export const TURNAROUNDS = [
  { id: "standard", label: "Standard", note: "3 business days" },
  { id: "rush", label: "Rush", note: "24 hours" },
] as const;

/** Common imaging lengths. `null` = no target. */
export const TARGETS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: ":05", value: 5 },
  { label: ":10", value: 10 },
  { label: ":15", value: 15 },
  { label: ":20", value: 20 },
  { label: ":30", value: 30 },
  { label: ":60", value: 60 },
];

/** Library kind → filter group. */
export const GROUPS: Record<string, LibraryFilter> = {
  Bed: "beds",
  Sweep: "fx",
  Hit: "fx",
  FX: "fx",
  Stinger: "stingers",
};

/** [major, minor] ruler divisions in seconds, picked by zoom. */
export const SCALES: [number, number][] = [
  [0.25, 0.05],
  [0.5, 0.1],
  [1, 0.25],
  [2, 0.5],
  [5, 1],
  [10, 2],
  [15, 5],
  [30, 5],
  [60, 10],
];

export const SHORTCUTS: [string, string][] = [
  ["Play / pause", "Space"],
  ["Back to start", "Home"],
  ["Record take", "R"],
  ["Loop playback", "L"],
  ["Split at playhead", "S"],
  ["Duplicate clip", "⌘D"],
  ["Undo / redo", "⌘Z / ⇧⌘Z"],
  ["Nudge clip", "← →"],
  ["Nudge 1s", "⇧ ← →"],
  ["Delete clip", "⌫"],
  ["Deselect", "Esc"],
  ["Zoom", "⌘ scroll  or  + −"],
  ["Show shortcuts", "?"],
];

export const COLORS = {
  red: "#FF3B5C",
  green: "#34D399",
  violet: "#A78BFA",
  amber: "#FBBF24",
};
