import { audioExt, fail, json, route, UUID_RE } from "@/lib/api";
import { MAX_AUDIO_BYTES, num, str, trackType, waveform } from "@/lib/db/validate";
import { BUCKETS, db, signedUpload } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Reserve an asset row and hand back a signed URL the browser uploads the file to. */
export const POST = route(async (req: Request) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return fail("Bad body");
  const id = str(b.id, 40);
  if (!UUID_RE.test(id)) return fail("Bad asset id");
  const sessionId = str(b.sessionId, 40);
  const size = num(b.size) ?? 0;
  if (size > MAX_AUDIO_BYTES) return fail("File is larger than 100 MB", 413);
  const mime = str(b.mime, 80) || "audio/wav";
  if (!mime.startsWith("audio/")) return fail("Only audio files can be uploaded", 415);
  const path = `${id}.${audioExt(str(b.fileName, 200) || str(b.name, 200), mime)}`;
  const { error } = await db()
    .from("assets")
    .upsert({
      id,
      session_id: UUID_RE.test(sessionId) ? sessionId : null,
      path,
      name: str(b.name, 120) || "Untitled",
      kind: str(b.kind, 20) === "Mic" ? "Mic" : "Upload",
      type: trackType(b.type),
      duration_s: num(b.duration),
      size_bytes: size || null,
      mime,
      waveform: waveform(b.waveform),
      uploaded: false,
    });
  if (error) throw error;
  const up = await signedUpload(BUCKETS.userAudio, path);
  return json({ url: up.url, path });
});
