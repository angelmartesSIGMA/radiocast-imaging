"use client";

import { memo, useEffect, useRef, useState } from "react";
import { getEngine } from "@/lib/audio/engine";
import { clock, dom } from "@/lib/studio/clock";
import { HEADER_W, TRACK_TYPES } from "@/lib/studio/constants";
import { fmt, fmtDb, fmtSec, fmtShort } from "@/lib/studio/format";
import { FX_PRESETS } from "@/lib/audio/fx";
import { laneColor } from "@/lib/studio/colors";
import { useStudio } from "@/lib/studio/store";
import { TEMPLATES } from "@/lib/studio/templates";
import type { Clip, ClipHandle, Lane, Sound } from "@/lib/studio/types";
import { Icon } from "@/components/ui/Icon";
import css from "./Timeline.module.css";

const trackAt = (x: number, y: number) => {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-track]")?.dataset.track ?? null;
};

export function Timeline() {
  const s = useStudio();
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverTagRef = useRef<HTMLSpanElement>(null);
  const ppsSet = useRef(false);

  const pps = s.pps;
  const total = s.total();
  const [major, minor] = s.scale();
  const trackW = total * pps;
  const anySolo = s.lanes.some((l) => l.solo);

  // register scroll element, wheel zoom, and initial fit
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    dom.scroll = sc;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      useStudio.getState().zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX);
    };
    sc.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => {
      const w = sc.clientWidth;
      const st = useStudio.getState();
      if (!ppsSet.current && w > 300) {
        ppsSet.current = true;
        st.set({ viewW: w, pps: Math.max(12, (w - HEADER_W - 40) / 22) });
      } else st.set({ viewW: w });
    });
    ro.observe(sc);
    return () => {
      sc.removeEventListener("wheel", onWheel);
      ro.disconnect();
      dom.scroll = null;
    };
  }, []);

  // paint playhead + follow while playing
  useEffect(
    () =>
      clock.subscribe((t) => {
        const st = useStudio.getState();
        const x = t * st.pps;
        if (playheadRef.current) playheadRef.current.style.transform = `translateX(${HEADER_W + x}px)`;
        if (headRef.current) headRef.current.style.transform = `translateX(${x}px)`;
        // Light up clips under the playhead while playing.
        const inner = scrollRef.current;
        if (inner) {
          for (const c of st.clips) {
            const el = inner.querySelector<HTMLElement>(`[data-clip-id="${c.id}"]`);
            if (!el) continue;
            const live = st.playing && t >= c.start && t < c.start + c.len;
            if (live !== (el.dataset.live === "1")) el.dataset.live = live ? "1" : "";
          }
        }
        const sc = scrollRef.current;
        if (sc && st.playing) {
          const px = HEADER_W + x;
          if (px > sc.scrollLeft + sc.clientWidth - 48) sc.scrollLeft = px - HEADER_W - 48;
          else if (px < sc.scrollLeft + HEADER_W) sc.scrollLeft = Math.max(0, px - HEADER_W - 48);
        }
      }),
    [],
  );
  useEffect(() => clock.set(clock.t), [pps]);

  // Per-track level meters in the track headers.
  useEffect(() => {
    let raf = 0;
    const engine = getEngine();
    const paint = () => {
      const root = scrollRef.current;
      if (root) {
        for (const el of root.querySelectorAll<HTMLElement>("[data-lane-meter]")) {
          const v = engine.laneLevel(el.dataset.laneMeter!);
          const pct = Math.max(0, Math.min(1, (20 * Math.log10(v + 1e-6) + 48) / 48));
          el.style.transform = `scaleY(${pct})`;
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, []);

  const laneH = s.laneH;
  const beat = 60 / s.bpm;
  const tickLabel = (t: number) => {
    if (s.gridMode === "beats") {
      const beats = Math.round(t / beat);
      const bar = Math.floor(beats / 4) + 1;
      const b = (beats % 4) + 1;
      return major < 4 * beat - 1e-6 ? `${bar}.${b}` : `${bar}`;
    }
    return major < 1 ? t.toFixed(major < 0.5 ? 2 : 1) : fmtShort(t);
  };

  const ticks: { x: number; label: string }[] = [];
  for (let t = 0; t <= total; t += major)
    ticks.push({ x: t * pps, label: tickLabel(t) });

  const onRulerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const st = useStudio.getState;
    const was = st().playing;
    if (was) st().stop();
    const at = (x: number) => clock.set(Math.max(0, (x - el.getBoundingClientRect().left) / st().pps));
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (was) st().play();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onHover = (e: React.PointerEvent<HTMLDivElement>) => {
    const line = hoverRef.current;
    const tagEl = hoverTagRef.current;
    if (!line || !tagEl) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left - HEADER_W;
    const sc = scrollRef.current;
    const visible = x >= 0 && (!sc || e.clientX - sc.getBoundingClientRect().left > HEADER_W) && !useStudio.getState().drag;
    line.style.opacity = visible ? "1" : "0";
    tagEl.style.opacity = visible ? "1" : "0";
    if (!visible) return;
    line.style.transform = `translateX(${HEADER_W + x}px)`;
    tagEl.style.transform = `translateX(${x}px)`;
    const st = useStudio.getState();
    if (st.gridMode === "beats") {
      const beats = x / pps / (60 / st.bpm);
      tagEl.textContent = `${Math.floor(beats / 4) + 1}.${Math.floor(beats % 4) + 1}`;
    } else tagEl.textContent = fmt(x / pps);
  };
  const hideHover = () => {
    if (hoverRef.current) hoverRef.current.style.opacity = "0";
    if (hoverTagRef.current) hoverTagRef.current.style.opacity = "0";
  };

  return (
    <div className={css.frame}>
      <div ref={scrollRef} className={css.scroll}>
        <div
          className={css.inner}
          style={{ width: HEADER_W + trackW, "--lane-h": `${laneH}px` } as React.CSSProperties}
          onPointerMove={onHover}
          onPointerLeave={hideHover}
        >
          {/* ruler */}
          <div className={css.rulerRow}>
            <div className={css.rulerCorner}>Tracks</div>
            <div
              className={css.ruler}
              onPointerDown={onRulerDown}
              style={{ width: trackW, backgroundSize: `${minor * pps}px 7px` }}
              aria-label="Timeline ruler — click or drag to move the playhead"
            >
              {ticks.map((tk) => (
                <span key={tk.x} className={css.tick} style={{ left: tk.x }}>
                  {tk.label}
                </span>
              ))}
              {s.target && (
                <span className={css.targetFlag} style={{ left: s.target * pps }}>
                  :{String(s.target).padStart(2, "0")}
                </span>
              )}
              <span ref={hoverTagRef} className={css.hoverTag} aria-hidden="true" />
              <span ref={headRef} className={css.head}>
                <span />
              </span>
            </div>
          </div>

          {s.lanes.map((l) => (
            <LaneRow key={l.id} lane={l} audible={anySolo ? l.solo : !l.mute} trackW={trackW} majorPx={major * pps} />
          ))}

          {/* add track row */}
          <div className={css.addRow}>
            <div className={css.addCell}>
              {(["voice", "bed", "fx"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={css.addBtn}
                  onClick={() => s.addLane(t)}
                  data-tip={`Add a ${TRACK_TYPES[t].label.toLowerCase()} track`}
                >
                  <Icon name="plus" size={11} strokeWidth={2.4} />
                  {t === "voice" ? "Voice" : t === "bed" ? "Bed" : "FX"}
                </button>
              ))}
            </div>
          </div>

          {/* overlays: target region, playhead, snap line */}
          <div className={css.overlay}>
            {s.target && (
              <div className={css.beyond} style={{ left: HEADER_W + s.target * pps }}>
                <span className={css.targetLine} />
              </div>
            )}
            <div ref={hoverRef} className={css.hoverLine} />
            <div ref={playheadRef} className={css.playhead} />
            {s.snapT != null && <div className={css.snapLine} style={{ left: HEADER_W + s.snapT * pps }} />}
          </div>

          {s.ready && !s.clips.length && <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const st = useStudio.getState;
  return (
    <div className={css.emptyState}>
      <p className="eyebrow">Empty session</p>
      <p className={css.emptyTitle}>Start from a template, or build your own</p>
      <div className={css.tplGrid}>
        {TEMPLATES.filter((t) => t.clips.length).map((t) => (
          <button key={t.id} type="button" className={css.tpl} onClick={() => st().newSession(t.id)}>
            <span className={css.tplName}>{t.name}</span>
            <span className={css.tplBlurb}>{t.blurb}</span>
          </button>
        ))}
      </div>
      <p className={css.emptySub}>
        Or drag sounds from the library, drop your own files anywhere, double-click a track to search, or press <b>R</b> to
        record a voice take.
      </p>
    </div>
  );
}

const LaneRow = memo(function LaneRow({
  lane,
  audible,
  trackW,
  majorPx,
}: {
  lane: Lane;
  audible: boolean;
  trackW: number;
  majorPx: number;
}) {
  const T = TRACK_TYPES[lane.type];
  const allLanes = useStudio((s) => s.lanes);
  const LC = laneColor(lane, allLanes);
  const clips = useStudio((s) => s.clips).filter((c) => c.lane === lane.id);
  const sounds = useStudio((s) => s.sounds);
  const selected = useStudio((s) => s.selected);
  const activeClip = useStudio((s) => s.activeClip);
  const tag = useStudio((s) => s.tag);
  const ghost = useStudio((s) => (s.ghost?.lane === lane.id ? s.ghost : null));
  const dragging = useStudio((s) => !!s.drag);
  const fileMark = useStudio((s) => (s.fileMark?.lane === lane.id ? s.fileMark : null));
  const recHere = useStudio((s) => s.recording && s.recLane === lane.id);
  const recAt = useStudio((s) => s.recAt);
  const pps = useStudio((s) => s.pps);
  const renaming = useStudio((s) => s.renaming === lane.id);
  const siblings = useStudio((s) => s.lanes.filter((x) => x.type === lane.type).length);
  const compact = useStudio((s) => s.laneH < 62);
  const st = useStudio.getState;

  const act = clips.find((c) => c.id === activeClip);
  const tagX = ghost ? ghost.start * pps : act ? act.start * pps : 0;
  const showTag = (ghost && dragging) || (act && tag);

  return (
    <div
      className={css.lane}
      style={{ "--c": LC.color } as React.CSSProperties}
      data-muted={!audible || undefined}
      data-compact={compact || undefined}
    >
      <div className={css.laneHead}>
        <div
          className={css.resize}
          onPointerDown={startResize}
          onDoubleClick={() => st().set({ laneH: 68 })}
          data-tip="Drag to resize tracks · double-click to reset"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize tracks"
        />
        <span className={css.laneBar} />
        <span className={css.laneMeter} aria-hidden="true">
          <span data-lane-meter={lane.id} />
        </span>
        <div className={css.laneTitle}>
          <span className={css.laneIcon}>
            <Icon name={lane.type === "voice" ? "mic" : lane.type === "bed" ? "music" : "bolt"} size={12} />
          </span>
          {renaming ? (
            <input
              className={css.rename}
              defaultValue={lane.label}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v && v !== lane.label) {
                  st().commit();
                  st().setLane(lane.id, { label: v }, false);
                }
                st().set({ renaming: null });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = lane.label;
                  e.currentTarget.blur();
                }
              }}
              aria-label="Track name"
            />
          ) : (
            <span className={css.laneName} onDoubleClick={() => st().set({ renaming: lane.id })} data-tip="Double-click to rename">
              {lane.label}
            </span>
          )}
          <FxSelect laneId={lane.id} value={lane.fx} />
          {siblings > 1 && (
            <button
              type="button"
              className={css.laneRemove}
              onClick={() => st().removeLane(lane.id)}
              aria-label={`Remove ${lane.label}`}
              data-tip={clips.length ? "Remove track and its clips" : "Remove track"}
            >
              <Icon name="close" size={11} strokeWidth={2.4} />
            </button>
          )}
        </div>
        <div className={css.laneCtrls}>
          <button
            type="button"
            className={css.ms}
            data-on={lane.mute ? "mute" : undefined}
            aria-pressed={lane.mute}
            onClick={() => st().setLane(lane.id, { mute: !lane.mute })}
            data-tip={lane.mute ? "Unmute" : "Mute"}
          >
            M
          </button>
          <button
            type="button"
            className={css.ms}
            data-on={lane.solo ? "solo" : undefined}
            aria-pressed={lane.solo}
            onClick={() => st().setLane(lane.id, { solo: !lane.solo })}
            data-tip={lane.solo ? "Unsolo" : "Solo — hear only this track"}
          >
            S
          </button>
          <input
            type="range"
            min={-24}
            max={6}
            step={0.5}
            value={lane.gain}
            onPointerDown={() => st().commit()}
            onChange={(e) => st().setLane(lane.id, { gain: +e.target.value })}
            onDoubleClick={() => st().setLane(lane.id, { gain: 0 })}
            data-tip={`Track volume ${fmtDb(lane.gain)} · double-click to reset`}
            aria-label={`${lane.label} volume`}
            style={{ "--fill": `${((lane.gain + 24) / 30) * 100}%`, "--fill-color": "var(--c)" } as React.CSSProperties}
          />
        </div>
      </div>

      <div
        className={css.track}
        data-track={lane.id}
        style={{
          width: trackW,
          backgroundSize: `${majorPx}px 100%`,
          backgroundColor: ghost || fileMark ? LC.wash : undefined,
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          const r = e.currentTarget.getBoundingClientRect();
          const at = st().snapTime((e.clientX - r.left) / pps, 0, null).t;
          const fm = st().fileMark;
          if (!fm || fm.lane !== lane.id || Math.abs(fm.at - at) > 0.001) st().set({ fileMark: { lane: lane.id, at } });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node) && st().fileMark?.lane === lane.id) st().set({ fileMark: null });
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          const at = st().snapTime((e.clientX - r.left) / pps, 0, null).t;
          window.dispatchEvent(new Event("studio:filedrop-reset"));
          void st().importFiles(Array.from(e.dataTransfer.files), { lane: lane.id, at });
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-clip]")) return;
          const r = e.currentTarget.getBoundingClientRect();
          st().set({ palette: { lane: lane.id, at: st().snapTime((e.clientX - r.left) / pps, 0, null).t } });
        }}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("[data-clip]")) return;
          st().set({ selected: null, menu: null });
          const r = e.currentTarget.getBoundingClientRect();
          st().seek((e.clientX - r.left) / pps);
        }}
      >
        {!clips.length && !ghost && !recHere && (
          <div className={css.hint}>
            <span>{T.hint}</span>
            <span className={css.hintSub}>· double-click to search</span>
          </div>
        )}

        {clips.map((c) => {
          const snd = sounds.find((x) => x.id === c.soundId);
          return snd ? (
            <ClipView
              key={c.id}
              clip={c}
              sound={snd}
              lane={lane}
              audible={audible}
              selected={selected === c.id}
              active={activeClip === c.id}
              pps={pps}
            />
          ) : null;
        })}

        {ghost && (
          <div
            className={css.ghost}
            style={{ left: ghost.start * pps, width: Math.max(8, ghost.len * pps) }}
          />
        )}
        {fileMark && (
          <div className={css.ghost} style={{ left: fileMark.at * pps, width: 120 }}>
            <span className={css.ghostLabel}>Drop here</span>
          </div>
        )}
        {recHere && <RecordingBlock at={recAt} pps={pps} />}
        {showTag && (
          <div className={css.tag} style={{ left: tagX }}>
            {ghost ? fmt(ghost.start) : tag}
          </div>
        )}
      </div>
    </div>
  );
});

