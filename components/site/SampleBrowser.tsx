"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MediaItem } from "@/lib/db/media";
import { typeColor } from "@/lib/studio/colors";
import { SAMPLE_PREFIX } from "@/lib/db/types";
import { Icon, PauseGlyph, PlayGlyph } from "@/components/ui/Icon";
import s from "./site.module.css";
import css from "./SampleBrowser.module.css";

const KINDS = ["All", "Bed", "Sweep", "Hit", "FX", "Stinger", "Voice"];

export function SampleBrowser({ samples, compact }: { samples: MediaItem[]; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("All");
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const bar = useRef<HTMLSpanElement | null>(null);

  const kinds = KINDS.filter((k) => k === "All" || samples.some((x) => x.kind === k));
  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return samples.filter(
      (x) =>
        (kind === "All" || x.kind === kind) &&
        words.every((w) => `${x.name} ${x.kind} ${x.category ?? ""}`.toLowerCase().includes(w)),
    );
  }, [samples, q, kind]);

  // One shared <audio> for previews, with a progress bar on the playing card.
  useEffect(() => {
    const a = new Audio();
    audio.current = a;
    let raf = 0;
    const tick = () => {
      if (bar.current && a.duration) bar.current.style.transform = `scaleX(${a.currentTime / a.duration})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    a.onended = () => setPlaying(null);
    return () => {
      cancelAnimationFrame(raf);
      a.pause();
    };
  }, []);

  const toggle = (m: MediaItem) => {
    const a = audio.current;
    if (!a || !m.url) return;
    if (playing === m.id) {
      a.pause();
      setPlaying(null);
      return;
    }
    a.src = m.url;
    a.currentTime = 0;
    void a.play().catch(() => setPlaying(null));
    setPlaying(m.id);
  };

  if (!samples.length)
    return (
      <div className={s.empty}>
        <strong>No samples published yet</strong>
        <span>Admins can upload and publish samples from the admin dashboard.</span>
      </div>
    );

  return (
    <div>
      {!compact && (
        <div className={css.toolbar}>
          <label className={css.search}>
            <Icon name="search" size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search samples" aria-label="Search samples" />
          </label>
          <div className={css.segments} role="radiogroup" aria-label="Kind">
            {kinds.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {k === "All" ? "All" : `${k}s`}
              </button>
            ))}
          </div>
          <span className={css.total}>
            {list.length} of {samples.length}
          </span>
        </div>
      )}
      <div className={css.grid}>
        {list.map((m) => {
          const on = playing === m.id;
          return (
            <div key={m.id} className={css.card} data-playing={on || undefined} style={{ "--c": typeColor(m.type) } as React.CSSProperties}>
              <button type="button" className={css.wave} onClick={() => toggle(m)} aria-label={on ? `Stop ${m.name}` : `Preview ${m.name}`}>
                <svg viewBox="0 0 100 40" preserveAspectRatio="none">
                  <path d={m.waveform || "M0 20 L100 20 Z"} />
                </svg>
                <span className={css.play}>{on ? <PauseGlyph size={13} /> : <PlayGlyph size={13} />}</span>
                {on && <span ref={bar} className={css.progress} />}
              </button>
              <div className={css.meta}>
                <div className={css.titleRow}>
                  <span className={css.name}>{m.name}</span>
                  <span className={css.dur}>{m.duration.toFixed(1)}s</span>
                </div>
                <div className={css.subRow}>
                  <span className={css.kind}>
                    {m.kind}
                    {m.category ? ` · ${m.category}` : ""}
                  </span>
                  <Link href={`/studio?sample=${m.id.slice(SAMPLE_PREFIX.length)}`} className={css.use} prefetch={false}>
                    Use <Icon name="chevronRight" size={12} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!list.length && <div className={s.empty}>Nothing matches “{q}”.</div>}
    </div>
  );
}
