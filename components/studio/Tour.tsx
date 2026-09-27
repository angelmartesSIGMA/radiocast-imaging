"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useStudio } from "@/lib/studio/store";
import css from "./Tour.module.css";

const STEPS: { target: string; title: string; body: string }[] = [
  {
    target: "library",
    title: "Pick your sounds",
    body: "Press ▶ to preview. Drag a sound onto a track, or hit + to drop it at the playhead. Your own files can be dropped anywhere.",
  },
  {
    target: "timeline",
    title: "Arrange on the timeline",
    body: "Drag clips to move them, drag the edges to trim, and pull the white dots to fade. Right-click a clip for more, or double-click an empty spot to search for a sound.",
  },
  {
    target: "transport",
    title: "Play and record",
    body: "Space plays and pauses. R records a voice take after a 3-2-1 count-in, and L loops. The meter shows your level.",
  },
  {
    target: "target",
    title: "Hit your length",
    body: "Pick how long the piece should be. We mark it on the timeline and tell you how far over or under you are.",
  },
  {
    target: "send",
    title: "Send it to a producer",
    body: "When the idea’s there, send the session to Radiocast and we’ll turn it into a finished, voiced piece. Press ⌘K anytime to search every action.",
  },
];

export function Tour() {
  const step = useStudio((s) => s.tour);
  const set = useStudio((s) => s.set);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const finish = () => set({ tour: null, tourDone: true });

  useLayoutEffect(() => {
    if (step == null) return;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    if (STEPS[step].target === "library" && !useStudio.getState().libOpen) set({ libOpen: true });
    find();
    const raf = requestAnimationFrame(find);
    window.addEventListener("resize", find);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", find);
    };
  }, [step, set]);

  useEffect(() => {
    if (step == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        finish();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.stopImmediatePropagation();
        if (step > 0) set({ tour: step - 1 });
      } else e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  if (step == null) return null;
  const last = step === STEPS.length - 1;
  function next() {
    if (last) finish();
    else set({ tour: (step ?? 0) + 1 });
  }

  const pad = 6;
  const r = rect ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
  const cardW = 320;
  const below = r.bottom + 200 < window.innerHeight;
  const right = r.width < 400 && r.right + cardW + 24 < window.innerWidth && r.height > 300;
  const cardStyle: React.CSSProperties = right
    ? { left: r.right + 16, top: Math.max(16, r.top + 24) }
    : {
        left: Math.min(Math.max(16, r.left + r.width / 2 - cardW / 2), window.innerWidth - cardW - 16),
        top: below ? r.bottom + 14 : undefined,
        bottom: below ? undefined : window.innerHeight - r.top + 14,
      };
  if (r.height > window.innerHeight * 0.6 && !right) {
    cardStyle.top = r.top + 80;
    cardStyle.bottom = undefined;
  }

  return (
    <div className={css.layer} role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div
        className={css.spot}
        style={{ left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 }}
      />
      <div className={css.card} style={{ ...cardStyle, width: cardW }} key={step}>
        <p className={css.count}>
          {step + 1} of {STEPS.length}
        </p>
        <h2 id="tour-title">{STEPS[step].title}</h2>
        <p className={css.body}>{STEPS[step].body}</p>
        <div className={css.dots} aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} data-on={i === step || undefined} />
          ))}
        </div>
        <div className={css.actions}>
          <button type="button" className={css.skip} onClick={finish}>
            {last ? "Close" : "Skip tour"}
          </button>
          {step > 0 && (
            <button type="button" className={css.back} onClick={() => set({ tour: step - 1 })}>
              Back
            </button>
          )}
          <button type="button" className={css.next} onClick={next} autoFocus>
            {last ? "Start creating" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
