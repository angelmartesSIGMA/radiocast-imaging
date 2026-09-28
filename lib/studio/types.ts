export type TrackType = "voice" | "bed" | "fx";

export interface Sound {
  id: string;
  name: string;
  /** Category shown in the library, e.g. "Bed", "Sweep", "Upload", "Mic". */
  kind: string;
  type: TrackType;
  /** Source duration in seconds. */
  dur: number;
  /** SVG path (viewBox 0 0 100 40) of the waveform envelope. */
  path: string;
  user: boolean;
}

export interface Clip {
  id: string;
  soundId: string;
  lane: string;
  /** Timeline position in seconds. */
  start: number;
  /** Offset into the source in seconds (trimmed head). */
  offset: number;
  /** Audible length in seconds. */
  len: number;
  /** Clip gain in dB. */
  gain: number;
  fadeIn: number;
  fadeOut: number;
  /** Play the source backwards (reverse swells, reverse reverbs). */
  reverse?: boolean;
}

export interface Lane {
  id: string;
  type: TrackType;
  label: string;
  gain: number;
  mute: boolean;
  solo: boolean;
  /** Track processing preset id (see lib/audio/fx.ts). */
  fx?: string;
  /** Index into the type's colour family, fixed at creation so colours never reshuffle. */
  hue?: number;
}

export interface MixSnapshot {
  clips: Clip[];
  lanes: Lane[];
  duck: boolean;
  duckDb: number;
  master: number;
  /** Brick-wall-ish limiter on the master bus. */
  limiter: boolean;
}

export type LibraryFilter = "all" | "beds" | "fx" | "stingers" | "yours";

export type ClipHandle = "move" | "trimL" | "trimR" | "fadeIn" | "fadeOut";
