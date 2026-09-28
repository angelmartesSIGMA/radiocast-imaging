"use client";

import { useEffect, useMemo, useRef } from "react";
import { getEngine } from "@/lib/audio/engine";
import { dom } from "@/lib/studio/clock";
import { GROUPS, TRACK_TYPES } from "@/lib/studio/constants";
import { fmtShort } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import type { LibraryFilter, Sound } from "@/lib/studio/types";
import { Icon, PauseGlyph, PlayGlyph } from "@/components/ui/Icon";
import css from "./Library.module.css";

const SECTION_TITLES: Record<string, string> = {
  Bed: "Music beds",
  Sweep: "Sweeps",
  Hit: "Hits & drops",
  FX: "FX",
  Stinger: "Stingers",
};

const FILTERS: [LibraryFilter, string][] = [
  ["all", "All"],
  ["beds", "Beds"],
  ["fx", "FX"],
  ["stingers", "Stingers"],
];

const trackAt = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y);
  const tr = el?.closest<HTMLElement>("[data-track]");
  return tr ? { id: tr.dataset.track!, rect: tr.getBoundingClientRect() } : null;
};

export function Library({ floating }: { floating: boolean }) {
  const sounds = useStudio((s) => s.sounds);
  const filter = useStudio((s) => s.filter);
  const search = useStudio((s) => s.search);
  const previewId = useStudio((s) => s.previewId);
  const dragId = useStudio((s) => s.drag?.soundId);
  const libHover = useStudio((s) => s.libHover);
  const set = useStudio((s) => s.set);

  const filters: [LibraryFilter, string][] = [
    ...FILTERS,
    ...(sounds.some((s) => s.source === "sample") ? [["samples", "Library"] as [LibraryFilter, string]] : []),
    ...(sounds.some((s) => s.user) ? [["yours", "Yours"] as [LibraryFilter, string]] : []),
  ];
  const q = search.trim().toLowerCase();
  const list = useMemo(
    () =>
      sounds
        .filter((s) => {
          const match =
            filter === "all" ||
            (filter === "yours" && s.user) ||
            (filter === "samples" && s.source === "sample") ||
            (!s.user && GROUPS[s.kind] === filter);
          const text = `${s.name} ${s.kind} ${s.category ?? ""}`.toLowerCase();
          return match && (!q || text.includes(q));
        })
        .sort((a, b) => Number(b.user) - Number(a.user)),
    [sounds, filter, q],
  );
  // Group under headings when browsing everything; flat list for searches.
  const sections = useMemo(() => {
    if (q) return [{ title: `${list.length} result${list.length === 1 ? "" : "s"}`, items: list }];
    const out: { title: string; items: Sound[] }[] = [];
    for (const snd of list) {
      const title = snd.user ? "Your audio" : SECTION_TITLES[snd.kind] ?? snd.kind;
      const sec = out.find((x) => x.title === title);
      if (sec) sec.items.push(snd);
      else out.push({ title, items: [snd] });
    }
    return out;
  }, [list, q]);

  return (
    <aside
      className={`${css.lib} ${floating ? css.floating : ""}`}
      aria-label="Sound library"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        if (!libHover) set({ libHover: true, fileMark: null });
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new Event("studio:filedrop-reset"));
        void useStudio.getState().importFiles(Array.from(e.dataTransfer.files), "library");
      }}
    >
      <div className={css.head}>
        <div className={css.titleRow}>
          <p className={css.title}>
            Sounds <span className={css.count}>{sounds.length || ""}</span>
          </p>
          <button type="button" className={css.import} onClick={() => dom.fileInput?.click()} data-tip="Import audio files">
            <Icon name="upload" size={13} />
            Import
          </button>
        </div>
        <label className={css.search}>
          <Icon name="search" size={14} />
          <input
            value={search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search sounds"
            aria-label="Search sounds"
          />
          {search && (
            <button type="button" className={css.clear} onClick={() => set({ search: "" })} aria-label="Clear search">
              <Icon name="close" size={11} strokeWidth={2.4} />
            </button>
          )}
        </label>
        <div className={css.segments} role="radiogroup" aria-label="Filter sounds">
          {filters.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filter === id}
              onClick={() => set({ filter: id })}
            >
              {id === "yours" ? "Yours" : label}
            </button>
          ))}
        </div>
      </div>

      <div className={css.list}>
        {sections.map((sec) => (
          <section key={sec.title} className={css.section}>
            <p className={css.sectionTitle}>{sec.title}</p>
            {sec.items.map((snd) => (
              <SoundRow key={snd.id} s={snd} previewing={previewId === snd.id} dragging={dragId === snd.id} />
            ))}
          </section>
        ))}
        {sounds.length > 0 && !list.length && (
          <p className={css.empty}>{q ? `Nothing matches “${search}”` : "Nothing here yet"}</p>
        )}
        {!sounds.length && (
          <div className={css.skeletons} aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
        )}
      </div>

      <div className={css.foot}>
        <button type="button" className={css.drop} data-on={libHover || undefined} onClick={() => dom.fileInput?.click()}>
          <Icon name="upload" size={14} />
          <span className={css.dropTitle}>Drop audio files here</span>
          <span className={css.dropSub}>or browse</span>
        </button>
      </div>
    </aside>
  );
}

