import { redirect } from "next/navigation";
import { UUID_RE } from "@/lib/api";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import { TEMPLATES } from "@/lib/studio/templates";
import { NotConfiguredPage } from "@/components/site/NotConfigured";

export const dynamic = "force-dynamic";

/** `/studio?template=…&sample=…` → create a session and open it. */
export default async function NewStudio({ searchParams }: { searchParams: Promise<{ template?: string; sample?: string }> }) {
  if (!supabaseConfigured()) return <NotConfiguredPage />;
  const sp = await searchParams;
  const sample = sp.sample && UUID_RE.test(sp.sample) ? sp.sample : null;
  const t = TEMPLATES.find((x) => x.id === sp.template) ?? TEMPLATES.find((x) => x.id === (sample ? "blank" : "summer"))!;
  const { data, error } = await db()
    .from("sessions")
    .insert({ name: t.title, target_s: t.target, data: { pendingTemplate: t.id, pendingSample: sample } })
    .select("id")
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  redirect(`/studio/${data.id}`);
}
