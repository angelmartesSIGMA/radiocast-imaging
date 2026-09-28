import { fail, json, route, UUID_RE } from "@/lib/api";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Mark an asset uploaded once its file is really in the bucket. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { data: row, error } = await db().from("assets").select("path").eq("id", id).maybeSingle<{ path: string }>();
  if (error) throw error;
  if (!row) return fail("Asset not found", 404);
  const { data: files, error: lErr } = await db().storage.from(BUCKETS.userAudio).list("", { search: row.path, limit: 1 });
  if (lErr) throw lErr;
  if (!files?.some((f) => f.name === row.path)) return fail("File hasn't finished uploading", 409);
  const { error: uErr } = await db().from("assets").update({ uploaded: true }).eq("id", id);
  if (uErr) throw uErr;
  return json({ ok: true });
});
