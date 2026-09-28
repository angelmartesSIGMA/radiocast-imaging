"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "@/components/site/site.module.css";
import { Icon, PauseGlyph, PlayGlyph } from "@/components/ui/Icon";
import { wavePath } from "@/lib/audio/dsp";
import type { SampleRow } from "@/lib/db/types";
import { typeColor } from "@/lib/studio/colors";
import { api, audioMime, putSigned } from "@/lib/studio/remote";
import type { TrackType } from "@/lib/studio/types";
import css from "./samples.module.css";

type Row = SampleRow & { url: string | null };
type Upload = { key: string; name: string; p: number; error?: string };

const KINDS = ["Bed", "Sweep", "Hit", "FX", "Stinger", "Voice"];
const typeFor = (kind: string): TrackType => (kind === "Bed" ? "bed" : kind === "Voice" ? "voice" : "fx");

/** Best guess at a kind from the file name and length; admins can change it after. */
function guessKind(name: string, dur: number) {
  const n = name.toLowerCase();
  if (/bed|loop|music|pad|instrumental/.test(n) || dur > 8) return "Bed";
  if (/sweep|whoosh|riser|swell|rise|down/.test(n)) return "Sweep";
  if (/hit|impact|boom|drop|slam/.test(n)) return "Hit";
  if (/sting|logo|jingle|chime|id\b/.test(n)) return "Stinger";
  if (/voice|vo\b|read|dry/.test(n)) return "Voice";
  return "FX";
}

