import { fail, json, route, UUID_RE } from "@/lib/api";
import { adminOr401 } from "@/lib/admin-guard";
import type { SampleRow } from "@/lib/db/types";
import { KINDS, MAX_AUDIO_BYTES, num, str, trackType, waveform } from "@/lib/db/validate";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const denied = await adminOr401();
  if (denied) return denied;
  const { data, error } = await db().from("samples").select("*").order("sort").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as SampleRow[];
  const signed = rows.length ? (await db().storage.from(BUCKETS.samples).createSignedUrls(rows.map((r) => r.path), 3600)).data ?? [] : [];
  const urls = new Map(signed.map((x) => [x.path, x.signedUrl]));
  return json({ samples: rows.map((r) => ({ ...r, url: urls.get(r.path) ?? null })) });
});

/** Create the sample row once its file is in the bucket. */
export const POST = route(async (req: Request) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = str(b.id, 40);
  const path = str(b.path, 200);
  if (!UUID_RE.test(id) || !path.startsWith(id + ".")) return fail("Bad sample id");
  if ((num(b.size) ?? 0) > MAX_AUDIO_BYTES) return fail("File is larger than 100 MB", 413);
  const { data: files, error: lErr } = await db().storage.from(BUCKETS.samples).list("", { search: path, limit: 1 });
  if (lErr) throw lErr;
  if (!files?.some((f) => f.name === path)) return fail("File hasn't finished uploading", 409);
  const kind = KINDS.includes(str(b.kind, 20)) ? str(b.kind, 20) : "FX";
  const { data, error } = await db()
    .from("samples")
    .insert({
      id,
      path,
      name: str(b.name, 120) || "Untitled sample",
      kind,
      type: trackType(b.type),
      category: str(b.category, 60) || null,
      tags: Array.isArray(b.tags) ? b.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 12) : [],
      bpm: num(b.bpm),
      duration_s: num(b.duration),
      size_bytes: num(b.size),
      mime: str(b.mime, 80) || null,
      waveform: waveform(b.waveform),
      published: b.published === true,
    })
    .select("*")
    .single<SampleRow>();
  if (error) throw error;
  return json({ sample: data }, 201);
});
