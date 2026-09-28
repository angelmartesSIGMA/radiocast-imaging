import { fail, json, route, UUID_RE } from "@/lib/api";
import { adminOr401 } from "@/lib/admin-guard";
import { KINDS, num, str, trackType } from "@/lib/db/validate";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ("name" in b) patch.name = str(b.name, 120) || "Untitled sample";
  if ("kind" in b && KINDS.includes(str(b.kind, 20))) patch.kind = str(b.kind, 20);
  if ("type" in b) patch.type = trackType(b.type);
  if ("category" in b) patch.category = str(b.category, 60) || null;
  if ("tags" in b && Array.isArray(b.tags)) patch.tags = b.tags.map((t) => str(t, 30)).filter(Boolean).slice(0, 12);
  if ("bpm" in b) patch.bpm = num(b.bpm);
  if ("sort" in b) patch.sort = Math.round(num(b.sort) ?? 0);
  if ("published" in b) patch.published = b.published === true;
  if ("featured" in b) patch.featured = b.featured === true;
  const { data, error } = await db().from("samples").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  if (!data) return fail("Not found", 404);
  return json({ sample: data });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { data } = await db().from("samples").select("path").eq("id", id).maybeSingle<{ path: string }>();
  if (data) await db().storage.from(BUCKETS.samples).remove([data.path]);
  const { error } = await db().from("samples").delete().eq("id", id);
  if (error) throw error;
  return json({ ok: true });
});
