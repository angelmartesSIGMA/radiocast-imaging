"use client";

import { useEffect, useState } from "react";
import { FX_PRESETS } from "@/lib/audio/fx";
import { laneColor } from "@/lib/studio/colors";
import { fmt, fmtDb, fmtSec, fmtShort } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import { Chip, Kbd, Slider, ToggleRow } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import css from "./Inspector.module.css";

export function Inspector({ floating }: { floating: boolean }) {
  const s = useStudio();
  const sel = s.clips.find((c) => c.id === s.selected);
  const snd = sel && s.sounds.find((x) => x.id === sel.soundId);
  const lane = sel && s.lanes.find((l) => l.id === sel.lane);

  return (
    <aside className={`${css.insp} ${floating ? css.floating : ""}`} aria-label="Inspector">
      {floating && (
        <button type="button" className={css.close} onClick={() => s.set({ inspOpen: false })} aria-label="Close inspector">
          <Icon name="close" size={14} />
        </button>
      )}
      <div className={css.scroll}>
        {sel && snd && lane ? <ClipPanel /> : <SessionPanel />}
      </div>
    </aside>
  );
}

function ClipPanel() {
  const s = useStudio();
  const sel = s.clips.find((c) => c.id === s.selected)!;
  const snd = s.sounds.find((x) => x.id === sel.soundId)!;
  const lane = s.lanes.find((l) => l.id === sel.lane)!;
  const T = laneColor(lane, s.lanes);
  const fadeMax = Math.min(5, +sel.len.toFixed(2));
  const offPct = (sel.offset / snd.dur) * 100;
  const tailPct = Math.max(0, 100 - ((sel.offset + sel.len) / snd.dur) * 100);

  return (
    <>
      <section className={css.section}>
        <p className={css.kicker}>
          <span className={css.kickerDot} style={{ background: T.color }} />
          {lane.label}
        </p>
        <p className={css.title}>{snd.name}</p>
        <p className={css.sub}>
          {snd.kind} · source {fmtSec(snd.dur)}
        </p>
        <div className={css.wave} style={{ "--c": T.color } as React.CSSProperties}>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <path d={snd.path} />
          </svg>
          <div className={css.shade} style={{ left: 0, width: `${offPct}%` }} />
          <div className={css.shade} style={{ right: 0, width: `${tailPct}%` }} />
        </div>
      </section>

      <section className={`${css.section} ${css.stack}`} style={{ "--fill-color": T.color } as React.CSSProperties}>
        <div>
          <p className={css.label}>Track</p>
          <div className={css.chips} role="radiogroup" aria-label="Track">
            {s.lanes.map((l) => (
              <Chip
                key={l.id}
                role="radio"
                on={l.id === sel.lane}
                color={laneColor(l, s.lanes).color}
                onClick={() => {
                  if (l.id === sel.lane) return;
                  s.commit();
                  s.updateClip(sel.id, { lane: l.id });
                }}
              >
                {l.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className={css.stats}>
          <NumberField
            label="Start"
            value={sel.start}
            display={fmt(sel.start)}
            step={s.scale()[1]}
            onCommit={(v) => {
              s.commit();
              s.updateClip(sel.id, { start: Math.max(0, v) });
            }}
          />
          <NumberField
            label="Length"
            value={sel.len}
            display={fmtSec(sel.len)}
            step={0.1}
            onCommit={(v) => {
              const len = Math.max(0.1, Math.min(v, snd.dur - sel.offset));
              s.commit();
              s.updateClip(sel.id, {
                len,
                fadeIn: Math.min(sel.fadeIn, len),
                fadeOut: Math.min(sel.fadeOut, Math.max(0, len - Math.min(sel.fadeIn, len))),
              });
            }}
          />
        </div>
        <Slider
          label="Gain"
          valueLabel={fmtDb(sel.gain)}
          value={sel.gain}
          min={-24}
          max={12}
          step={0.5}
          onCommit={s.commit}
          onChange={(v) => s.updateClip(sel.id, { gain: v })}
        />
        <Slider
          label="Fade in"
          valueLabel={fmtSec(sel.fadeIn)}
          value={sel.fadeIn}
          min={0}
          max={fadeMax}
          step={0.05}
          onCommit={s.commit}
          onChange={(v) => s.updateClip(sel.id, { fadeIn: Math.min(v, sel.len - sel.fadeOut) })}
        />
        <Slider
          label="Fade out"
          valueLabel={fmtSec(sel.fadeOut)}
          value={sel.fadeOut}
          min={0}
          max={fadeMax}
          step={0.05}
          onCommit={s.commit}
          onChange={(v) => s.updateClip(sel.id, { fadeOut: Math.min(v, sel.len - sel.fadeIn) })}
        />
        <ToggleRow
          title="Reverse"
          sub="Play the clip backwards — reverse swells, reverse reverbs"
          checked={!!sel.reverse}
          onToggle={() => s.toggleReverse(sel.id)}
        />
      </section>

      <section className={`${css.section} ${css.stack}`} style={{ "--fill-color": T.color } as React.CSSProperties}>
        <div>
          <p className={css.label}>{lane.label} processing</p>
          <FxPicker laneId={lane.id} value={lane.fx} />
        </div>
      </section>

      <div className={css.actions}>
        <button type="button" onClick={s.split}>
          Split
        </button>
        <button type="button" onClick={() => s.duplicate()}>
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => {
            s.commit();
            s.updateClip(sel.id, { gain: 0, fadeIn: 0, fadeOut: 0 });
          }}
        >
          Reset
        </button>
        <button type="button" className={css.danger} onClick={() => s.removeClip(sel.id)}>
          Delete
        </button>
      </div>
    </>
  );
}

function SessionPanel() {
  const s = useStudio();
  const end = s.sessionEnd();
  const clipCount = `${s.clips.length} clip${s.clips.length === 1 ? "" : "s"}`;

  return (
    <>
      <section className={css.section}>
        <p className={css.kicker}>Session</p>
        <p className={css.title}>{s.projectName || "Untitled session"}</p>
        <p className={css.sub}>
          {fmtShort(end)} · {clipCount} · {s.lanes.length} tracks
        </p>
        {s.target != null && end > 0 && <LengthBar end={end} target={s.target} />}
      </section>

      <section className={`${css.section} ${css.stack}`}>
        <p className={css.group}>Mix</p>
        <Slider
          label="Master"
          valueLabel={fmtDb(s.master)}
          value={s.master}
          min={-12}
          max={6}
          step={0.5}
          onChange={(v) => {
            s.set({ master: v });
            s.restartIfPlaying();
          }}
        />
        <ToggleRow
          title="Auto-duck beds"
          sub="Music dips while the voice talks"
          checked={s.duck}
          onToggle={() => {
            s.set({ duck: !s.duck });
            s.restartIfPlaying();
          }}
        />
        <Slider
          label="Duck depth"
          valueLabel={`${s.duckDb} dB`}
          value={s.duckDb}
          min={-24}
          max={-3}
          step={1}
          style={{ opacity: s.duck ? 1 : 0.4 }}
          onChange={(v) => {
            s.set({ duckDb: v });
            s.restartIfPlaying();
          }}
        />
        <ToggleRow
          title="Safety limiter"
          sub="Catches peaks so exports don’t clip"
          checked={s.limiter}
          onToggle={() => {
            s.set({ limiter: !s.limiter });
            s.restartIfPlaying();
          }}
        />
      </section>

      <LoudnessPanel />

      <section className={`${css.section} ${css.stack}`}>
        <p className={css.group}>Recording</p>
        <ToggleRow
          title="Count-in"
          sub="3-2-1 beeps before the take starts"
          checked={s.countInOn}
          onToggle={() => s.set({ countInOn: !s.countInOn })}
        />
        <button type="button" className={css.recBtn} onClick={() => void s.toggleRecord()}>
          <span className={css.recDot} />
          {s.recording ? "Stop recording" : "Record a voice take"}
          <Kbd>R</Kbd>
        </button>
      </section>


    </>
  );
}

function LengthBar({ end, target }: { end: number; target: number }) {
  const max = Math.max(end, target) * 1.05;
  const over = end > target + 0.05;
  return (
    <div className={css.lengthBar} title={`Session ${fmtSec(end)} · target ${fmtSec(target)}`}>
      <div className={css.lengthTrack}>
        <span className={css.lengthFill} data-over={over || undefined} style={{ width: `${(end / max) * 100}%` }} />
        <span className={css.lengthMark} style={{ left: `${(target / max) * 100}%` }} />
      </div>
      <div className={css.lengthLegend}>
        <span>{fmtSec(end)}</span>
        <span>target :{String(target).padStart(2, "0")}</span>
      </div>
    </div>
  );
}

/** Click-to-edit number with − / + nudge buttons. Accepts seconds (“2.5”) or m:ss.d (“0:02.5”). */
function NumberField({
  label,
  value,
  display,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  display: string;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!editing) setText(value.toFixed(2));
  }, [value, editing]);

  const parse = (t: string) => {
    const m = t.trim().match(/^(?:(\d+):)?(\d+(?:\.\d+)?)s?$/);
    if (!m) return null;
    return (m[1] ? +m[1] * 60 : 0) + +m[2];
  };
  const commit = () => {
    const v = parse(text);
    setEditing(false);
    if (v != null && Math.abs(v - value) > 0.0005) onCommit(v);
  };

  return (
    <div className={css.stat}>
      <p>{label}</p>
      <div className={css.numRow}>
        {editing ? (
          <input
            className={`mono ${css.numInput}`}
            value={text}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
              }
            }}
            aria-label={`${label} in seconds`}
          />
        ) : (
          <button
            type="button"
            className={`mono ${css.numValue}`}
            onClick={() => setEditing(true)}
            data-tip={`Click to type a ${label.toLowerCase()}`}
          >
            {display}
          </button>
        )}
        <span className={css.nudge}>
          <button type="button" aria-label={`Decrease ${label}`} onClick={() => onCommit(+(value - step).toFixed(3))}>
            −
          </button>
          <button type="button" aria-label={`Increase ${label}`} onClick={() => onCommit(+(value + step).toFixed(3))}>
            +
          </button>
        </span>
      </div>
    </div>
  );
}

