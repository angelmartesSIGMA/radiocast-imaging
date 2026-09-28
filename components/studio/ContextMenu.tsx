"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FX_PRESETS } from "@/lib/audio/fx";
import { clock } from "@/lib/studio/clock";
import { laneColor } from "@/lib/studio/colors";
import { TARGETS, TRACK_TYPES } from "@/lib/studio/constants";
import { fmt } from "@/lib/studio/format";
import { useStudio, type ContextMenu as Menu } from "@/lib/studio/store";
import type { Clip, TrackType } from "@/lib/studio/types";
import { Icon, type IconName } from "@/components/ui/Icon";
import css from "./ContextMenu.module.css";

export interface MenuItem {
  label: string;
  icon?: IconName;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  /** Colour dot instead of an icon (tracks). */
  color?: string;
  run?: () => void;
  children?: Entry[];
}
type Entry = MenuItem | "sep" | { heading: string };

const isItem = (e: Entry): e is MenuItem => typeof e === "object" && "label" in e;

/** Right-click menu for clips, track headers, empty track space, the ruler and library sounds. */
export function ContextMenu() {
  const menu = useStudio((s) => s.menu);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => useStudio.getState().set({ menu: null });
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  if (!menu) return null;
  const { title, items } = build(menu);
  if (!items.length) return null;

  return (
    <div ref={rootRef} key={`${menu.kind}:${menu.id}:${menu.x}:${menu.y}`}>
      <MenuList entries={items} x={menu.x} y={menu.y} title={title} autoFocus />
    </div>
  );
}

function MenuList({
  entries,
  x,
  y,
  title,
  autoFocus,
  flipX,
  onBack,
  menuId = "root",
}: {
  menuId?: string;
  entries: Entry[];
  x: number;
  y: number;
  title?: string;
  autoFocus?: boolean;
  /** Anchor's left edge, used to open to the left when there is no room on the right. */
  flipX?: number;
  onBack?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y, ready: false });
  const [sub, setSub] = useState<{ i: number; x: number; y: number; flip: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    if (left + r.width > window.innerWidth - 8) left = flipX != null ? flipX - r.width : window.innerWidth - r.width - 8;
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    setPos({ left: Math.max(8, left), top, ready: true });
    // Focus after the browser finishes its own right-click focus handling.
    if (autoFocus) requestAnimationFrame(() => el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  }, [x, y, flipX, autoFocus]);

  const close = () => useStudio.getState().set({ menu: null });
  const buttons = () => Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)") ?? []);
  const openSub = (i: number, el: HTMLElement, focus = false) => {
    const r = el.getBoundingClientRect();
    setSub({ i, x: r.right + 2, y: r.top - 5, flip: r.left - 2 });
    if (focus)
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>(`[data-menu-id="${menuId}-${i}"] > button:not(:disabled)`)?.focus(),
      );
  };

  let idx = -1;
  return (
    <>
      <div
        ref={ref}
        className={css.menu}
        role="menu"
        aria-label={title}
        data-menu-id={menuId}
        style={{ left: pos.left, top: pos.top, visibility: pos.ready ? "visible" : "hidden" }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          const btns = buttons();
          const i = btns.indexOf(document.activeElement as HTMLButtonElement);
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
          } else if (e.key === "ArrowRight") {
            const b = btns[i];
            if (b?.dataset.hasChildren) {
              e.preventDefault();
              e.stopPropagation();
              openSub(Number(b.dataset.idx), b, true);
            }
          } else if (e.key === "ArrowLeft" && onBack) {
            e.preventDefault();
            e.stopPropagation();
            onBack();
          }
        }}
      >
        {title && <p className={css.title}>{title}</p>}
        {entries.map((en, k) => {
          if (en === "sep") return <span key={`s${k}`} className={css.sep} role="separator" />;
          if (!isItem(en)) return <p key={`h${k}`} className={css.heading}>{en.heading}</p>;
          idx = k;
          const i = k;
          const hasKids = !!en.children?.length;
          return (
            <button
              key={`${en.label}${k}`}
              type="button"
              role={en.checked != null ? "menuitemcheckbox" : "menuitem"}
              aria-checked={en.checked}
              aria-haspopup={hasKids ? "menu" : undefined}
              aria-expanded={hasKids ? sub?.i === i : undefined}
              data-idx={i}
              data-has-children={hasKids || undefined}
              data-danger={en.danger || undefined}
              data-open={sub?.i === i || undefined}
              disabled={en.disabled}
              onPointerEnter={(e) => {
                clearTimeout(hoverTimer.current);
                const el = e.currentTarget;
                hoverTimer.current = setTimeout(() => (hasKids ? openSub(i, el) : setSub(null)), hasKids ? 90 : 140);
              }}
              onClick={(e) => {
                if (hasKids) {
                  openSub(i, e.currentTarget, true);
                  return;
                }
                close();
                en.run?.();
              }}
            >
              <span className={css.lead}>
                {en.checked ? (
                  <Icon name="check" size={13} strokeWidth={2.4} />
                ) : en.color ? (
                  <span className={css.dot} style={{ background: en.color }} />
                ) : en.icon ? (
                  <Icon name={en.icon} size={14} />
                ) : null}
              </span>
              <span className={css.label}>{en.label}</span>
              {en.kbd && <span className={css.kbd}>{en.kbd}</span>}
              {hasKids && <Icon name="chevronRight" size={13} />}
            </button>
          );
        })}
        {idx < 0 && <p className={css.heading}>Nothing to do here</p>}
      </div>
      {sub && isItem(entries[sub.i]) && (
        <MenuList
          menuId={`${menuId}-${sub.i}`}
          entries={(entries[sub.i] as MenuItem).children!}
          x={sub.x}
          y={sub.y}
          flipX={sub.flip}
          onBack={() => {
            const i = sub.i;
            setSub(null);
            ref.current?.querySelector<HTMLButtonElement>(`:scope > button[data-idx="${i}"]`)?.focus();
          }}
        />
      )}
    </>
  );
}

