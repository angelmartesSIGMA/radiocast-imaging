"use client";

import { TARGETS } from "@/lib/studio/constants";
import { useStudio } from "@/lib/studio/store";
import { Divider, IconButton, TextButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import css from "./Toolbar.module.css";

export function Toolbar() {
  const s = useStudio();
  const compact = s.vw < 760;
  const hasSel = !!s.selected;

  return (
    <div className={css.bar} role="toolbar" aria-label="Editing tools">
      <IconButton
        icon="panelLeft"
        label="Sound library"
        tip={s.libOpen ? "Hide library" : "Show library"}
        on={s.libOpen}
        onClick={() => s.set({ libOpen: !s.libOpen })}
      />
      <Divider />
      <IconButton icon="undo" label="Undo" kbd="⌘Z" disabled={!s.past.length} onClick={s.undo} />
      <IconButton icon="redo" label="Redo" kbd="⇧⌘Z" disabled={!s.future.length} onClick={s.redo} />
      <Divider />
      <TextButton icon="split" onClick={s.split} tip="Split at playhead" kbd="S">
        {!compact && "Split"}
      </TextButton>
      {hasSel && (
        <>
          <IconButton icon="copy" label="Duplicate clip" kbd="⌘D" onClick={() => s.duplicate()} />
          <IconButton icon="trash" label="Delete clip" kbd="⌫" onClick={() => s.selected && s.removeClip(s.selected)} />
        </>
      )}
      <TextButton
        icon="magnet"
        on={s.snapOn}
        onClick={() => s.set({ snapOn: !s.snapOn })}
        tip={s.snapOn ? "Snapping on — clips stick to the grid and to each other" : "Snapping off — free placement"}
      >
        {!compact && "Snap"}
      </TextButton>
      <label className={css.target} data-tip="Target length — marks the timeline and warns when you run over" data-tour="target">
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
        <button type="button" className={css.cmd} onClick={() => s.set({ palette: {} })} data-tip="Search sounds and actions" data-kbd="⌘K">
          <Icon name="search" size={14} />
          {!compact && <span>Search or run…</span>}
          {!compact && <kbd>⌘K</kbd>}
        </button>
        <Divider />
        <IconButton icon="zoomOut" label="Zoom out" kbd="−" onClick={() => s.zoomBy(1 / 1.5)} />
        <IconButton icon="zoomIn" label="Zoom in" kbd="+" onClick={() => s.zoomBy(1.5)} />
        <TextButton onClick={s.zoomFit} tip="Fit the whole session in view">
          Fit
        </TextButton>
        <Divider />
        {!compact && <IconButton icon="keyboard" label="Help and shortcuts" kbd="?" onClick={() => s.set({ shortcuts: true })} />}
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
