"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import s from "@/components/site/site.module.css";
import type { BriefStatus } from "@/lib/db/types";
import { api, audioMime, putSigned } from "@/lib/studio/remote";
import { deleteDelivery, saveBriefNotes, setBriefStatus } from "../actions";

export function StatusForm({ id, status, statuses }: { id: string; status: BriefStatus; statuses: { id: BriefStatus; label: string }[] }) {
  const [value, setValue] = useState(status);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setErr(null);
          try {
            await setBriefStatus(id, value, note);
            setNote("");
          } catch (x) {
            setErr(x instanceof Error ? x.message : "Couldn’t update");
          }
        });
      }}
    >
      <select className={s.select} value={value} onChange={(e) => setValue(e.target.value as BriefStatus)} aria-label="Status">
        {statuses.map((st) => (
          <option key={st.id} value={st.id}>
            {st.label}
          </option>
        ))}
      </select>
      <textarea
        className={s.textarea}
        style={{ marginTop: 10, minHeight: 64 }}
        placeholder="Note for the history (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {err && <p className={s.error}>{err}</p>}
      <button type="submit" className={`${s.btnPrimary} ${s.small}`} disabled={pending || (value === status && !note.trim())} style={{ marginTop: 10 }}>
        {pending ? "Saving…" : "Update status"}
      </button>
    </form>
  );
}

export function NotesForm({ id, notes }: { id: string; notes: string }) {
  const [value, setValue] = useState(notes);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <div>
      <textarea
        className={s.textarea}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="Only admins see these"
      />
      <button
        type="button"
        className={`${s.btn} ${s.small}`}
        style={{ marginTop: 8 }}
        disabled={pending || value === notes}
        onClick={() =>
          start(async () => {
            await saveBriefNotes(id, value);
            setSaved(true);
          })
        }
      >
        {pending ? "Saving…" : saved ? "Saved" : "Save notes"}
      </button>
    </div>
  );
}

type FileItem = { id: string; name: string; size: string; url: string | null };

export function Deliveries({ briefId, files }: { briefId: string; files: FileItem[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; p: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = async (list: FileList) => {
    setErr(null);
    for (const f of Array.from(list)) {
      try {
        setProgress({ name: f.name, p: 0 });
        const mime = f.type || (f.name.endsWith(".zip") ? "application/zip" : audioMime(f.name));
        const { url, path } = await api<{ url: string; path: string }>(`/api/admin/briefs/${briefId}/delivery-url`, {
          method: "POST",
          json: { name: f.name },
        });
        await putSigned(url, f, mime, (p) => setProgress({ name: f.name, p }));
        await api(`/api/admin/briefs/${briefId}/files`, { method: "POST", json: { path, name: f.name, size: f.size, mime } });
      } catch (e) {
        setErr(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setProgress(null);
    router.refresh();
  };

  return (
    <div>
      {files.length ? (
        <div className={s.tableWrap} style={{ marginBottom: 12 }}>
          <table className={s.table}>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{f.url ? <a href={f.url} download={f.name}>{f.name}</a> : f.name}</td>
                  <td className={s.num}>{f.size}</td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      className={`${s.btnGhost} ${s.small}`}
                      disabled={pending}
                      onClick={() => confirm(`Remove ${f.name}?`) && start(() => deleteDelivery(briefId, f.id))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={s.muted} style={{ marginTop: 0 }}>
          Nothing delivered yet. Upload finished WAV/MP3 files (or a ZIP); the client sees them on their dashboard.
        </p>
      )}
      <input ref={input} type="file" multiple hidden accept="audio/*,.zip" onChange={(e) => e.target.files && void upload(e.target.files)} />
      <button type="button" className={`${s.btn} ${s.small}`} onClick={() => input.current?.click()} disabled={!!progress}>
        {progress ? `Uploading ${progress.name} · ${Math.round(progress.p * 100)}%` : "Upload delivery files"}
      </button>
      {err && <p className={s.error}>{err}</p>}
    </div>
  );
}
