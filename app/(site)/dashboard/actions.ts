"use server";

import { revalidatePath } from "next/cache";
import { UUID_RE } from "@/lib/api";
import { GENERATORS } from "@/lib/audio/generators";
import { BUCKETS, db } from "@/lib/supabase/server";
import type { SessionRow } from "@/lib/db/types";

const ok = (id: string) => {
  if (!UUID_RE.test(id)) throw new Error("Bad id");
};

export async function renameSession(id: string, name: string) {
  ok(id);
  const clean = name.trim().slice(0, 120) || "Untitled session";
  const { error } = await db().from("sessions").update({ name: clean }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function deleteSession(id: string) {
  ok(id);
  const { error } = await db().from("sessions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function duplicateSession(id: string) {
  ok(id);
  const { data: src, error } = await db().from("sessions").select("*").eq("id", id).single<SessionRow>();
  if (error) throw new Error(error.message);
  const { data, error: iErr } = await db()
    .from("sessions")
    .insert({
      name: `${src.name} copy`.slice(0, 120),
      data: src.data,
      duration_s: src.duration_s,
      target_s: src.target_s,
      clip_count: src.clip_count,
    })
    .select("id")
    .single<{ id: string }>();
  if (iErr) throw new Error(iErr.message);
  // Uploads belong to the session they were made in; the copy still references them by id.
  revalidatePath("/dashboard");
  return data.id;
}

export async function deleteAsset(id: string) {
  ok(id);
  const { data: row } = await db().from("assets").select("path").eq("id", id).maybeSingle<{ path: string }>();
  if (row) await db().storage.from(BUCKETS.userAudio).remove([row.path]);
  const { error } = await db().from("assets").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

const BUILTIN = new Set(GENERATORS.map((g) => g.id));

/** Bring a pre-Supabase localStorage session into the database (built-in sounds only). */
export async function importLegacy(raw: {
  name?: unknown;
  clips?: unknown;
  lanes?: unknown;
  target?: unknown;
  master?: unknown;
  bpm?: unknown;
}) {
  const clips = (Array.isArray(raw.clips) ? raw.clips : []).filter(
    (c): c is { soundId: string } => !!c && typeof c === "object" && BUILTIN.has((c as { soundId?: string }).soundId ?? ""),
  );
  const lanes = Array.isArray(raw.lanes) ? raw.lanes.slice(0, 40) : [];
  if (!lanes.length) throw new Error("Nothing to import");
  const target = typeof raw.target === "number" ? raw.target : null;
  const { data, error } = await db()
    .from("sessions")
    .insert({
      name: (typeof raw.name === "string" && raw.name.trim()) || "Imported session",
      target_s: target,
      clip_count: clips.length,
      data: {
        version: 1,
        clips,
        lanes,
        target,
        master: typeof raw.master === "number" ? raw.master : 0,
        bpm: typeof raw.bpm === "number" ? raw.bpm : 120,
      },
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return data.id;
}