// ───────────────────────────────────────────── menu contents

const TYPES: TrackType[] = ["voice", "bed", "fx"];

function addTrackBelow(afterId?: string): Entry[] {
  const s = useStudio.getState();
  return TYPES.map((t) => ({
    label: TRACK_TYPES[t].label,
    color: TRACK_TYPES[t].color,
    run: () => {
      s.commit();
      s.createLane(t, afterId);
    },
  }));
}

function build(menu: Menu): { title?: string; items: Entry[] } {
  const s = useStudio.getState();
  switch (menu.kind) {
    case "clip": {
      const c = s.clips.find((x) => x.id === menu.id);
      if (!c) return { items: [] };
      return { title: s.sounds.find((x) => x.id === c.soundId)?.name, items: clipItems(c, menu.at) };
    }
    case "lane": {
      const l = s.lanes.find((x) => x.id === menu.id);
      return l ? { title: l.label, items: laneItems(l.id) } : { items: [] };
    }
    case "area": {
      const l = s.lanes.find((x) => x.id === menu.id);
      return l ? { title: `${l.label} · ${fmt(menu.at ?? 0)}`, items: areaItems(l.id, menu.at ?? 0) } : { items: [] };
    }
    case "ruler":
      return { title: fmt(menu.at ?? 0), items: rulerItems(menu.at ?? 0) };
    case "sound": {
      const snd = s.sounds.find((x) => x.id === menu.id);
      return snd ? { title: snd.name, items: soundItems(snd.id) } : { items: [] };
    }
  }
}

