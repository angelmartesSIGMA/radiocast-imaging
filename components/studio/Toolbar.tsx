"use client";

import { TARGETS } from "@/lib/studio/constants";
import { useStudio } from "@/lib/studio/store";
import { IconButton, TextButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import css from "./Toolbar.module.css";

export function Toolbar() {
  const s = useStudio();
  const compact = s.vw < 760;
  const hasSel = !!s.selected;

  return (
    <div className={css.bar} role="toolbar" aria-label="Editing tools">
      <div className={css.group}>
        <IconButton
          icon="panelLeft"
          label="Sound library"
          tip={s.libOpen ? "Hide library" : "Show library"}
          on={s.libOpen}
          onClick={() => s.set({ libOpen: !s.libOpen })}
        />
      </div>

      <div className={css.group}>
        <IconButton icon="undo" label="Undo" kbd="⌘Z" disabled={!s.past.length} onClick={s.undo} />
        <IconButton icon="redo" label="Redo" kbd="⇧⌘Z" disabled={!s.future.length} onClick={s.redo} />
      </div>

      <div className={css.group}>
        <TextButton icon="split" onClick={s.split} tip="Split at playhead" kbd="S">
          {!compact && "Split"}
        </TextButton>
        <IconButton icon="copy" label="Duplicate clip" kbd="⌘D" disabled={!hasSel} onClick={() => s.duplicate()} />
        <IconButton icon="trash" label="Delete clip" kbd="⌫" disabled={!hasSel} onClick={() => s.selected && s.removeClip(s.selected)} />
      </div>

      <div className={css.group}>
        <TextButton
          icon="magnet"
          on={s.snapOn}
          onClick={() => s.set({ snapOn: !s.snapOn })}
          tip={s.snapOn ? "Snapping on" : "Snapping off"}
        >
          {!compact && "Snap"}
        </TextButton>
        <label className={css.target} data-tip="Target length — marks the timeline and warns when you run over">
          <Icon name="target" size={15} />
          <select
            value={s.target ?? ""}
            onChange={(e) => s.set({ target: e.target.value ? +e.target.value : null })}
            aria-label="Target length"
          >
            {TARGETS.map((t) => (
              <option key={t.label} value={t.value ?? ""}>
                {t.value ? `${t.label} target` : "No target"}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={12} />
        </label>
      </div>

      <div className={css.group}>
        <div className={css.seg} role="radiogroup" aria-label="Grid">
          {(["time", "beats"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={s.gridMode === m}
              onClick={() => s.set({ gridMode: m })}
              data-tip={m === "time" ? "Grid in seconds" : "Grid in bars and beats — snap cuts to the bed's tempo"}
            >
              {m === "time" ? "Time" : "Beats"}
            </button>
          ))}
        </div>
        {s.gridMode === "beats" && (
          <label className={css.bpm} data-tip="Tempo of your music bed">
            <input
              type="number"
              min={40}
              max={240}
              value={s.bpm}
              onChange={(e) => {
                const v = +e.target.value;
                if (v >= 40 && v <= 240) s.set({ bpm: v });
              }}
              aria-label="Tempo in BPM"
            />
            <span>BPM</span>
          </label>
        )}
      </div>

      <div className={css.group}>
        <IconButton
          icon="rowsThin"
          label="Thinner tracks"
          disabled={s.laneH <= 44}
          onClick={() => s.set({ laneH: Math.max(44, s.laneH - 16) })}
        />
        <IconButton
          icon="rowsTall"
          label="Taller tracks"
          disabled={s.laneH >= 180}
          onClick={() => s.set({ laneH: Math.min(180, s.laneH + 16) })}
        />
      </div>

      <div className={css.spacer} />

      <button type="button" className={css.cmd} onClick={() => s.set({ palette: {} })} data-tip="Search sounds and actions" data-kbd="⌘K">
        <Icon name="search" size={14} />
        {s.vw >= 1480 && <span>Search</span>}
        {!compact && <kbd>⌘K</kbd>}
      </button>

      <div className={css.group}>
        <IconButton icon="zoomOut" label="Zoom out" kbd="−" onClick={() => s.zoomBy(1 / 1.5)} />
        <TextButton onClick={s.zoomFit} tip="Fit the whole session in view">
          Fit
        </TextButton>
        <IconButton icon="zoomIn" label="Zoom in" kbd="+" onClick={() => s.zoomBy(1.5)} />
      </div>

      <div className={css.group}>
        {!compact && <IconButton icon="keyboard" label="Keyboard shortcuts" kbd="?" onClick={() => s.set({ shortcuts: true })} />}
        <IconButton
          icon="panelRight"
          label="Inspector"
          tip={s.inspOpen ? "Hide inspector" : "Show inspector"}
          on={s.inspOpen}
          onClick={() => s.set({ inspOpen: !s.inspOpen })}
        />
      </div>
    </div>
  );
}
