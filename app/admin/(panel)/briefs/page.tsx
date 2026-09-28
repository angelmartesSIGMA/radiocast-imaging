import Link from "next/link";
import { NotConfigured } from "@/components/site/NotConfigured";
import s from "@/components/site/site.module.css";
import { BRIEF_STATUSES, type BriefRow, type BriefStatus } from "@/lib/db/types";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import { BriefTable } from "../brief-table";
import css from "../../admin.module.css";

export default async function AdminBriefs({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!supabaseConfigured()) return <NotConfigured />;
  const { status } = await searchParams;
  const valid = BRIEF_STATUSES.some((x) => x.id === status) ? (status as BriefStatus) : null;
  let q = db().from("briefs").select("id,ref,station,contact_email,status,created_at,deliverables").order("created_at", { ascending: false }).limit(200);
  if (valid) q = q.eq("status", valid);
  const { data, error } = await q;
  if (error) return <NotConfigured error={error} />;
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>Briefs</h1>
          <p className={s.lead}>Every “Send to producers” request. Open one to listen to the mix, update its status and deliver files.</p>
        </div>
      </div>
      <nav className={css.filters} aria-label="Filter by status">
        <Link href="/admin/briefs" aria-current={!valid ? "true" : undefined}>
          All
        </Link>
        {BRIEF_STATUSES.map((st) => (
          <Link key={st.id} href={`/admin/briefs?status=${st.id}`} aria-current={valid === st.id ? "true" : undefined}>
            {st.label}
          </Link>
        ))}
      </nav>
      <BriefTable rows={(data ?? []) as BriefRow[]} />
    </>
  );
}
