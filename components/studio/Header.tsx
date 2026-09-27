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
        <div className={css.brand}>
          <Image src="/radiocast-logo.png" alt="Radiocast" width={32} height={32} draggable={false} priority />
          {wide && (
            <div className={css.brandText}>
              <p className={css.brandName}>Radiocast</p>
              <p className={css.brandSub}>Imaging</p>
            </div>
          )}
        </div>
        <span className={css.vr} />
        <input
          className={css.projectName}
          value={s.projectName}
          onChange={(e) => s.set({ projectName: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Session name"
          data-tip="Rename session"
          spellCheck={false}
        />
        <NewMenu />
        {s.vw >= 1360 && <SavedBadge />}
      </div>

      <div className={css.transport} data-tour="transport">
        <IconButton icon="rewind" label="Back to start" kbd="Home" round onClick={() => s.seek(0)} />
        <button
          type="button"
          className={css.play}
          onClick={s.togglePlay}
          aria-label={s.playing ? "Pause" : "Play"}
          data-tip={s.playing ? "Pause" : "Play"}
          data-kbd="Space"
        >
          {s.playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button
          type="button"
          className={css.rec}
          data-on={s.recording || s.countIn != null || undefined}
          onClick={() => void s.toggleRecord()}
          aria-label={s.recording ? "Stop recording" : "Record"}
          aria-pressed={s.recording}
          data-tip={s.recording ? "Stop recording" : s.countIn != null ? "Cancel count-in" : "Record a voice take over the mix"}
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
          on={s.loop}
          onClick={() => s.set({ loop: !s.loop })}
        />
        <div className={css.clock}>
          <div className={css.time}>
            <TimeReadout />
            <span className={css.end}>/ {fmtShort(end)}</span>
          </div>
          <TargetBadge end={end} target={s.target} />
          <Meters />
        </div>
        {s.recording && (
          <span className={css.recBadge} role="status">
            <span className={css.recDot} />
            Recording
          </span>
        )}
      </div>

      <div className={css.right}>
        <button
          type="button"
          className={css.ghostBtn}
          onClick={() => void s.exportWav()}
          disabled={s.exporting}
          data-tip="Download a 44.1 kHz stereo WAV of the mix"
          aria-label="Export WAV"
          style={{ padding: wide ? "0 16px" : 0 }}
        >
          <Icon name="download" size={15} />
          {wide && (s.exporting ? "Rendering…" : "Export WAV")}
        </button>
        <button
          type="button"
          className={css.primaryBtn}
          data-tour="send"
          data-tip="Get a finished, voiced version from a Radiocast producer"
          onClick={() => s.set({ drawer: true, sent: false })}
        >
          <Icon name="send" size={14} />
          {s.vw >= 720 ? "Send to producers" : "Send"}
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
    <span className={css.target} data-tone={tone} title={`Target length :${String(target).padStart(2, "0")}`}>
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
        ref.current.style.width = `${w(v)}%`;
        ref.current.style.background = v > 0.97 ? "var(--red)" : v > 0.7 ? "var(--amber)" : "var(--violet)";
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
          <span ref={l} className={css.meterFill} />
        </span>
        <span className={css.meterTrack}>
          <span ref={r} className={css.meterFill} />
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
        data-tip="Start a new session from a template"
      >
        New
        <Icon name="chevronDown" size={13} />
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
      <Icon name={saving ? "cloud" : "check"} size={12} />
      {saving ? "Saving…" : "Saved"}
    </span>
  );
}
