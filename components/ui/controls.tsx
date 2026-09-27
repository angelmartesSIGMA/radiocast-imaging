"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { fillPct } from "@/lib/studio/format";
import { Icon, type IconName } from "./Icon";
import s from "./ui.module.css";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>;

type TipProps = { tip?: string; kbd?: string };

export function IconButton({
  icon,
  label,
  on,
  round,
  size = 16,
  className,
  tip,
  kbd,
  ...rest
}: BtnProps & TipProps & { icon: IconName; label: string; on?: boolean; round?: boolean; size?: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-tip={tip ?? label}
      data-kbd={kbd}
      aria-keyshortcuts={kbd}
      data-on={on || undefined}
      aria-pressed={on === undefined ? undefined : on}
      className={`${s.iconBtn} ${round ? s.round : ""} ${className ?? ""}`}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function TextButton({
  icon,
  children,
  on,
  className,
  tip,
  kbd,
  ...rest
}: BtnProps & TipProps & { icon?: IconName; on?: boolean }) {
  return (
    <button
      type="button"
      data-tip={tip}
      data-kbd={kbd}
      data-on={on || undefined}
      aria-pressed={on === undefined ? undefined : on}
      className={`${s.textBtn} ${className ?? ""}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

export function Chip({
  on,
  color,
  large,
  children,
  role,
  ...rest
}: BtnProps & { on: boolean; color?: string; large?: boolean }) {
  const ariaState = role === "radio" ? { "aria-checked": on } : { "aria-pressed": on };
  return (
    <button type="button" role={role} className={`${s.chip} ${large ? s.chipLg : ""}`} {...ariaState} {...rest}>
      {color && <span className={s.dot} style={{ background: color }} />}
      {children}
    </button>
  );
}

export function Slider({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange,
  onCommit,
  style,
}: {
  label: ReactNode;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Called once at the start of a gesture so the change lands as one undo step. */
  onCommit?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <label className={s.slider} style={style}>
      <span className={s.sliderHead}>
        {label}
        <span className={s.sliderVal}>{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onKeyDown={(e) => {
          if (onCommit && !e.repeat && e.key.startsWith("Arrow")) onCommit();
        }}
        onChange={(e) => onChange(+e.target.value)}
        style={{ "--fill": fillPct(value, min, max) } as React.CSSProperties}
      />
    </label>
  );
}

export function ToggleRow({
  title,
  sub,
  checked,
  onToggle,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} className={s.toggleRow} onClick={onToggle}>
      <span>
        <span className={s.toggleTitle}>{title}</span>
        <span className={s.toggleSub}>{sub}</span>
      </span>
      <span className={s.switch} />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className={s.kbd}>{children}</span>;
}

export function Divider() {
  return <span className={s.divider} aria-hidden="true" />;
}
