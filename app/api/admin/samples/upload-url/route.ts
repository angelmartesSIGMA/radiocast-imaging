import { audioExt, fail, json, route } from "@/lib/api";
import { adminOr401 } from "@/lib/admin-guard";
import { str } from "@/lib/db/validate";
import { BUCKETS, signedUpload } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const denied = await adminOr401();
  if (denied) return denied;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const mime = str(b.mime, 80);
  if (!mime.startsWith("audio/")) return fail("Only audio files can be samples", 415);
  const id = crypto.randomUUID();
  const path = `${id}.${audioExt(str(b.name, 200), mime)}`;
  const up = await signedUpload(BUCKETS.samples, path);
  return json({ id, path, url: up.url });
});
