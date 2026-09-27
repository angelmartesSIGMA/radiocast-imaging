"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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
          aria-label="Session name"
          spellCheck={false}
        />
      </div>

      <div className={css.transport}>
        <IconButton icon="rewind" label="Back to start" title="Back to start (Home)" round onClick={() => s.seek(0)} />
        <button
          type="button"
          className={css.play}
          onClick={s.togglePlay}
          aria-label={s.playing ? "Pause" : "Play"}
          title="Play / pause (Space)"
        >
          {s.playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button
          type="button"
          className={css.rec}
          data-on={s.recording || undefined}
          onClick={() => void s.toggleRecord()}
          aria-label={s.recording ? "Stop recording" : "Record"}
          aria-pressed={s.recording}
          title="Record a voice take over the mix (R)"
        >
          <span />
        </button>
        <IconButton
          icon="loop"
          label="Loop playback"
          title={s.target ? `Loop to target length (L)` : "Loop session (L)"}
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
          title="Export WAV"
          aria-label="Export WAV"
          style={{ padding: wide ? "0 16px" : 0 }}
        >
          <Icon name="download" size={15} />
          {wide && (s.exporting ? "Rendering…" : "Export WAV")}
        </button>
        <button type="button" className={css.primaryBtn} onClick={() => s.set({ drawer: true, sent: false })}>
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
      <div className={css.meters} title="Output level">
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
        title={clipped ? "Output clipped — click to reset" : "Clip indicator"}
      />
    </div>
  );
}
