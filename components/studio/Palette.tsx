"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TARGETS, TRACK_TYPES } from "@/lib/studio/constants";
import { fmt } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import { TEMPLATES } from "@/lib/studio/templates";
import { Icon, type IconName } from "@/components/ui/Icon";
import css from "./Palette.module.css";

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon?: IconName;
  color?: string;
  kbd?: string;
  run: () => void;
}

/** ⌘K command palette: every action, every sound, templates and target lengths in one searchable list. */
export function Palette() {
  const ctx = useStudio((s) => s.palette);
  if (!ctx) return null;
  return <PaletteInner key={`${ctx.lane ?? ""}${ctx.at ?? ""}`} />;
}

function PaletteInner() {
  const s = useStudio();
  const ctx = s.palette!;
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => s.set({ palette: null });
  const lane = ctx.lane ? s.lanes.find((l) => l.id === ctx.lane) : undefined;

  const items = useMemo<Item[]>(() => {
    const st = useStudio.getState;
    const done = (fn: () => void) => () => {
      st().set({ palette: null });
      fn();
    };
    const sounds: Item[] = s.sounds.map((snd) => ({
      id: `sound-${snd.id}`,
      group: lane ? `Add to ${lane.label} at ${fmt(ctx.at ?? 0)}` : "Add sound at playhead",
      label: snd.name,
      sub: `${snd.kind} · ${snd.dur.toFixed(1)}s`,
      color: TRACK_TYPES[snd.type].color,
      run: done(() => st().addClip(snd.id, lane?.id ?? null, ctx.at)),
    }));
    if (lane) return sounds;
    const sel = s.selected;
    const actions: Item[] = [
      { id: "play", group: "Transport", label: s.playing ? "Pause" : "Play", icon: "play", kbd: "Space", run: done(st().togglePlay) },
      { id: "rec", group: "Transport", label: "Record a voice take", icon: "mic", kbd: "R", run: done(() => void st().toggleRecord()) },
      { id: "loop", group: "Transport", label: s.loop ? "Turn loop off" : "Turn loop on", icon: "loop", kbd: "L", run: done(() => st().set({ loop: !st().loop })) },
      { id: "home", group: "Transport", label: "Back to start", icon: "rewind", kbd: "Home", run: done(() => st().seek(0)) },
      { id: "split", group: "Edit", label: "Split at playhead", icon: "split", kbd: "S", run: done(st().split) },
      ...(sel
        ? [
            { id: "dup", group: "Edit", label: "Duplicate selected clip", icon: "copy" as IconName, kbd: "⌘D", run: done(() => st().duplicate()) },
            { id: "del", group: "Edit", label: "Delete selected clip", icon: "trash" as IconName, kbd: "⌫", run: done(() => st().removeClip(sel)) },
          ]
        : []),
      ...(sel
        ? [{ id: "rev", group: "Edit", label: "Reverse selected clip", icon: "reverse" as IconName, run: done(() => st().toggleReverse()) }]
        : []),
      { id: "grid", group: "View", label: s.gridMode === "beats" ? "Grid in seconds" : "Grid in bars & beats", icon: "magnet", run: done(() => st().set({ gridMode: st().gridMode === "beats" ? "time" : "beats" })) },
      { id: "thin", group: "View", label: "Thinner tracks", icon: "rowsThin", run: done(() => st().set({ laneH: Math.max(44, st().laneH - 16) })) },
      { id: "tall", group: "View", label: "Taller tracks", icon: "rowsTall", run: done(() => st().set({ laneH: Math.min(180, st().laneH + 16) })) },
      { id: "loud", group: "Files", label: "Measure loudness (LUFS)", icon: "gauge", run: done(() => void st().measureLoudness()) },
      { id: "undo", group: "Edit", label: "Undo", icon: "undo", kbd: "⌘Z", run: done(st().undo) },
      { id: "snap", group: "Edit", label: s.snapOn ? "Turn snapping off" : "Turn snapping on", icon: "magnet", run: done(() => st().set({ snapOn: !st().snapOn })) },
      { id: "add-voice", group: "Tracks", label: "Add voice track", icon: "plus", run: done(() => st().addLane("voice")) },
      { id: "add-bed", group: "Tracks", label: "Add music bed track", icon: "plus", run: done(() => st().addLane("bed")) },
      { id: "add-fx", group: "Tracks", label: "Add FX track", icon: "plus", run: done(() => st().addLane("fx")) },
      { id: "import", group: "Files", label: "Import audio files…", icon: "upload", run: done(() => document.querySelector<HTMLInputElement>("input[type=file]")?.click()) },
      { id: "export", group: "Files", label: "Export WAV", icon: "download", run: done(() => void st().exportWav()) },
      { id: "send", group: "Files", label: "Send to producers", icon: "send", run: done(() => st().set({ drawer: true, sent: false })) },
      { id: "fit", group: "View", label: "Fit session in view", icon: "zoomOut", run: done(st().zoomFit) },
      { id: "lib", group: "View", label: s.libOpen ? "Hide library" : "Show library", icon: "panelLeft", run: done(() => st().set({ libOpen: !st().libOpen })) },
      { id: "insp", group: "View", label: s.inspOpen ? "Hide inspector" : "Show inspector", icon: "panelRight", run: done(() => st().set({ inspOpen: !st().inspOpen })) },
      { id: "keys", group: "Help", label: "Keyboard shortcuts", icon: "keyboard", kbd: "?", run: done(() => st().set({ shortcuts: true })) },
    ];
    const templates: Item[] = TEMPLATES.map((t) => ({
      id: `tpl-${t.id}`,
      group: "New session from template",
      label: t.name,
      sub: t.blurb,
      icon: "plus",
      run: done(() => st().newSession(t.id)),
    }));
    const targets: Item[] = TARGETS.map((t) => ({
      id: `target-${t.label}`,
      group: "Target length",
      label: t.value ? `Target length ${t.label}` : "No target length",
      icon: "target",
      run: done(() => st().set({ target: t.value })),
    }));
    return [...actions, ...sounds, ...templates, ...targets];
  }, [s.sounds, s.selected, s.playing, s.loop, s.snapOn, s.libOpen, s.inspOpen, s.gridMode, lane, ctx.at]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length
    ? items.filter((it) => {
        const hay = `${it.label} ${it.group} ${it.sub ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
    : items;
  const idx = Math.min(active, Math.max(0, shown.length - 1));

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  let lastGroup = "";
  return (
    <div className={css.wrap}>
      <div className={css.scrim} onClick={close} />
      <div className={css.box} role="dialog" aria-modal="true" aria-label="Command palette">
        <div className={css.inputRow}>
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder={lane ? `Find a sound for ${lane.label}…` : "Search sounds, actions, templates…"}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((idx + 1) % Math.max(1, shown.length));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((idx - 1 + shown.length) % Math.max(1, shown.length));
              } else if (e.key === "Enter") {
                e.preventDefault();
                shown[idx]?.run();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={shown[idx] ? `pal-${shown[idx].id}` : undefined}
          />
          <kbd className={css.esc}>Esc</kbd>
        </div>
        <div ref={listRef} className={css.list} id="palette-list" role="listbox">
          {shown.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head && <p className={css.group}>{head}</p>}
                <div
                  id={`pal-${it.id}`}
                  data-idx={i}
                  role="option"
                  aria-selected={i === idx}
                  className={css.item}
                  onPointerMove={() => i !== idx && setActive(i)}
                  onClick={it.run}
                >
                  {it.color ? (
                    <span className={css.swatch} style={{ background: it.color }} />
                  ) : (
                    <span className={css.icon}>{it.icon && <Icon name={it.icon} size={14} />}</span>
                  )}
                  <span className={css.label}>{it.label}</span>
                  {it.sub && <span className={css.sub}>{it.sub}</span>}
                  {it.kbd && <kbd className={css.kbd}>{it.kbd}</kbd>}
                </div>
              </div>
            );
          })}
          {!shown.length && <p className={css.none}>No matches for “{q}”</p>}
        </div>
        <div className={css.foot}>
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to run
          </span>
        </div>
      </div>
    </div>
  );
}
