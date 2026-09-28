import type { Clip, Lane, TrackType } from "@/lib/studio/types";

/** What a session row stores in its `data` column. */
export interface SessionData {
  version: 1;
  clips: Clip[];
  lanes: Lane[];
  master: number;
  duck: boolean;
  duckDb: number;
  limiter: boolean;
  target: number | null;
  bpm: number;
  gridMode: "time" | "beats";
  loudTarget: number | null;
}

export interface SessionRow {
  id: string;
  owner_id: string | null;
  name: string;
  data: Partial<SessionData>;
  duration_s: number;
  target_s: number | null;
  clip_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AssetRow {
  id: string;
  owner_id: string | null;
  session_id: string | null;
  path: string;
  name: string;
  kind: string;
  type: TrackType;
  duration_s: number | null;
  size_bytes: number | null;
  mime: string | null;
  waveform: string | null;
  uploaded: boolean;
  created_at: string;
}

export interface SampleRow {
  id: string;
  name: string;
  kind: string;
  type: TrackType;
  category: string | null;
  tags: string[];
  bpm: number | null;
  duration_s: number | null;
  size_bytes: number | null;
  mime: string | null;
  path: string;
  waveform: string | null;
  published: boolean;
  featured: boolean;
  sort: number;
  created_at: string;
  updated_at: string;
}

export type BriefStatus = "new" | "in_progress" | "needs_info" | "delivered" | "cancelled";

export const BRIEF_STATUSES: { id: BriefStatus; label: string; tone: string }[] = [
  { id: "new", label: "New", tone: "accent" },
  { id: "in_progress", label: "In production", tone: "amber" },
  { id: "needs_info", label: "Needs info", tone: "red" },
  { id: "delivered", label: "Delivered", tone: "green" },
  { id: "cancelled", label: "Cancelled", tone: "muted" },
];

export interface BriefRow {
  id: string;
  ref: string;
  owner_id: string | null;
  session_id: string | null;
  session_snapshot: { name?: string; duration_s?: number; clip_count?: number; lanes?: { label: string; type: TrackType; fx?: string }[] };
  mix_path: string | null;
  station: string | null;
  contact_email: string;
  voice: string | null;
  deliverables: string[];
  turnaround: string;
  script: string | null;
  target_s: number | null;
  status: BriefStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
}

export interface BriefEventRow {
  id: number;
  brief_id: string;
  status: BriefStatus | null;
  note: string | null;
  created_at: string;
}

export interface BriefFileRow {
  id: string;
  brief_id: string;
  path: string;
  name: string;
  size_bytes: number | null;
  mime: string | null;
  created_at: string;
}

/** Sound ids in clips: built-ins keep their generator id; these prefixes mark stored audio. */
export const ASSET_PREFIX = "a_";
export const SAMPLE_PREFIX = "s_";