function clipItems(c: Clip, at?: number): Entry[] {
  const s = useStudio.getState();
  const t = clock.t;
  const inside = t > c.start + 0.02 && t < c.start + c.len - 0.02;
  const lane = s.lanes.find((l) => l.id === c.lane);
  const patch = (p: Partial<Clip>) => {
    s.commit();
    s.updateClip(c.id, p, false);
    s.restartIfPlaying();
  };
  const fadeMax = (v: number) => Math.min(v, c.len / 2);
  return [
    { label: "Cut", icon: "scissors", kbd: "⌘X", run: () => s.cutClip(c.id) },
    { label: "Copy", icon: "copy", kbd: "⌘C", run: () => s.copyClip(c.id) },
    { label: "Paste after", icon: "clipboard", kbd: "⌘V", disabled: !s.clipboard, run: () => s.paste(c.lane, c.start + c.len) },
    { label: "Duplicate", icon: "copy", kbd: "⌘D", run: () => s.duplicate(c.id) },
    "sep",
    { label: "Split here", icon: "split", disabled: at == null, run: () => at != null && s.splitAt(c.id, at) },
    { label: "Split at playhead", icon: "split", kbd: "S", disabled: !inside, run: () => s.splitAt(c.id, t) },
    { label: "Trim start to playhead", icon: "arrowUp", disabled: !inside, run: () => s.trimToPlayhead(c.id, "start") },
    { label: "Trim end to playhead", icon: "arrowDown", disabled: !inside, run: () => s.trimToPlayhead(c.id, "end") },
    "sep",
    { label: c.reverse ? "Play forwards" : "Reverse", icon: "reverse", run: () => s.toggleReverse(c.id) },
    { label: c.muted ? "Unmute clip" : "Mute clip", icon: c.muted ? "volume" : "volumeX", run: () => patch({ muted: !c.muted }) },
    { label: "Normalise to −1 dB", icon: "sliders", run: () => s.normalizeClip(c.id) },
    {
      label: "Gain",
      icon: "volume",
      children: [
        { heading: `Now ${c.gain > 0 ? "+" : ""}${c.gain.toFixed(1)} dB` },
        { label: "+3 dB", run: () => patch({ gain: Math.min(12, c.gain + 3) }) },
        { label: "−3 dB", run: () => patch({ gain: Math.max(-24, c.gain - 3) }) },
        { label: "−6 dB", run: () => patch({ gain: Math.max(-24, c.gain - 6) }) },
        "sep",
        { label: "Reset to 0 dB", disabled: c.gain === 0, run: () => patch({ gain: 0 }) },
      ],
    },
    {
      label: "Fades",
      icon: "fade",
      children: [
        { label: "Quick de-click fades", run: () => patch({ fadeIn: fadeMax(0.01), fadeOut: fadeMax(0.01) }) },
        { label: "Fade in 0.5 s", run: () => patch({ fadeIn: fadeMax(0.5) }) },
        { label: "Fade out 0.5 s", run: () => patch({ fadeOut: fadeMax(0.5) }) },
        { label: "Fade out 1 s", run: () => patch({ fadeOut: fadeMax(1) }) },
        { label: "Fade out to end of target", disabled: !s.target || s.target <= c.start, run: () => s.target && patch({ fadeOut: fadeMax(Math.max(0.05, c.start + c.len - s.target)) }) },
        "sep",
        { label: "Remove fades", disabled: !c.fadeIn && !c.fadeOut, run: () => patch({ fadeIn: 0, fadeOut: 0 }) },
      ],
    },
    {
      label: "Move to track",
      icon: "rowsTall",
      children: [
        ...s.lanes.map<Entry>((l) => ({
          label: l.label,
          color: laneColor(l, s.lanes).color,
          checked: l.id === c.lane ? true : undefined,
          run: () => {
            if (l.id === c.lane) return;
            s.commit();
            s.updateClip(c.id, { lane: l.id });
          },
        })),
        "sep",
        {
          label: `New ${lane ? TRACK_TYPES[lane.type].label : ""} track`,
          icon: "plus",
          run: () => {
            if (!lane) return;
            s.commit();
            const nl = s.createLane(lane.type, lane.id);
            s.updateClip(c.id, { lane: nl.id }, false);
          },
        },
      ],
    },
    "sep",
    {
      label: "Play from clip start",
      icon: "play",
      run: () => {
        s.seek(c.start);
        if (!useStudio.getState().playing) s.play();
      },
    },
    { label: "Move playhead here", icon: "target", run: () => s.seek(at ?? c.start) },
    { label: "Open in inspector", icon: "panelRight", run: () => s.set({ selected: c.id, inspOpen: true }) },
    "sep",
    { label: "Delete", icon: "trash", kbd: "⌫", danger: true, run: () => s.removeClip(c.id) },
  ];
}

function laneItems(id: string): Entry[] {
  const s = useStudio.getState();
  const l = s.lanes.find((x) => x.id === id)!;
  const i = s.lanes.indexOf(l);
  const hasClips = s.clips.some((c) => c.lane === id);
  return [
    { label: "Rename", icon: "pencil", run: () => s.set({ renaming: id }) },
    { label: l.mute ? "Unmute" : "Mute", icon: l.mute ? "volume" : "volumeX", run: () => s.setLane(id, { mute: !l.mute }) },
    { label: l.solo ? "Unsolo" : "Solo", icon: "headphones", run: () => s.setLane(id, { solo: !l.solo }) },
    {
      label: "Processing",
      icon: "sliders",
      children: FX_PRESETS.map((p) => ({
        label: p.label,
        checked: (l.fx ?? "none") === p.id ? true : undefined,
        run: () => {
          s.commit();
          s.setLane(id, { fx: p.id === "none" ? undefined : p.id });
        },
      })),
    },
    { label: "Reset volume", icon: "volume", disabled: l.gain === 0, run: () => s.setLane(id, { gain: 0 }) },
    "sep",
    ...(l.type === "voice" ? ([{ label: "Record on this track", icon: "mic", kbd: "R", run: () => void s.toggleRecord(id) }, "sep"] as Entry[]) : []),
    { label: "Add track below", icon: "plus", children: addTrackBelow(id) },
    { label: "Duplicate track", icon: "copy", run: () => s.duplicateLane(id) },
    { label: "Move up", icon: "arrowUp", disabled: i === 0, run: () => s.moveLane(id, i - 1) },
    { label: "Move down", icon: "arrowDown", disabled: i === s.lanes.length - 1, run: () => s.moveLane(id, i + 1) },
    "sep",
    { label: "Clear clips", icon: "trash", danger: true, disabled: !hasClips, run: () => s.clearLane(id) },
    { label: "Delete track", icon: "trash", danger: true, disabled: s.lanes.length <= 1, run: () => s.removeLane(id) },
  ];
}

