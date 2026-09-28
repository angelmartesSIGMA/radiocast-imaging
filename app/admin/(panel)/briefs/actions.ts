"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { UUID_RE } from "@/lib/api";
import { BRIEF_STATUSES, type BriefStatus } from "@/lib/db/types";
import { BUCKETS, db } from "@/lib/supabase/server";

/** Server actions are callable directly, so re-check the admin cookie here too. */
async function requireAdmin() {
  const ok = await verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET);
  if (!ok) throw new Error("Admin login required");
}

export async function setBriefStatus(id: string, status: BriefStatus, note: string) {
  await requireAdmin();
  if (!UUID_RE.test(id) || !BRIEF_STATUSES.some((s) => s.id === status)) throw new Error("Bad request");
  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { error } = await db().from("briefs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await db().from("brief_events").insert({ brief_id: id, status, note: note.trim().slice(0, 2000) || null });
  revalidatePath(`/admin/briefs/${id}`);
  revalidatePath("/admin/briefs");
}

export async function saveBriefNotes(id: string, notes: string) {
  await requireAdmin();
  if (!UUID_RE.test(id)) throw new Error("Bad request");
  const { error } = await db().from("briefs").update({ admin_notes: notes.slice(0, 10000) || null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/briefs/${id}`);
}

export async function deleteDelivery(briefId: string, fileId: string) {
  await requireAdmin();
  if (!UUID_RE.test(briefId) || !UUID_RE.test(fileId)) throw new Error("Bad request");
  const { data } = await db().from("brief_files").select("path").eq("id", fileId).maybeSingle<{ path: string }>();
  if (data) await db().storage.from(BUCKETS.briefs).remove([data.path]);
  await db().from("brief_files").delete().eq("id", fileId);
  revalidatePath(`/admin/briefs/${briefId}`);
}
