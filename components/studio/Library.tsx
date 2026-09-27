"use client";

import { useEffect, useMemo, useRef } from "react";
import { getEngine } from "@/lib/audio/engine";
import { dom } from "@/lib/studio/clock";
import { GROUPS, TRACK_TYPES } from "@/lib/studio/constants";
import { fmtShort } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import type { LibraryFilter, Sound } from "@/lib/studio/types";
import { Chip } from "@/components/ui/controls";
import { Icon, PauseGlyph, PlayGlyph } from "@/components/ui/Icon";
import css from "./Library.module.css";

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

  const filters = sounds.some((s) => s.user) ? [...FILTERS, ["yours", "Your audio"] as [LibraryFilter, string]] : FILTERS;
  const q = search.trim().toLowerCase();
  const list = useMemo(
    () =>
      sounds
        .filter((s) => {
          const g = s.user ? "yours" : GROUPS[s.kind];
          return (filter === "all" || filter === g) && (!q || s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q));
        })
        .sort((a, b) => Number(b.user) - Number(a.user)),
    [sounds, filter, q],
  );

  return (
    <aside
      className={`${css.lib} ${floating ? css.floating : ""}`}
      aria-label="Sound library"
      data-tour="library"
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
          <p className="eyebrow">Sounds</p>
          <button type="button" className={css.import} onClick={() => dom.fileInput?.click()}>
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
        <div className={css.filters} role="radiogroup" aria-label="Filter sounds">
          {filters.map(([id, label]) => (
            <Chip key={id} role="radio" on={filter === id} onClick={() => set({ filter: id })}>
              {label}
            </Chip>
          ))}
        </div>
      </div>

      <div className={css.list}>
        {list.map((s) => (
          <SoundRow key={s.id} s={s} previewing={previewId === s.id} dragging={dragId === s.id} />
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
          <span className={css.dropIcon}>
            <Icon name="upload" size={15} />
          </span>
          <span>
            <span className={css.dropTitle}>Drop your own audio</span>
            <span className={css.dropSub}>WAV, MP3, AIFF, M4A, FLAC</span>
          </span>
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
        ghost = { lane: tr.id, start: r.t, len: s.dur };
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
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest("button")) useStudio.getState().addClip(s.id);
      }}
      data-tip="Drag onto a track · double-click to add at playhead"
    >
      {previewing && <PreviewBar color={T.color} />}
      <span className={css.thumb} style={{ background: T.soft }}>
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={s.path} fill={T.color} />
        </svg>
      </span>
      <span className={css.meta}>
        <span className={css.name}>{s.name}</span>
        <span className={css.kind}>
          {s.kind} · {s.dur < 60 ? `${s.dur.toFixed(1)}s` : fmtShort(s.dur)}
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