const LOUD_TARGETS: { value: number | null; label: string; note: string }[] = [
  { value: null, label: "Off", note: "Export as mixed" },
  { value: -23, label: "−23", note: "EBU R128 broadcast" },
  { value: -16, label: "−16", note: "Podcasts" },
  { value: -14, label: "−14", note: "Streaming" },
  { value: -10, label: "−10", note: "Hot imaging" },
];

function LoudnessPanel() {
  const s = useStudio();
  const L = s.loudness;
  const note = LOUD_TARGETS.find((t) => t.value === s.loudTarget)?.note;
  // Meter scale: −30 … −6 LUFS
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v + 30) / 24) * 100))}%`;
  return (
    <section className={`${css.section} ${css.stack}`}>
      <div className={css.groupRow}>
        <p className={css.group}>Loudness</p>
        <button
          type="button"
          className={css.linkBtn}
          onClick={() => void s.measureLoudness()}
          disabled={s.measuring || !s.clips.length}
        >
          {s.measuring ? "Measuring…" : "Measure"}
        </button>
      </div>
      <div>
        <p className={css.label}>Export target (LUFS)</p>
        <div className={css.seg} role="radiogroup" aria-label="Loudness target">
          {LOUD_TARGETS.map((t) => (
            <button
              key={t.label}
              type="button"
              role="radio"
              aria-checked={s.loudTarget === t.value}
              onClick={() => s.set({ loudTarget: t.value })}
              data-tip={t.note}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className={css.hint}>{note}{s.loudTarget != null ? " · limited to −1 dBFS" : ""}</p>
      </div>
      <div className={css.loud}>
        <div className={css.loudTrack}>
          {L && Number.isFinite(L.lufs) && <span className={css.loudFill} style={{ width: pos(L.lufs) }} />}
          {s.loudTarget != null && <span className={css.loudMark} style={{ left: pos(s.loudTarget) }} />}
        </div>
        {L && <p className={css.hint}>{L.source === "export" ? "Last export (after normalising)" : "Current mix, before export processing"}</p>}
        <div className={css.loudRead}>
          <span>
            <b className="mono">{L && Number.isFinite(L.lufs) ? L.lufs.toFixed(1) : "—"}</b> LUFS
          </span>
          <span>
            peak <b className="mono">{L ? L.peakDb.toFixed(1) : "—"}</b> dBFS
          </span>
        </div>
      </div>
    </section>
  );
}

function FxPicker({ laneId, value }: { laneId: string; value?: string }) {
  const s = useStudio();
  const cur = value ?? "none";
  return (
    <div className={css.fxList} role="radiogroup" aria-label="Track processing">
      {FX_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={cur === p.id}
          className={css.fxItem}
          onClick={() => {
            if (cur === p.id) return;
            s.commit();
            s.setLane(laneId, { fx: p.id === "none" ? undefined : p.id });
          }}
        >
          <span className={css.fxName}>{p.label}</span>
          <span className={css.fxBlurb}>{p.blurb}</span>
        </button>
      ))}
    </div>
  );
}
