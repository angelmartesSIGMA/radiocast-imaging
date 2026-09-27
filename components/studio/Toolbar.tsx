"use client";

import { TARGETS } from "@/lib/studio/constants";
import { useStudio } from "@/lib/studio/store";
import { Divider, IconButton, TextButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import css from "./Toolbar.module.css";

export function Toolbar() {
  const s = useStudio();
  const compact = s.vw < 760;

  return (
    <div className={css.bar} role="toolbar" aria-label="Editing tools">
      <IconButton icon="panelLeft" label="Sound library" on={s.libOpen} onClick={() => s.set({ libOpen: !s.libOpen })} />
      <Divider />
      <IconButton icon="undo" label="Undo" title="Undo (⌘Z)" disabled={!s.past.length} onClick={s.undo} />
      <IconButton icon="redo" label="Redo" title="Redo (⇧⌘Z)" disabled={!s.future.length} onClick={s.redo} />
      <Divider />
      <TextButton icon="split" onClick={s.split} title="Split at playhead (S)">
        {!compact && "Split"}
      </TextButton>
      <TextButton icon="magnet" on={s.snapOn} onClick={() => s.set({ snapOn: !s.snapOn })} title="Snap to grid and clip edges">
        {!compact && "Snap"}
      </TextButton>
      <label className={css.target} title="Target length — shows a marker and warns when you run over">
        <Icon name="target" size={15} />
        {!compact && <span>Length</span>}
        <select
          value={s.target ?? ""}
          onChange={(e) => s.set({ target: e.target.value ? +e.target.value : null })}
          aria-label="Target length"
        >
          {TARGETS.map((t) => (
            <option key={t.label} value={t.value ?? ""}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className={css.right}>
        <IconButton icon="zoomOut" label="Zoom out" title="Zoom out (−, ⌘ scroll)" onClick={() => s.zoomBy(1 / 1.5)} />
        <IconButton icon="zoomIn" label="Zoom in" title="Zoom in (+, ⌘ scroll)" onClick={() => s.zoomBy(1.5)} />
        <TextButton onClick={s.zoomFit} title="Fit session">
          Fit
        </TextButton>
        <Divider />
        {!compact && (
          <IconButton icon="keyboard" label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => s.set({ shortcuts: true })} />
        )}
        <IconButton icon="panelRight" label="Inspector" on={s.inspOpen} onClick={() => s.set({ inspOpen: !s.inspOpen })} />
      </div>
    </div>
  );
}
