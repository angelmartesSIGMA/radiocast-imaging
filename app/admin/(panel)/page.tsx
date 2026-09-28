import Link from "next/link";
import { NotConfigured } from "@/components/site/NotConfigured";
import s from "@/components/site/site.module.css";
import { BRIEF_STATUSES, type BriefRow } from "@/lib/db/types";
import { bytes } from "@/lib/format-site";
import { StatusChip } from "@/components/site/StatusChip";
import { BriefTable } from "./brief-table";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import css from "../admin.module.css";

const head = (table: string) => db().from(table).select("id", { count: "exact", head: true });
type Head = ReturnType<typeof head>;

async function count(table: string, f: (q: Head) => Head = (q) => q) {
  const { count: n, error } = await f(head(table));
  if (error) throw new Error(error.message);
  return n ?? 0;
}

export default async function AdminOverview() {
  if (!supabaseConfigured()) return <NotConfigured />;
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const [statusCounts, sessions, sessionsWeek, samples, published, assetSizes, sampleSizes, recent] = await Promise.all([
    Promise.all(BRIEF_STATUSES.map(async (st) => ({ ...st, n: await count("briefs", (q) => q.eq("status", st.id)) }))),
    count("sessions", (q) => q.is("deleted_at", null)),
    count("sessions", (q) => q.is("deleted_at", null).gte("created_at", week)),
    count("samples"),
    count("samples", (q) => q.eq("published", true)),
    db().from("assets").select("size_bytes").limit(10000),
    db().from("samples").select("size_bytes").limit(10000),
    db().from("briefs").select("id,ref,station,contact_email,status,created_at,deliverables").order("created_at", { ascending: false }).limit(6),
  ]);
  const sum = (r: { data: { size_bytes: number | null }[] | null }) => (r.data ?? []).reduce((a, x) => a + (x.size_bytes ?? 0), 0);
  const open = statusCounts.filter((x) => x.id === "new" || x.id === "in_progress" || x.id === "needs_info").reduce((a, x) => a + x.n, 0);

  return (
    <>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>Overview</h1>
          <p className={s.lead}>What needs attention, and how the studio is being used.</p>
        </div>
      </div>
      <div className={css.stats}>
        <Link href="/admin/briefs?status=new" className={css.stat}>
          <p className={css.statLabel}>New briefs</p>
          <p className={css.statValue}>{statusCounts[0].n}</p>
          <p className={css.statSub}>{open} open in total</p>
        </Link>
        <Link href="/admin/sessions" className={css.stat}>
          <p className={css.statLabel}>Sessions</p>
          <p className={css.statValue}>{sessions}</p>
          <p className={css.statSub}>{sessionsWeek} started this week</p>
        </Link>
        <Link href="/admin/samples" className={css.stat}>
          <p className={css.statLabel}>Samples published</p>
          <p className={css.statValue}>{published}</p>
          <p className={css.statSub}>{samples} in the library</p>
        </Link>
        <div className={css.stat}>
          <p className={css.statLabel}>Storage used</p>
          <p className={css.statValue}>{bytes(sum(assetSizes) + sum(sampleSizes))}</p>
          <p className={css.statSub}>
            {bytes(sum(assetSizes))} uploads · {bytes(sum(sampleSizes))} samples
          </p>
        </div>
      </div>

      <div className={s.sectionHead}>
        <h2 className={s.h2}>Briefs by status</h2>
      </div>
      <div className={css.filters}>
        {statusCounts.map((st) => (
          <Link key={st.id} href={`/admin/briefs?status=${st.id}`}>
            <StatusChip status={st.id} /> {st.n}
          </Link>
        ))}
      </div>

      <div className={s.sectionHead}>
        <h2 className={s.h2}>Latest briefs</h2>
        <Link href="/admin/briefs" className={`${s.btnGhost} ${s.small}`}>
          All briefs
        </Link>
      </div>
      <BriefTable rows={(recent.data ?? []) as BriefRow[]} />
    </>
  );
}