function RecordingBlock({ at, pps }: { at: number; pps: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      clock.subscribe((t) => {
        if (ref.current) ref.current.style.width = `${Math.max(4, (t - at) * pps)}px`;
      }),
    [at, pps],
  );
  return (
    <div ref={ref} className={css.recBlock} style={{ left: at * pps }}>
      Recording
    </div>
  );
}

function ClipView({
  clip: c,
  sound: snd,
  lane,
  audible,
  selected,
  active,
  pps,
}: {
  clip: Clip;
  sound: Sound;
  lane: Lane;
  audible: boolean;
  selected: boolean;
  active: boolean;
  pps: number;
}) {
  const [hover, setHover] = useState(false);
  const w = Math.max(8, c.len * pps);
  const fi = (c.fadeIn / c.len) * 100;
  const fo = (c.fadeOut / c.len) * 100;
  const fiX = Math.max(12, Math.min(w - 12, c.fadeIn * pps));
  const foX = Math.max(12, Math.min(w - 12, w - c.fadeOut * pps));

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const st = useStudio.getState;
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    const mode = (h?.dataset.handle ?? "move") as ClipHandle;
    const x0 = e.clientX;
    const c0 = { ...c };
    let moved = false;
    st().set({ selected: c.id, menu: null });
    document.body.style.cursor = mode === "move" ? "grabbing" : "ew-resize";

    const move = (ev: PointerEvent) => {
      const p = st().pps;
      const dt = (ev.clientX - x0) / p;
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        moved = true;
        st().commit();
      }
      let patch: Partial<Clip> = {};
      let snapT: number | null = null;
      let tag = "";
      if (mode === "move") {
        const r = st().snapTime(c0.start + dt, c0.len, c.id);
        snapT = r.snapT;
        patch.start = r.t;
        const tr = trackAt(ev.clientX, ev.clientY);
        if (tr) patch.lane = tr;
        tag = fmt(r.t);
      } else if (mode === "trimL") {
        const r = st().snapTime(c0.start + dt, 0, c.id);
        const ns = Math.max(c0.start - c0.offset, Math.min(r.t, c0.start + c0.len - 0.1));
        snapT = ns === r.t ? r.snapT : null;
        const d = ns - c0.start;
        patch = { start: ns, offset: c0.offset + d, len: c0.len - d, fadeIn: Math.min(c0.fadeIn, c0.len - d) };
        tag = fmtSec(patch.len!);
      } else if (mode === "trimR") {
        const r = st().snapTime(c0.start + c0.len + dt, 0, c.id);
        const ne = Math.max(c0.start + 0.1, Math.min(r.t, c0.start + (snd.dur - c0.offset)));
        snapT = ne === r.t ? r.snapT : null;
        patch = { len: ne - c0.start, fadeOut: Math.min(c0.fadeOut, ne - c0.start) };
        tag = fmtSec(patch.len!);
      } else if (mode === "fadeIn") {
        patch.fadeIn = Math.max(0, Math.min(c0.len - c0.fadeOut, c0.fadeIn + dt));
        tag = `Fade in ${fmtSec(patch.fadeIn)}`;
      } else if (mode === "fadeOut") {
        patch.fadeOut = Math.max(0, Math.min(c0.len - c0.fadeIn, c0.fadeOut - dt));
        tag = `Fade out ${fmtSec(patch.fadeOut)}`;
      }
      st().updateClip(c.id, patch, false);
      st().set({ snapT, tag, activeClip: c.id });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      st().set({ snapT: null, tag: null, activeClip: null });
      if (moved) st().restartIfPlaying();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      data-clip
      data-clip-id={c.id}
      className={css.clip}
      data-selected={selected || undefined}
      data-active={active || undefined}
      onPointerDown={onPointerDown}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        useStudio.getState().set({ selected: c.id, menu: { clipId: c.id, x: e.clientX, y: e.clientY } });
      }}
      onDoubleClick={() => useStudio.getState().set({ inspOpen: true })}
      role="button"
      tabIndex={-1}
      aria-label={`${snd.name}, ${fmt(c.start)}, ${fmtSec(c.len)}`}
      style={{
        left: c.start * pps,
        width: w,
        opacity: audible ? 1 : 0.35,
      }}
    >
      {w >= 40 && (
        <div className={css.clipHead}>
          {c.reverse && (
            <span className={css.revBadge} aria-label="Reversed">
              REV
            </span>
          )}
          <span className={css.clipName}>{snd.name}</span>
          {w > 170 && c.gain !== 0 && <span className={css.clipMeta}>{fmtDb(c.gain)}</span>}
          {w > 120 && <span className={css.clipMeta}>{fmtSec(c.len)}</span>}
        </div>
      )}
      <svg
        className={css.clipWave}
        data-reverse={c.reverse || undefined}
        viewBox={`${(((c.reverse ? snd.dur - c.offset - c.len : c.offset) / snd.dur) * 100).toFixed(3)} 0 ${((c.len / snd.dur) * 100).toFixed(3)} 40`}
        preserveAspectRatio="none"
      >
        <path d={snd.path} />
      </svg>
      <svg className={css.clipFades} viewBox="0 0 100 100" preserveAspectRatio="none">
        {fi > 0 && (
          <>
            <polygon points={`0,0 ${fi},0 0,100`} fill="rgba(0,0,0,0.42)" />
            <polyline points={`0,100 ${fi},0`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        )}
        {fo > 0 && (
          <>
            <polygon points={`100,0 ${100 - fo},0 100,100`} fill="rgba(0,0,0,0.42)" />
            <polyline points={`${100 - fo},0 100,100`} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div data-handle="trimL" className={`${css.trim} ${css.trimL}`} data-tip="Drag to trim the start" />
      <div data-handle="trimR" className={`${css.trim} ${css.trimR}`} data-tip="Drag to trim the end" />
      {(selected || hover) && w > 36 && (
        <>
          <div data-handle="fadeIn" className={css.fadeKnob} style={{ left: fiX }} data-tip="Drag to fade in" />
          <div data-handle="fadeOut" className={css.fadeKnob} style={{ left: foX }} data-tip="Drag to fade out" />
        </>
      )}
    </div>
  );
}

/** Drag any track's bottom edge to resize every track. */
function startResize(e: React.PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  const st = useStudio.getState;
  const y0 = e.clientY;
  const h0 = st().laneH;
  document.body.style.cursor = "row-resize";
  const move = (ev: PointerEvent) => st().set({ laneH: Math.round(Math.max(44, Math.min(180, h0 + ev.clientY - y0))) });
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    document.body.style.cursor = "";
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function FxSelect({ laneId, value }: { laneId: string; value?: string }) {
  const on = !!value && value !== "none";
  return (
    <label className={css.fxPill} data-on={on || undefined} data-tip="Track processing">
      <span>{on ? FX_PRESETS.find((p) => p.id === value)?.label : "FX"}</span>
      <select
        value={value ?? "none"}
        onChange={(e) => {
          const st = useStudio.getState();
          st.commit();
          st.setLane(laneId, { fx: e.target.value === "none" ? undefined : e.target.value });
        }}
        aria-label="Track processing"
      >
        {FX_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
