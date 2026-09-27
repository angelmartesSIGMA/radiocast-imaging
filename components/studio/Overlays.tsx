"use client";

import { useEffect, useRef } from "react";
import { SHORTCUTS, TRACK_TYPES } from "@/lib/studio/constants";
import { fmt } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import { Kbd } from "@/components/ui/controls";
import { Icon, type IconName } from "@/components/ui/Icon";
import css from "./Overlays.module.css";

export function Overlays() {
  return (
    <>
      <DragChip />
      <FileDropOverlay />
      <Toast />
      <ClipMenu />
      <ShortcutsDialog />
      <CountIn />
    </>
  );
}

function DragChip() {
  const drag = useStudio((s) => s.drag);
  const ghost = useStudio((s) => s.ghost);
  const lanes = useStudio((s) => s.lanes);
  if (!drag) return null;
  const lane = ghost && lanes.find((l) => l.id === ghost.lane);
  return (
    <div className={css.dragChip} style={{ left: drag.x + 14, top: drag.y + 14 }}>
      <span className={css.dot} style={{ background: TRACK_TYPES[drag.type].color, width: 8, height: 8 }} />
      <span className={css.dragName}>{drag.name}</span>
      <span className={css.dragHint}>{ghost && lane ? `${lane.label} · ${fmt(ghost.start)}` : "Drop on a track"}</span>
    </div>
  );
}

function FileDropOverlay() {
  const on = useStudio((s) => s.fileDrag);
  if (!on) return null;
  return (
    <div className={css.fileDrop}>
      <div className={css.pill}>
        <span className={css.eq}>
          {[0.5, 0.9, 0.6, 1, 0.7].map((h, i) => (
            <span key={i} style={{ height: `${h * 100}%`, animationDelay: `${i * 0.11}s` }} />
          ))}
        </span>
        <span className={css.pillStrong}>Drop on a track to place it</span>
        <span className={css.pillMuted}>or on Sounds to save for later</span>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useStudio((s) => s.toast);
  const fileDrag = useStudio((s) => s.fileDrag);
  if (!toast || fileDrag) return null;
  return (
    <div key={toast.id} className={css.pill} role="status" aria-live="polite" style={{ animation: "popIn 0.18s ease-out" }}>
      <span className={css.dot} style={{ background: toast.color }} />
      <span className={css.toastMsg}>{toast.msg}</span>
      {toast.action && (
        <button
          type="button"
          className={css.toastAction}
          onClick={() => {
            toast.action!.run();
            useStudio.getState().set({ toast: null });
          }}
        >
          {toast.action.label}
        </button>
      )}
      <span className={css.toastTimer} style={{ animationDuration: toast.action ? "5s" : "2.8s" }} />
    </div>
  );
}

function ClipMenu() {
  const menu = useStudio((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    ref.current?.querySelector("button")?.focus();
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) useStudio.getState().set({ menu: null });
    };
    const onScroll = () => useStudio.getState().set({ menu: null });
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("wheel", onScroll);
    };
  }, [menu]);

  if (!menu) return null;
  const s = useStudio.getState();
  const items: { label: string; icon: IconName; kbd?: string; danger?: boolean; run: () => void }[] = [
    { label: "Split at playhead", icon: "split", kbd: "S", run: s.split },
    { label: "Duplicate", icon: "copy", kbd: "⌘D", run: () => s.duplicate(menu.clipId) },
    {
      label: s.clips.find((x) => x.id === menu.clipId)?.reverse ? "Play forwards" : "Reverse",
      icon: "reverse",
      run: () => s.toggleReverse(menu.clipId),
    },
    {
      label: "Move playhead here",
      icon: "target",
      run: () => {
        const c = s.clips.find((x) => x.id === menu.clipId);
        if (c) s.seek(c.start);
        s.set({ menu: null });
      },
    },
    { label: "Delete", icon: "trash", kbd: "⌫", danger: true, run: () => s.removeClip(menu.clipId) },
  ];
  const x = Math.min(menu.x, window.innerWidth - 228);
  const y = Math.min(menu.y, window.innerHeight - 200);

  return (
    <div
      ref={ref}
      className={css.menu}
      role="menu"
      style={{ left: x, top: y }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        e.preventDefault();
        const btns = Array.from(ref.current?.querySelectorAll("button") ?? []);
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
      }}
    >
      {items.map((it) => (
        <button key={it.label} type="button" role="menuitem" data-danger={it.danger || undefined} onClick={it.run}>
          <Icon name={it.icon} size={14} />
          <span>{it.label}</span>
          {it.kbd && <span className={css.menuKbd}>{it.kbd}</span>}
        </button>
      ))}
    </div>
  );
}

function ShortcutsDialog() {
  const open = useStudio((s) => s.shortcuts);
  const set = useStudio((s) => s.set);
  if (!open) return null;
  return (
    <div className={css.modalWrap}>
      <div className={css.scrim} onClick={() => set({ shortcuts: false })} />
      <div className={css.modal} role="dialog" aria-modal="true" aria-labelledby="kbd-title">
        <div className={css.modalHead}>
          <div>
            <p className="eyebrow">Studio</p>
            <h2 id="kbd-title">Keyboard shortcuts</h2>
          </div>
          <button type="button" className={css.x} onClick={() => set({ shortcuts: false })} aria-label="Close" autoFocus>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className={css.kbdGrid}>
          {SHORTCUTS.map(([label, key]) => (
            <div key={label} className={css.kbdRow}>
              <span>{label}</span>
              <Kbd>{key}</Kbd>
            </div>
          ))}
        </div>
        <div className={css.modalFoot}>
          <button type="button" onClick={() => set({ shortcuts: false, palette: {} })}>
            <Icon name="search" size={14} />
            Search every action
            <Kbd>⌘K</Kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

function CountIn() {
  const n = useStudio((s) => s.countIn);
  if (n == null) return null;
  return (
    <div className={css.countIn} role="status" aria-live="assertive">
      <div className={css.countCard}>
        <span key={n} className={css.countNum}>
          {n}
        </span>
        <span className={css.countLabel}>Recording starts…</span>
        <span className={css.countHint}>
          Press <Kbd>R</Kbd> to cancel
        </span>
      </div>
    </div>
  );
}
