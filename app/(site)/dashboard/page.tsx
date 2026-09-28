import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured } from "@/components/site/NotConfigured";
import { StatusChip } from "@/components/site/StatusChip";
import css from "@/components/site/site.module.css";
import type { AssetRow, BriefFileRow, BriefRow, SessionRow } from "@/lib/db/types";
import { ago, bytes, dur } from "@/lib/format-site";
import { BUCKETS, db, supabaseConfigured } from "@/lib/supabase/server";
import { TEMPLATES } from "@/lib/studio/templates";
import { AssetDelete, LegacyImport, NewSessionMenu, SessionCard } from "./client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard · Radiocast Imaging" };

type BriefWithFiles = BriefRow & { brief_files: BriefFileRow[] };

async function load() {
  const [sessions, briefs, assets] = await Promise.all([
    db()
      .from("sessions")
      .select("id,name,duration_s,target_s,clip_count,updated_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(60),
    db().from("briefs").select("*, brief_files(*)").order("created_at", { ascending: false }).limit(50),
    db().from("assets").select("*").eq("uploaded", true).order("created_at", { ascending: false }).limit(50),
  ]);
  for (const r of [sessions, briefs, assets]) if (r.error) throw new Error(r.error.message);
  const brs = (briefs.data ?? []) as BriefWithFiles[];
  const paths = brs.flatMap((b) => b.brief_files.map((f) => f.path));
  const signed = paths.length ? (await db().storage.from(BUCKETS.briefs).createSignedUrls(paths, 3600)).data ?? [] : [];
  const urls = new Map(signed.map((x) => [x.path, x.signedUrl]));
  return {
    sessions: (sessions.data ?? []) as Pick<SessionRow, "id" | "name" | "duration_s" | "target_s" | "clip_count" | "updated_at">[],
    briefs: brs,
    urls,
    assets: (assets.data ?? []) as AssetRow[],
  };
}

export default async function Dashboard() {
  if (!supabaseConfigured())
    return (
      <div className={css.container}>
        <div className={css.pageHead}>
          <h1 className={css.h1}>Dashboard</h1>
        </div>
        <NotConfigured />
      </div>
    );
  const { sessions, briefs, urls, assets } = await load();

  return (
    <div className={css.container}>
      <div className={css.pageHead}>
        <div>
          <h1 className={css.h1}>Dashboard</h1>
          <p className={css.lead}>Your sessions, briefs you’ve sent to producers, and the audio you’ve uploaded.</p>
        </div>
        <NewSessionMenu templates={TEMPLATES.map((t) => ({ id: t.id, name: t.name, blurb: t.blurb }))} />
      </div>

      <LegacyImport />

      <div className={css.sectionHead}>
        <h2 className={css.h2}>
          Sessions<span className={css.count}>{sessions.length}</span>
        </h2>
      </div>
      {sessions.length ? (
        <div className={css.grid}>
          {sessions.map((x) => (
            <SessionCard
              key={x.id}
              id={x.id}
              name={x.name}
              meta={`${dur(x.duration_s)}${x.target_s ? ` / :${String(x.target_s).padStart(2, "0")}` : ""} · ${x.clip_count} clip${x.clip_count === 1 ? "" : "s"}`}
              updated={ago(x.updated_at)}
              over={!!x.target_s && x.duration_s > x.target_s + 0.05}
            />
          ))}
        </div>
      ) : (
        <div className={css.empty}>
          <strong>No sessions yet</strong>
          <span>Start one from a template and it’ll autosave here.</span>
          <Link href="/studio" className={`${css.btnPrimary} ${css.small}`} style={{ marginTop: 10 }} prefetch={false}>
            Start a session
          </Link>
        </div>
      )}

      <div className={css.sectionHead}>
        <h2 className={css.h2}>
          Briefs<span className={css.count}>{briefs.length}</span>
        </h2>
      </div>
      {briefs.length ? (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Session</th>
                <th>Deliverables</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Deliveries</th>
              </tr>
            </thead>
            <tbody>
              {briefs.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.ref}</td>
                  <td>
                    {b.session_id ? <Link href={`/studio/${b.session_id}`}>{b.session_snapshot.name || "Session"}</Link> : b.session_snapshot.name || "—"}
                    {b.station && <div className={css.muted}>{b.station}</div>}
                  </td>
                  <td>{b.deliverables.join(", ")}</td>
                  <td>
                    <StatusChip status={b.status} />
                  </td>
                  <td className={css.num}>{ago(b.created_at)}</td>
                  <td>
                    {b.brief_files.length ? (
                      b.brief_files.map((f) => (
                        <div key={f.id}>
                          <a href={urls.get(f.path) ?? "#"} download={f.name}>
                            {f.name}
                          </a>
                        </div>
                      ))
                    ) : (
                      <span className={css.muted}>{b.status === "delivered" ? "—" : "Not yet"}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={css.empty}>
          <strong>No briefs yet</strong>
          <span>Use “Send to producers” in the studio when a session is ready.</span>
        </div>
      )}

      <div className={css.sectionHead}>
        <h2 className={css.h2}>
          Uploads & takes<span className={css.count}>{assets.length}</span>
        </h2>
      </div>
      {assets.length ? (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Length</th>
                <th>Size</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.session_id ? <Link href={`/studio/${a.session_id}`}>{a.name}</Link> : a.name}</td>
                  <td>{a.kind === "Mic" ? "Recorded take" : "Upload"}</td>
                  <td className={css.num}>{dur(a.duration_s)}</td>
                  <td className={css.num}>{bytes(a.size_bytes)}</td>
                  <td className={css.num}>{ago(a.created_at)}</td>
                  <td style={{ textAlign: "right" }}>
                    <AssetDelete id={a.id} name={a.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={css.empty}>
          <strong>Nothing uploaded yet</strong>
          <span>Files you drop into the studio and takes you record show up here.</span>
        </div>
      )}
    </div>
  );
}
