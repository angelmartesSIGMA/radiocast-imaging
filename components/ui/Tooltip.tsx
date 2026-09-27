"use client";

import { useEffect, useRef, useState } from "react";
import s from "./ui.module.css";

interface Tip {
  text: string;
  kbd?: string;
  x: number;
  y: number;
  below: boolean;
}

/**
 * One global tooltip for every element with `data-tip` (and optional `data-kbd`).
 * Rendered position:fixed so it never gets clipped by scrolling toolbars.
 */
export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (el === current.current) return;
      hide();
      if (!el) return;
      current.current = el;
      timer.current = setTimeout(() => {
        if (!el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 80;
        setTip({
          text: el.dataset.tip!,
          kbd: el.dataset.kbd,
          x: r.left + r.width / 2,
          y: below ? r.bottom + 8 : r.top - 8,
          below,
        });
      }, 450);
    };
    window.addEventListener("pointerover", over);
    window.addEventListener("pointerdown", hide, true);
    window.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      clearTimeout(timer.current);
    };
  }, []);

  if (!tip) return null;
  const x = Math.min(Math.max(tip.x, 90), window.innerWidth - 90);
  return (
    <div
      className={s.tooltip}
      role="tooltip"
      style={{ left: x, top: tip.y, transform: `translate(-50%, ${tip.below ? "0" : "-100%"})` }}
    >
      {tip.text}
      {tip.kbd && <span className={s.tooltipKbd}>{tip.kbd}</span>}
    </div>
  );
}