function areaItems(laneId: string, at: number): Entry[] {
  const s = useStudio.getState();
  const l = s.lanes.find((x) => x.id === laneId)!;
  return [
    { label: "Paste here", icon: "clipboard", kbd: "⌘V", disabled: !s.clipboard, run: () => s.paste(laneId, at) },
    { label: "Add sound here…", icon: "search", run: () => s.set({ palette: { lane: laneId, at } }) },
    ...(l.type === "voice"
      ? [
          {
            label: "Record here",
            icon: "mic" as IconName,
            run: () => {
              s.seek(at);
              void s.toggleRecord(laneId);
            },
          },
        ]
      : []),
    "sep",
    {
      label: "Play from here",
      icon: "play",
      run: () => {
        s.seek(at);
        if (!useStudio.getState().playing) s.play();
      },
    },
    { label: "Move playhead here", icon: "target", run: () => s.seek(at) },
    "sep",
    { label: "Track", icon: "rowsTall", children: laneItems(laneId) },
    { label: "Add track below", icon: "plus", children: addTrackBelow(laneId) },
  ];
}

function rulerItems(at: number): Entry[] {
  const s = useStudio.getState();
  return [
    {
      label: "Play from here",
      icon: "play",
      run: () => {
        s.seek(at);
        if (!useStudio.getState().playing) s.play();
      },
    },
    { label: "Move playhead here", icon: "target", run: () => s.seek(at) },
    {
      label: "Split all clips here",
      icon: "split",
      run: () => {
        s.seek(at);
        s.split();
      },
    },
    "sep",
    {
      label: "Target length",
      icon: "target",
      children: TARGETS.map((t) => ({
        label: t.value ? `${t.label}` : "No target",
        checked: s.target === t.value ? true : undefined,
        run: () => s.set({ target: t.value }),
      })),
    },
    { label: "Loop playback", icon: "loop", kbd: "L", checked: s.loop, run: () => s.set({ loop: !s.loop }) },
    {
      label: "Grid",
      icon: "magnet",
      children: [
        { label: "Time", checked: s.gridMode === "time" ? true : undefined, run: () => s.set({ gridMode: "time" }) },
        { label: `Bars & beats (${s.bpm} BPM)`, checked: s.gridMode === "beats" ? true : undefined, run: () => s.set({ gridMode: "beats" }) },
        "sep",
        { label: "Snap", checked: s.snapOn, run: () => s.set({ snapOn: !s.snapOn }) },
      ],
    },
    "sep",
    { label: "Zoom to fit", icon: "zoomOut", run: s.zoomFit },
    { label: "Zoom in", icon: "zoomIn", kbd: "+", run: () => s.zoomBy(1.5) },
    { label: "Zoom out", icon: "zoomOut", kbd: "−", run: () => s.zoomBy(1 / 1.5) },
  ];
}

function soundItems(id: string): Entry[] {
  const s = useStudio.getState();
  const snd = s.sounds.find((x) => x.id === id)!;
  return [
    { label: s.previewId === id ? "Stop preview" : "Preview", icon: "play", run: () => s.preview(id) },
    { label: "Add at playhead", icon: "plus", run: () => s.addClip(id) },
    {
      label: "Add to track",
      icon: "rowsTall",
      children: [
        ...s.lanes.map<Entry>((l) => ({
          label: l.label,
          color: laneColor(l, s.lanes).color,
          run: () => s.addClip(id, l.id),
        })),
        "sep",
        { label: `New ${TRACK_TYPES[snd.type].label} track`, icon: "plus", run: () => s.addClip(id, "__new__") },
      ],
    },
    ...(snd.status === "error" && snd.source === "asset"
      ? ([{ label: "Retry upload", icon: "upload", run: () => s.retryUpload(id) }] as Entry[])
      : []),
    ...(snd.user
      ? (["sep", { label: "Delete from library", icon: "trash", danger: true, run: () => s.removeSound(id) }] as Entry[])
      : []),
  ];
}
