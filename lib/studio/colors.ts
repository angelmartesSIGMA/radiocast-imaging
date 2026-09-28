import type { Lane, TrackType } from "./types";

/** Each track type gets a family of hues; the nth track of a type takes the nth hue. */
const FAMILIES: Record<TrackType, string[]> = {
  voice: ["#B794FF", "#8EA2FF", "#D98BFF"],
  bed: ["#3DDBA4", "#43CFE0", "#8BDB5C"],
  fx: ["#FFB547", "#FF7AA8", "#FF8A5B", "#63B3FF"],
};

export interface LaneColor {
  color: string;
  /** Clip body tint. */
  soft: string;
  /** Faint lane background tint used for drop targets. */
  wash: string;
}

const withAlpha = (hex: string, a: number) =>
  `${hex}${Math.round(a * 255)
    .toString(16)
    .padStart(2, "0")}`;

export function laneColor(lane: Pick<Lane, "id" | "type" | "hue">, lanes: Pick<Lane, "id" | "type">[]): LaneColor {
  const fam = FAMILIES[lane.type];
  const idx = lane.hue ?? Math.max(0, lanes.filter((l) => l.type === lane.type).findIndex((l) => l.id === lane.id));
  const color = fam[idx % fam.length];
  return { color, soft: withAlpha(color, 0.16), wash: withAlpha(color, 0.05) };
}

export function typeColor(type: TrackType): string {
  return FAMILIES[type][0];
}
