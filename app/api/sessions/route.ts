import { fail, json, route } from "@/lib/api";
import { db } from "@/lib/supabase/server";
import { TEMPLATES } from "@/lib/studio/templates";
import type { SessionRow } from "@/lib/db/types";
import { UUID_RE } from "@/lib/api";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const { data, error } = await db()
    .from("sessions")
    .select("id,name,duration_s,target_s,clip_count,created_at,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return json({ sessions: data });
});

/** Create a session. The studio builds the arrangement from `pendingTemplate` on first open. */
export const POST = route(async (req: Request) => {
  const body = (await req.json().catch(() => ({}))) as { template?: string; sample?: string; name?: string };
  const t = TEMPLATES.find((x) => x.id === body.template) ?? (body.sample ? TEMPLATES.find((x) => x.id === "blank") : TEMPLATES[0]);
  if (body.sample && !UUID_RE.test(body.sample)) return fail("Bad sample id");
  const { data, error } = await db()
    .from("sessions")
    .insert({
      name: (body.name?.trim() || t?.title || "Untitled session").slice(0, 120),
      target_s: t?.target ?? null,
      data: { pendingTemplate: t?.id ?? "blank", pendingSample: body.sample ?? null },
    })
    .select("id")
    .single<Pick<SessionRow, "id">>();
  if (error) throw error;
  return json({ id: data.id }, 201);
});
