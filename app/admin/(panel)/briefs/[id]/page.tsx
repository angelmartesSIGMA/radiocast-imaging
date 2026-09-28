import Link from "next/link";
import { notFound } from "next/navigation";
import { NotConfigured } from "@/components/site/NotConfigured";
import { StatusChip } from "@/components/site/StatusChip";
import s from "@/components/site/site.module.css";
import { UUID_RE } from "@/lib/api";
import { fxLabel } from "@/lib/audio/fx";
import type { BriefEventRow, BriefFileRow, BriefRow } from "@/lib/db/types";
import { BRIEF_STATUSES } from "@/lib/db/types";
import { ago, bytes, dur } from "@/lib/format-site";
import { BUCKETS, db, signedUrl, supabaseConfigured } from "@/lib/supabase/server";
import { Deliveries, NotesForm, StatusForm } from "./client";
import css from "../../../admin.module.css";

export default async function BriefDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  if (!supabaseConfigured()) return <NotConfigured />;
  const [{ data: b, error }, { data: events }, { data: files }] = await Promise.all([
    db().from("briefs").select("*").eq("id", id).maybeSingle<BriefRow>(),
    db().from("brief_events").select("*").eq("brief_id", id).order("created_at", { ascending: false }),
    db().from("brief_files").select("*").eq("brief_id", id).order("created_at"),
  ]);
  if (error) return <NotConfigured error={error} />;
  if (!b) notFound();
  const mixUrl = b.mix_path ? await signedUrl(BUCKETS.briefs, b.mix_path).catch(() => null) : null;
  const fileRows = (files ?? []) as BriefFileRow[];
  const fileUrls = fileRows.length
    ? new Map(((await db().storage.from(BUCKETS.briefs).createSignedUrls(fileRows.map((f) => f.path), 3600)).data ?? []).map((x) => [x.path, x.signedUrl]))
    : new Map<string | null, string>();
  const snap = b.session_snapshot;

  return (
    <>
      <div className={s.pageHead}>
        <div>
          <p className={s.muted} style={{ margin: 0, fontSize: 13 }}>
            <Link href="/admin/briefs">Briefs</Link> / <span className="mono">{b.ref}</span>
          </p>
          <h1 className={s.h1} style={{ marginTop: 6 }}>
            {b.station || snap.name || "Brief"} <StatusChip status={b.status} />
          </h1>
          <p className={s.lead}>
            {b.deliverables.join(", ")} · {b.turnaround === "rush" ? "Rush (24 h)" : "Standard (3 days)"} · received {ago(b.created_at)}
          </p>
        </div>
        {b.session_id && (
          <Link href={`/studio/${b.session_id}`} className={s.btn}>
            Open session
          </Link>
        )}
      </div>

      <div className={css.detail}>
        <div>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Mix</h2>
            {mixUrl ? <audio controls src={mixUrl} preload="metadata" /> : <p className={s.muted}>No mix was uploaded with this brief.</p>}
          </section>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Script and notes</h2>
            {b.script ? <p className={css.script}>{b.script}</p> : <p className={s.muted}>No script provided.</p>}
          </section>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Deliveries</h2>
            <Deliveries
              briefId={b.id}
              files={fileRows.map((f) => ({ id: f.id, name: f.name, size: bytes(f.size_bytes), url: fileUrls.get(f.path) ?? null }))}
            />
          </section>
        </div>

        <div>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Status</h2>
            <StatusForm id={b.id} status={b.status} statuses={BRIEF_STATUSES} />
          </section>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Details</h2>
            <dl className={css.kv}>
              <dt>Contact</dt>
              <dd>
                <a href={`mailto:${b.contact_email}?subject=${encodeURIComponent(`Your Radiocast brief ${b.ref}`)}`}>{b.contact_email}</a>
              </dd>
              <dt>Voice</dt>
              <dd>{b.voice || "—"}</dd>
              <dt>Target</dt>
              <dd>{b.target_s ? `:${String(b.target_s).padStart(2, "0")}` : "—"}</dd>
              <dt>Session</dt>
              <dd>
                {snap.name || "—"}
                {snap.duration_s != null && ` · ${dur(snap.duration_s)} · ${snap.clip_count ?? 0} clips`}
              </dd>
              {snap.lanes?.length ? (
                <>
                  <dt>Tracks</dt>
                  <dd>{snap.lanes.map((l) => `${l.label}${l.fx ? ` (${fxLabel(l.fx)})` : ""}`).join(", ")}</dd>
                </>
              ) : null}
            </dl>
          </section>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>Internal notes</h2>
            <NotesForm id={b.id} notes={b.admin_notes ?? ""} />
          </section>
          <section className={css.panel}>
            <h2 className={css.panelTitle}>History</h2>
            <ol className={css.timeline}>
              {((events ?? []) as BriefEventRow[]).map((e) => (
                <li key={e.id}>
                  <span>{e.status ? <StatusChip status={e.status} /> : null}</span>
                  {e.note && <span>{e.note}</span>}
                  <time dateTime={e.created_at}>{ago(e.created_at)}</time>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
