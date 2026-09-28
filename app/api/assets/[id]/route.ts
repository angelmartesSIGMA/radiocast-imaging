import { fail, json, route, UUID_RE } from "@/lib/api";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Delete an upload/take and its file. */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { data } = await db().from("assets").select("path").eq("id", id).maybeSingle<{ path: string }>();
  if (data) await db().storage.from(BUCKETS.userAudio).remove([data.path]);
  const { error } = await db().from("assets").delete().eq("id", id);
  if (error) throw error;
  return json({ ok: true });
});
