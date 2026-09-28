import { fail, json, route, UUID_RE } from "@/lib/api";
import { adminOr401 } from "@/lib/admin-guard";
import { num, str } from "@/lib/db/validate";
import { BUCKETS, db } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Record an uploaded delivery file against the brief. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const path = str(b.path, 400);
  if (!path.startsWith(`${id}/deliveries/`)) return fail("Bad path");
  const file = path.split("/").pop()!;
  const { data: list, error } = await db().storage.from(BUCKETS.briefs).list(`${id}/deliveries`, { search: file, limit: 1 });
  if (error) throw error;
  if (!list?.some((f) => f.name === file)) return fail("File hasn't finished uploading", 409);
  const { data, error: iErr } = await db()
    .from("brief_files")
    .insert({ brief_id: id, path, name: str(b.name, 160) || file, size_bytes: num(b.size), mime: str(b.mime, 80) || null })
    .select("id")
    .single<{ id: string }>();
  if (iErr) throw iErr;
  await db().from("brief_events").insert({ brief_id: id, note: `Delivery added: ${str(b.name, 160) || file}` });
  return json({ id: data.id }, 201);
});
