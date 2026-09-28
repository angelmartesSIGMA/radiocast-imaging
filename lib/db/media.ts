import "server-only";
import { db, BUCKETS } from "@/lib/supabase/server";
import { ASSET_PREFIX, SAMPLE_PREFIX, type AssetRow, type SampleRow } from "./types";

/** What the studio needs to show and load a stored sound. */
export interface MediaItem {
  id: string; // sound id used in clips (a_… / s_…)
  name: string;
  kind: string;
  type: "voice" | "bed" | "fx";
  duration: number;
  waveform: string | null;
  category?: string | null;
  url: string | null; // signed download URL (1 h)
}

async function signMany(bucket: string, paths: string[]) {
  if (!paths.length) return new Map<string, string>();
  const { data, error } = await db().storage.from(bucket).createSignedUrls(paths, 3600);
  if (error) throw error;
  return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
}

export async function assetMedia(rows: AssetRow[]): Promise<MediaItem[]> {
  const ok = rows.filter((r) => r.uploaded);
  const urls = await signMany(BUCKETS.userAudio, ok.map((r) => r.path));
  return ok.map((r) => ({
    id: ASSET_PREFIX + r.id,
    name: r.name,
    kind: r.kind,
    type: r.type,
    duration: r.duration_s ?? 0,
    waveform: r.waveform,
    url: urls.get(r.path) ?? null,
  }));
}

export async function sampleMedia(rows: SampleRow[], withUrls = true): Promise<MediaItem[]> {
  const urls = withUrls ? await signMany(BUCKETS.samples, rows.map((r) => r.path)) : new Map<string, string>();
  return rows.map((r) => ({
    id: SAMPLE_PREFIX + r.id,
    name: r.name,
    kind: r.kind,
    type: r.type,
    duration: r.duration_s ?? 0,
    waveform: r.waveform,
    category: r.category,
    url: urls.get(r.path) ?? null,
  }));
}

export async function publishedSamples(withUrls = true) {
  const { data, error } = await db()
    .from("samples")
    .select("*")
    .eq("published", true)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return sampleMedia((data ?? []) as SampleRow[], withUrls);
}
