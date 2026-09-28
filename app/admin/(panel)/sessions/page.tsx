import Link from "next/link";
import { NotConfigured } from "@/components/site/NotConfigured";
import s from "@/components/site/site.module.css";
import type { SessionRow } from "@/lib/db/types";
import { ago, dur } from "@/lib/format-site";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import { AdminDeleteSession } from "./delete";

export default async function AdminSessions() {
  if (!supabaseConfigured()) return <NotConfigured />;
  const { data, error } = await db()
    .from("sessions")
    .select("id,name,duration_s,target_s,clip_count,created_at,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SessionRow[];
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>Sessions</h1>
          <p className={s.lead}>Every studio session, most recently edited first.</p>
        </div>
      </div>
      {rows.length ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Length</th>
                <th>Clips</th>
                <th>Created</th>
                <th>Edited</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/studio/${r.id}`}>{r.name}</Link>
                  </td>
                  <td className={s.num}>
                    {dur(r.duration_s)}
                    {r.target_s ? <span className={s.muted}> / :{String(r.target_s).padStart(2, "0")}</span> : null}
                  </td>
                  <td className={s.num}>{r.clip_count}</td>
                  <td className={s.num}>{ago(r.created_at)}</td>
                  <td className={s.num}>{ago(r.updated_at)}</td>
                  <td style={{ textAlign: "right" }}>
                    <AdminDeleteSession id={r.id} name={r.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={s.empty}>
          <strong>No sessions yet</strong>
        </div>
      )}
    </>
  );
}