function SoundRow({ s, previewing, dragging }: { s: Sound; previewing: boolean; dragging: boolean }) {
  const T = TRACK_TYPES[s.type];

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const st = useStudio.getState;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        active = true;
        document.body.style.cursor = "grabbing";
      }
      const tr = trackAt(ev.clientX, ev.clientY);
      let ghost = null;
      let snapT = null;
      if (tr) {
        const r = st().snapTime((ev.clientX - tr.rect.left) / st().pps - Math.min(0.3, s.dur * 0.1), s.dur, null);
        ghost = { lane: tr.id, start: r.t, len: s.dur, type: s.type };
        snapT = r.snapT;
      }
      st().set({ drag: { soundId: s.id, name: s.name, type: s.type, x: ev.clientX, y: ev.clientY }, ghost, snapT });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      const g = st().ghost;
      st().set({ drag: null, ghost: null, snapT: null });
      if (active && g) st().addClip(s.id, g.lane, g.start);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className={css.row}
      data-dragging={dragging || undefined}
      data-previewing={previewing || undefined}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        useStudio.getState().set({ menu: { kind: "sound", id: s.id, x: e.clientX, y: e.clientY } });
      }}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) useStudio.getState().addClip(s.id);
      }}
      data-tip="Drag onto a track · double-click to add at playhead"
    >
      {previewing && <PreviewBar color={T.color} />}
      <span className={css.thumb} style={{ background: T.soft, color: T.color }}>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={s.path} fill={T.color} />
        </svg>
      </span>
      <span className={css.meta}>
        <span className={css.name}>{s.name}</span>
        <span className={css.kind} data-status={s.status}>
          {s.status === "uploading"
            ? "Uploading…"
            : s.status === "loading"
              ? "Downloading…"
              : s.status === "error"
                ? s.source === "asset"
                  ? "Not saved — right-click to retry"
                  : "Couldn’t load"
                : `${s.source === "sample" ? "Library · " : ""}${s.kind} · ${s.dur < 60 ? `${s.dur.toFixed(1)}s` : fmtShort(s.dur)}`}
        </span>
      </span>
      <button
        type="button"
        className={css.add}
        onClick={() => useStudio.getState().addClip(s.id)}
        aria-label={`Add ${s.name} at playhead`}
        data-tip="Add at playhead"
      >
        <Icon name="plus" size={12} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        className={css.preview}
        data-on={previewing || undefined}
        onClick={() => useStudio.getState().preview(s.id)}
        aria-label={previewing ? `Stop preview of ${s.name}` : `Preview ${s.name}`}
      >
        {previewing ? <PauseGlyph size={11} /> : <PlayGlyph size={11} />}
      </button>
    </div>
  );
}

function PreviewBar({ color }: { color: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      if (ref.current) ref.current.style.transform = `scaleX(${getEngine().previewProgress()})`;
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={ref} className={css.previewBar} style={{ background: color }} aria-hidden="true" />;
}