export function SampleManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [over, setOver] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ samples: Row[] }>("/api/admin/samples");
      setRows(r.samples);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load samples");
    }
  }, []);

  useEffect(() => {
    void load();
    audio.current = new Audio();
    audio.current.onended = () => setPlaying(null);
    return () => audio.current?.pause();
  }, [load]);

  const patch = async (id: string, p: Partial<SampleRow>) => {
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null);
    try {
      await api(`/api/admin/samples/${id}`, { method: "PATCH", json: p });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t save");
      void load();
    }
  };

  const remove = async (r: Row) => {
    if (!confirm(`Delete “${r.name}”? Sessions using it will lose this sound.`)) return;
    setRows((rs) => rs?.filter((x) => x.id !== r.id) ?? null);
    await api(`/api/admin/samples/${r.id}`, { method: "DELETE" }).catch(() => load());
  };

  const addFiles = async (files: File[]) => {
    const ctx = new AudioContext();
    for (const f of files) {
      const key = `${f.name}-${f.size}-${Date.now()}`;
      const set = (u: Partial<Upload>) => setUploads((us) => us.map((x) => (x.key === key ? { ...x, ...u } : x)));
      setUploads((us) => [...us, { key, name: f.name, p: 0 }]);
      try {
        const buf = await ctx.decodeAudioData(await f.arrayBuffer());
        const name = f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
        const kind = guessKind(f.name, buf.duration);
        const mime = audioMime(f.name, f.type);
        const { id, path, url } = await api<{ id: string; path: string; url: string }>("/api/admin/samples/upload-url", {
          method: "POST",
          json: { name: f.name, mime },
        });
        await putSigned(url, f, mime, (p) => set({ p }));
        const { sample } = await api<{ sample: SampleRow }>("/api/admin/samples", {
          method: "POST",
          json: {
            id,
            path,
            name,
            kind,
            type: typeFor(kind),
            duration: +buf.duration.toFixed(3),
            size: f.size,
            mime,
            waveform: wavePath(buf.getChannelData(0)),
          },
        });
        setRows((rs) => [{ ...sample, url: null }, ...(rs ?? [])]);
        setUploads((us) => us.filter((x) => x.key !== key));
      } catch (e) {
        set({ error: e instanceof Error ? e.message : "Upload failed" });
      }
    }
    void ctx.close();
    void load();
  };

  const toggle = (r: Row) => {
    const a = audio.current;
    if (!a || !r.url) return;
    if (playing === r.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = r.url;
    void a.play();
    setPlaying(r.id);
  };

  const shown = (rows ?? []).filter((r) => filter === "all" || (filter === "published" ? r.published : !r.published));

  return (
    <div>
      <div
        className={css.drop}
        data-over={over || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addFiles(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("audio/") || /\.(wav|mp3|aiff?|m4a|ogg|flac)$/i.test(f.name)));
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <Icon name="upload" size={18} />
        <span>
          <strong>Drop audio files here</strong> or click to choose. They’re added as drafts — publish when ready.
        </span>
        <input
          ref={input}
          type="file"
          accept="audio/*,.wav,.mp3,.aif,.aiff,.m4a,.ogg,.flac"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <ul className={css.uploads}>
          {uploads.map((u) => (
            <li key={u.key} data-error={u.error ? true : undefined}>
              <span>{u.name}</span>
              {u.error ? <span>{u.error}</span> : <span className={css.bar}><span style={{ transform: `scaleX(${u.p})` }} /></span>}
            </li>
          ))}
        </ul>
      )}
      {err && <p className={s.error}>{err}</p>}

      <div className={s.sectionHead}>
        <div className={css.tabs} role="radiogroup" aria-label="Filter">
          {(["all", "published", "draft"] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? `All ${rows?.length ?? ""}` : f === "published" ? `Published ${rows?.filter((r) => r.published).length ?? ""}` : `Drafts ${rows?.filter((r) => !r.published).length ?? ""}`}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className={s.empty}>Loading…</div>
      ) : shown.length ? (
        <div className={s.tableWrap}>
          <table className={`${s.table} ${css.table}`}>
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Kind</th>
                <th>Category</th>
                <th>Tags</th>
                <th>BPM</th>
                <th>Length</th>
                <th>Published</th>
                <th>Featured</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button type="button" className={css.thumb} style={{ "--c": typeColor(r.type) } as React.CSSProperties} onClick={() => toggle(r)} aria-label={`Preview ${r.name}`}>
                      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path d={r.waveform || "M0 20 L100 20 Z"} />
                      </svg>
                      <span>{playing === r.id ? <PauseGlyph size={10} /> : <PlayGlyph size={10} />}</span>
                    </button>
                  </td>
                  <td>
                    <input className={css.cell} defaultValue={r.name} onBlur={(e) => e.target.value !== r.name && patch(r.id, { name: e.target.value })} aria-label="Name" />
                  </td>
                  <td>
                    <select className={css.cell} value={r.kind} onChange={(e) => patch(r.id, { kind: e.target.value, type: typeFor(e.target.value) })} aria-label="Kind">
                      {KINDS.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className={css.cell} defaultValue={r.category ?? ""} placeholder="e.g. Hot AC" onBlur={(e) => e.target.value !== (r.category ?? "") && patch(r.id, { category: e.target.value })} aria-label="Category" />
                  </td>
                  <td>
                    <input
                      className={css.cell}
                      defaultValue={r.tags.join(", ")}
                      placeholder="comma, separated"
                      onBlur={(e) => {
                        const tags = e.target.value.split(",").map((t) => t.trim()).filter(Boolean);
                        if (tags.join(",") !== r.tags.join(",")) void patch(r.id, { tags });
                      }}
                      aria-label="Tags"
                    />
                  </td>
                  <td>
                    <input
                      className={`${css.cell} ${css.narrow}`}
                      type="number"
                      defaultValue={r.bpm ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value ? Number(e.target.value) : null;
                        if (v !== r.bpm) void patch(r.id, { bpm: v });
                      }}
                      aria-label="BPM"
                    />
                  </td>
                  <td className={s.num}>{(r.duration_s ?? 0).toFixed(1)}s</td>
                  <td>
                    <Switch on={r.published} label="Published" onChange={(v) => patch(r.id, { published: v })} />
                  </td>
                  <td>
                    <Switch on={r.featured} label="Featured" onChange={(v) => patch(r.id, { featured: v })} />
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button type="button" className={`${s.btnGhost} ${s.small}`} onClick={() => remove(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={s.empty}>
          <strong>{rows.length ? "Nothing in this view" : "No samples yet"}</strong>
          <span>Drop some audio above to get started.</span>
        </div>
      )}
    </div>
  );
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={css.switch} onClick={() => onChange(!on)} />;
}
