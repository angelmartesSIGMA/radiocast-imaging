"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { TEMPLATES } from "@/lib/studio/templates";
import { getEngine } from "@/lib/audio/engine";
import { clock } from "@/lib/studio/clock";
import { fmt, fmtShort } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import { IconButton } from "@/components/ui/controls";
import { Icon, PauseGlyph, PlayGlyph } from "@/components/ui/Icon";
import css from "./Header.module.css";

export function Header() {
  const s = useStudio();
  const wide = s.vw >= 1180;
  const end = s.sessionEnd();

  return (
    <header className={css.header}>
      <div className={css.left}>
        <Image
          className={css.logo}
          src="/radiocast-logo.png"
          alt="Radiocast"
          width={28}
          height={28}
          draggable={false}
          priority
        />
        <div className={css.session}>
          <div className={css.titleRow}>
            <input
              className={css.projectName}
              value={s.projectName}
              onChange={(e) => s.set({ projectName: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label="Session name"
              spellCheck={false}
            />
            <NewMenu />
          </div>
          <div className={css.meta}>
            <SavedBadge />
            <span className={css.metaDot} />
            <span>
              {s.clips.length} clip{s.clips.length === 1 ? "" : "s"}
            </span>
            <span className={css.metaDot} />
            <span>{s.lanes.length} tracks</span>
          </div>
        </div>
      </div>

      <div className={css.transport}>
        <div className={css.buttons}>
          <IconButton icon="rewind" label="Back to start" kbd="Home" round size={15} onClick={() => s.seek(0)} />
          <button
            type="button"
            className={css.play}
            data-playing={s.playing || undefined}
            onClick={s.togglePlay}
            aria-label={s.playing ? "Pause" : "Play"}
            data-tip={s.playing ? "Pause" : "Play"}
            data-kbd="Space"
          >
            {s.playing ? <PauseGlyph size={15} /> : <PlayGlyph size={15} />}
          </button>
          <button
            type="button"
            className={css.rec}
            data-on={s.recording || s.countIn != null || undefined}
            onClick={() => void s.toggleRecord()}
            aria-label={s.recording ? "Stop recording" : "Record"}
            aria-pressed={s.recording}
            data-tip={s.recording ? "Stop recording" : s.countIn != null ? "Cancel count-in" : "Record a voice take"}
            data-kbd="R"
          >
            <span />
          </button>
          <IconButton
            icon="loop"
            label="Loop playback"
            tip={s.target ? "Loop to the target length" : "Loop the session"}
            kbd="L"
            round
            size={15}
            on={s.loop}
            onClick={() => s.set({ loop: !s.loop })}
          />
        </div>
        <span className={css.sep} />
        <div className={css.time}>
          {s.recording ? (
            <span className={css.recLabel} role="status">
              <span className={css.recDot} />
              REC
            </span>
          ) : null}
          <TimeReadout />
          <span className={css.end}>{fmtShort(end)}</span>
        </div>
        <TargetBadge end={end} target={s.target} />
        <Meters />
      </div>

      <div className={css.right}>
        <button
          type="button"
          className={css.ghostBtn}
          onClick={() => void s.exportWav()}
          disabled={s.exporting}
          data-tip="Download a 44.1 kHz stereo WAV of the mix"
          aria-label="Export WAV"
          data-icon-only={!wide || undefined}
        >
          <Icon name="download" size={15} />
          {wide && (s.exporting ? "Rendering…" : "Export")}
        </button>
        <button
          type="button"
          className={css.primaryBtn}
          data-tip="Get a finished, voiced version from a Radiocast producer"
          onClick={() => s.set({ drawer: true, sent: false })}
        >
          {s.vw >= 720 ? "Send to producers" : "Send"}
          <Icon name="send" size={13} />
        </button>
      </div>
    </header>
  );
}

function TimeReadout() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      clock.subscribe((t) => {
        if (ref.current) ref.current.textContent = fmt(t);
      }),
    [],
  );
  return <span ref={ref} className={css.now} aria-label="Playhead position" />;
}

function TargetBadge({ end, target }: { end: number; target: number | null }) {
  if (!target || !end) return null;
  const diff = end - target;
  let tone = "ok";
  let text = "On length";
  if (diff > 0.05) {
    tone = "over";
    text = `+${diff.toFixed(1)}s over`;
  } else if (diff < -0.05) {
    tone = "under";
    text = `${(-diff).toFixed(1)}s left`;
  }
  return (
    <span className={css.target} data-tone={tone} data-tip={`Target length :${String(target).padStart(2, "0")}`}>
      <span className={css.targetDot} />
      {text}
    </span>
  );
}

/** Stereo peak meter with a latching clip light. Runs its own rAF so React never re-renders for it. */
function Meters() {
  const l = useRef<HTMLSpanElement>(null);
  const r = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const clippedRef = useRef(false);

  useEffect(() => {
    let raf = 0;
    const w = (v: number) => Math.max(0, Math.min(100, ((20 * Math.log10(v + 1e-6) + 48) / 48) * 100));
    const paint = () => {
      const [pl, pr] = getEngine().meters();
      for (const [ref, v] of [
        [l, pl],
        [r, pr],
      ] as const) {
        if (!ref.current) continue;
        // The track is a fixed green→amber→red gradient; this cover hides everything above the level.
        ref.current.style.transform = `scaleX(${1 - w(v) / 100})`;
      }
      if (!clippedRef.current && Math.max(pl, pr) > 0.99) {
        clippedRef.current = true;
        setClipped(true);
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={css.meterWrap}>
      <div className={css.meters} data-tip="Output level (L / R)">
        <span className={css.meterTrack}>
          <span ref={l} className={css.meterCover} />
        </span>
        <span className={css.meterTrack}>
          <span ref={r} className={css.meterCover} />
        </span>
      </div>
      <button
        type="button"
        className={css.clipLight}
        data-on={clipped || undefined}
        onClick={() => {
          clippedRef.current = false;
          setClipped(false);
        }}
        aria-label={clipped ? "Output clipped — click to reset" : "No clipping"}
        data-tip={clipped ? "Output clipped — click to reset" : "Clip indicator"}
      />
    </div>
  );
}

function NewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className={css.newWrap} ref={ref}>
      <button
        type="button"
        className={css.newBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-tip="New session from a template"
        aria-label="New session"
      >
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div
          className={css.newMenu}
          role="menu"
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);
            const i = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}
        >
          <p className={css.newHead}>Start from a template</p>
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                useStudio.getState().newSession(t.id);
              }}
            >
              <span className={css.newName}>{t.name}</span>
              <span className={css.newBlurb}>{t.blurb}</span>
            </button>
          ))}
          <p className={css.newFoot}>Your current session can be restored with Undo.</p>
        </div>
      )}
    </div>
  );
}

/** Brief “Saving…” flash after edits, then a steady “Saved”. */
function SavedBadge() {
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useStudio.subscribe((a, b) => {
      if (a.clips === b.clips && a.lanes === b.lanes && a.projectName === b.projectName) return;
      setSaving(true);
      clearTimeout(t);
      t = setTimeout(() => setSaving(false), 700);
    });
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);
  return (
    <span className={css.saved} data-saving={saving || undefined} data-tip="Your session and uploads are saved in this browser">
      <span className={css.savedDot} />
      {saving ? "Saving…" : "Saved"}
    </span>
  );
}
