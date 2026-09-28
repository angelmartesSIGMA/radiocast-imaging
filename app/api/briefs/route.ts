import { fail, json, route, UUID_RE } from "@/lib/api";
import { num, str, trackType } from "@/lib/db/validate";
import { BUCKETS, db, signedUpload } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create a brief; returns a signed URL for the rendered mix. */
export const POST = route(async (req: Request) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail("Bad body");
  const email = str(b.email, 200);
  if (!EMAIL_RE.test(email)) return fail("Enter a valid email address");
  const deliverables = Array.isArray(b.deliverables) ? b.deliverables.map((d) => str(d, 40)).filter(Boolean).slice(0, 10) : [];
  if (!deliverables.length) return fail("Pick at least one deliverable");
  const sessionId = str(b.sessionId, 40);
  const snap = (b.snapshot ?? {}) as Record<string, unknown>;
  const lanes = Array.isArray(snap.lanes) ? snap.lanes.slice(0, 40) : [];
  const snapshot = {
    name: str(snap.name, 120),
    duration_s: num(snap.duration_s),
    clip_count: num(snap.clip_count),
    lanes: lanes.map((l: Record<string, unknown>) => ({ label: str(l?.label, 60), type: trackType(l?.type), fx: str(l?.fx, 30) || undefined })),
  };
  const { data, error } = await db()
    .from("briefs")
    .insert({
      session_id: UUID_RE.test(sessionId) ? sessionId : null,
      session_snapshot: snapshot,
      station: str(b.station, 120) || null,
      contact_email: email,
      voice: str(b.voice, 60) || null,
      deliverables,
      turnaround: str(b.turnaround, 20) === "rush" ? "rush" : "standard",
      script: str(b.script, 5000) || null,
      target_s: num(b.target),
    })
    .select("id,ref")
    .single<{ id: string; ref: string }>();
  if (error) throw error;
  await db().from("brief_events").insert({ brief_id: data.id, status: "new", note: "Brief received" });
  const up = b.hasMix ? await signedUpload(BUCKETS.briefs, `${data.id}/mix.wav`) : null;
  return json({ id: data.id, ref: data.ref, uploadUrl: up?.url ?? null }, 201);
});
