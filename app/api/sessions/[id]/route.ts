import { fail, json, route, UUID_RE } from "@/lib/api";
import { assetMedia } from "@/lib/db/media";
import { ASSET_PREFIX, type AssetRow, type SessionRow } from "@/lib/db/types";
import { db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Session plus signed URLs for every uploaded/recorded sound it uses. */
export const GET = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { data: session, error } = await db().from("sessions").select("*").eq("id", id).is("deleted_at", null).maybeSingle<SessionRow>();
  if (error) throw error;
  if (!session) return fail("Session not found", 404);

  const clipIds = (session.data.clips ?? [])
    .map((c) => c.soundId)
    .filter((s) => s.startsWith(ASSET_PREFIX))
    .map((s) => s.slice(ASSET_PREFIX.length))
    .filter((s) => UUID_RE.test(s));
  const filter = clipIds.length ? `session_id.eq.${id},id.in.(${[...new Set(clipIds)].join(",")})` : `session_id.eq.${id}`;
  const { data: assets, error: aErr } = await db().from("assets").select("*").or(filter).order("created_at");
  if (aErr) throw aErr;
  return json({ session, media: await assetMedia((assets ?? []) as AssetRow[]) });
});

/** Autosave. */
export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const body = (await req.json().catch(() => null)) as Partial<Pick<SessionRow, "name" | "data" | "duration_s" | "target_s" | "clip_count">> | null;
  if (!body) return fail("Bad body");
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim().slice(0, 120) || "Untitled session";
  if (body.data && typeof body.data === "object") patch.data = body.data;
  if (typeof body.duration_s === "number") patch.duration_s = body.duration_s;
  if (body.target_s === null || typeof body.target_s === "number") patch.target_s = body.target_s;
  if (typeof body.clip_count === "number") patch.clip_count = body.clip_count;
  const { data, error } = await db().from("sessions").update(patch).eq("id", id).is("deleted_at", null).select("updated_at").maybeSingle();
  if (error) throw error;
  if (!data) return fail("Session not found", 404);
  return json({ ok: true, updated_at: data.updated_at });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { error } = await db().from("sessions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  return json({ ok: true });
});
