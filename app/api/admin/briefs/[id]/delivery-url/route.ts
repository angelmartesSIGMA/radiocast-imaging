import { fail, json, route, UUID_RE } from "@/lib/api";
import { adminOr401 } from "@/lib/admin-guard";
import { str } from "@/lib/db/validate";
import { BUCKETS, signedUpload } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(b.name, 160).replace(/[^\w.\- ]+/g, "_") || "delivery";
  const path = `${id}/deliveries/${Date.now()}-${name.replace(/\s+/g, "_")}`;
  const up = await signedUpload(BUCKETS.briefs, path);
  return json({ url: up.url, path });
});
