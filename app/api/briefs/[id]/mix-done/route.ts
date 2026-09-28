import { fail, json, route, UUID_RE } from "@/lib/api";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Attach the uploaded mix to the brief once the file is in storage. */
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const { data: files, error } = await db().storage.from(BUCKETS.briefs).list(id, { search: "mix.wav", limit: 1 });
  if (error) throw error;
  if (!files?.some((f) => f.name === "mix.wav")) return fail("Mix hasn't finished uploading", 409);
  const { error: uErr } = await db().from("briefs").update({ mix_path: `${id}/mix.wav` }).eq("id", id);
  if (uErr) throw uErr;
  return json({ ok: true });
});
