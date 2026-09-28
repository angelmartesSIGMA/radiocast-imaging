import type { Lane } from "./types";

type LaneKey = "voice" | "bed" | "fx" | "fx2";

export interface TemplateClip {
  sound: string;
  lane: LaneKey;
  start: number;
  /** Trimmed length; defaults to the full sound. */
  len?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface Template {
  id: string;
  name: string;
  /** Session name given to a new session. */
  title: string;
  blurb: string;
  target: number | null;
  clips: TemplateClip[];
  /** Track FX overrides for this template. */
  laneFx?: Partial<Record<LaneKey, string>>;
}

export const LANE_IDS: Record<LaneKey, string> = { voice: "L1", bed: "L2", fx: "L3", fx2: "L4" };

export function defaultLanes(fx?: Partial<Record<LaneKey, string>>): Lane[] {
  const lanes: Lane[] = [
    { id: "L1", type: "voice", label: "Voice", gain: 0, mute: false, solo: false, fx: "broadcast", hue: 0 },
    { id: "L2", type: "bed", label: "Music bed", gain: 0, mute: false, solo: false, hue: 0 },
    { id: "L3", type: "fx", label: "FX", gain: 0, mute: false, solo: false, hue: 0 },
    { id: "L4", type: "fx", label: "FX 2", gain: 0, mute: false, solo: false, hue: 1 },
  ];
  if (fx) for (const [k, v] of Object.entries(fx)) {
    const l = lanes.find((x) => x.id === LANE_IDS[k as LaneKey]);
    if (l) l.fx = v;
  }
  return lanes;
}

export const TEMPLATES: Template[] = [
  {
    id: "summer",
    name: "Station ID :20",
    title: "Station ID — Summer",
    blurb: "Riser into a hit, a pulsing bed and a logo chime",
    target: 20,
    clips: [
      { sound: "pulse", lane: "bed", start: 2.4, gain: -6, fadeIn: 0.3, fadeOut: 1.5 },
      { sound: "riser", lane: "fx", start: 0, gain: -3 },
      { sound: "impact", lane: "fx", start: 2.4 },
      { sound: "subdrop", lane: "fx2", start: 2.4, gain: -4 },
      { sound: "zap", lane: "fx2", start: 9.6, gain: -6 },
      { sound: "whoosh", lane: "fx", start: 16.4, gain: -4 },
      { sound: "chime", lane: "fx2", start: 17.2, gain: -2, fadeOut: 0.3 },
    ],
  },
  {
    id: "id10",
    name: "Station ID :10",
    title: "Station ID :10",
    blurb: "Short, punchy ID with room for one read",
    target: 10,
    clips: [
      { sound: "riser", lane: "fx", start: 0, gain: -3 },
      { sound: "boom", lane: "fx", start: 2.4 },
      { sound: "subdrop", lane: "fx2", start: 2.4, gain: -4 },
      { sound: "pulse", lane: "bed", start: 2.4, len: 6, gain: -8, fadeIn: 0.2, fadeOut: 1.2 },
      { sound: "downlifter", lane: "fx", start: 6.6, gain: -6 },
      { sound: "chime", lane: "fx2", start: 8, gain: -2, fadeOut: 0.3 },
    ],
  },
  {
    id: "sweeper",
    name: "Sweeper :05",
    title: "Sweeper :05",
    blurb: "Whoosh, reverse swell and a glitchy tail",
    target: 5,
    clips: [
      { sound: "whoosh", lane: "fx", start: 0, gain: -3 },
      { sound: "reverse", lane: "fx2", start: 0.8, gain: -2 },
      { sound: "impact", lane: "fx", start: 2.6 },
      { sound: "zap", lane: "fx2", start: 3, gain: -6 },
      { sound: "stutter", lane: "fx2", start: 3.8, gain: -4 },
      { sound: "tapestop", lane: "fx", start: 4.2, gain: -6 },
    ],
    laneFx: { fx2: "echo" },
  },
  {
    id: "liner",
    name: "Liner :15",
    title: "Liner :15",
    blurb: "Soft pad under a voice read, chime to close",
    target: 15,
    clips: [
      { sound: "pad", lane: "bed", start: 0, len: 15, gain: -10, fadeIn: 1, fadeOut: 2 },
      { sound: "whoosh", lane: "fx", start: 0, gain: -8 },
      { sound: "chime", lane: "fx2", start: 12.6, gain: -3 },
      { sound: "tune", lane: "fx2", start: 0, gain: -12, fadeOut: 0.4 },
    ],
    laneFx: { fx2: "hall" },
  },
  {
    id: "blank",
    name: "Blank",
    title: "Untitled session",
    blurb: "Four empty tracks",
    target: null,
    clips: [],
  },
];
