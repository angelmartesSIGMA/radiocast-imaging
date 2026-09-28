"use client";

import Link from "next/link";
import { useState } from "react";
import { encodeWav } from "@/lib/audio/dsp";
import { api, putSigned } from "@/lib/studio/remote";
import { DELIVERABLES, TURNAROUNDS, VOICES } from "@/lib/studio/constants";
import { fmtShort } from "@/lib/studio/format";
import { useStudio } from "@/lib/studio/store";
import { Chip } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import css from "./SendDrawer.module.css";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
/** Typical imaging read pace, words per second. */
const WPS = 2.7;

export function SendDrawer() {
  const s = useStudio();
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState<{ step: string; p: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  if (!s.drawer) return null;

  const send = async () => {
    setError(null);
    try {
      setSending({ step: "Saving your session…", p: 0.05 });
      await s.save();
      const hasMix = s.clips.length > 0;
      setSending({ step: "Creating your brief…", p: 0.1 });
      const brief = await api<{ id: string; ref: string; uploadUrl: string | null }>("/api/briefs", {
        method: "POST",
        json: {
          sessionId: s.sessionId,
          station: s.station,
          email: s.email.trim(),
          voice: s.voice,
          deliverables: s.deliverables,
          turnaround: s.turnaround,
          script: s.notes,
          target: s.target,
          hasMix,
          snapshot: {
            name: s.projectName,
            duration_s: +s.sessionEnd().toFixed(2),
            clip_count: s.clips.length,
            lanes: s.lanes.map((l) => ({ label: l.label, type: l.type, fx: l.fx })),
          },
        },
      });
      if (hasMix && brief.uploadUrl) {
        setSending({ step: "Rendering the mix…", p: 0.2 });
        const r = await s.renderMaster();
        if (r) {
          await putSigned(brief.uploadUrl, encodeWav(r.buf), "audio/wav", (p) => setSending({ step: "Uploading the mix…", p: 0.3 + p * 0.65 }));
          await api(`/api/briefs/${brief.id}/mix-done`, { method: "POST" });
        }
      }
      setRef(brief.ref);
      s.set({ sent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t send the brief");
    } finally {
      setSending(null);
    }
  };

  const close = () => s.set({ drawer: false });
  const end = s.sessionEnd();
  const words = s.notes.trim() ? s.notes.trim().split(/\s+/).length : 0;
  const readSec = words / WPS;
  const emailOk = EMAIL_RE.test(s.email.trim());
  const canSend = emailOk && s.deliverables.length > 0;
  const toggleDeliverable = (d: string) =>
    s.set({ deliverables: s.deliverables.includes(d) ? s.deliverables.filter((x) => x !== d) : [...s.deliverables, d] });

  return (
    <div className={css.wrap}>
      <div className={css.scrim} onClick={close} />
      <aside className={css.drawer} role="dialog" aria-modal="true" aria-labelledby="send-title">
        <div className={css.head}>
          <div>
            <p className="eyebrow">Custom imaging</p>
            <h2 id="send-title">Send to producers</h2>
            <p className={css.lede}>
              We rebuild your session with a pro voice and full production, and send drafts back by email.
            </p>
          </div>
          <button type="button" className={css.x} onClick={close} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>

        {s.sent ? (
          <div className={css.done}>
            <div className={css.doneIcon}>
              <Icon name="check" size={22} />
            </div>
            <p className={css.doneTitle}>Brief sent{ref ? ` · ${ref}` : ""}</p>
            <p className={css.doneSub}>
              A producer will reply to <b>{s.email}</b> with drafts
              {s.turnaround === "rush" ? " within 24 hours" : " within 3 business days"}.
            </p>
            <ul className={css.summary}>
              <li>
                <span>Deliverables</span>
                {s.deliverables.join(", ")}
              </li>
              <li>
                <span>Voice</span>
                {s.voice}
              </li>
              {s.station && (
                <li>
                  <span>Station</span>
                  {s.station}
                </li>
              )}
            </ul>
            <div className={css.doneActions}>
              <button type="button" className={css.secondary} onClick={close}>
                Back to the studio
              </button>
              <Link href="/dashboard" className={css.secondary}>
                Track it on your dashboard
              </Link>
            </div>
          </div>
        ) : (
          <form
            className={css.form}
            onSubmit={(e) => {
              e.preventDefault();
              setTouched(true);
              if (canSend && !sending) void send();
            }}
          >
            <div className={css.body}>
              <div className={css.attach}>
                <span className={css.attachIcon}>
                  <Icon name="link" size={16} />
                </span>
                <div className={css.attachMeta}>
                  <p className={css.attachName}>{s.projectName || "Untitled session"}</p>
                  <p className={css.attachSub}>
                    Session attached · {s.clips.length} clip{s.clips.length === 1 ? "" : "s"} · {fmtShort(end)}
                  </p>
                </div>
              </div>

              <label className={css.field}>
                <span className={css.label}>Station name</span>
                <input value={s.station} onChange={(e) => s.set({ station: e.target.value })} placeholder="e.g. Night Shift FM" />
              </label>

              <fieldset className={css.field}>
                <legend className={css.label}>What do you need?</legend>
                <div className={css.chips}>
                  {DELIVERABLES.map((d) => (
                    <Chip key={d} large on={s.deliverables.includes(d)} onClick={() => toggleDeliverable(d)}>
                      {s.deliverables.includes(d) && <Icon name="check" size={12} strokeWidth={2.6} />}
                      {d}
                    </Chip>
                  ))}
                </div>
                {touched && !s.deliverables.length && <span className={css.error}>Pick at least one.</span>}
              </fieldset>

              <fieldset className={css.field}>
                <legend className={css.label}>Voice</legend>
                <div className={css.chips} role="radiogroup">
                  {VOICES.map((v) => (
                    <Chip key={v} large role="radio" on={s.voice === v} onClick={() => s.set({ voice: v })}>
                      {v}
                    </Chip>
                  ))}
                </div>
              </fieldset>

              <label className={css.field}>
                <span className={css.labelRow}>
                  <span className={css.label}>Script and notes</span>
                  {words > 0 && (
                    <span className={css.count} title={`About ${WPS} words per second`}>
                      {words} words · ~{readSec.toFixed(0)}s read
                      {s.target ? ` / :${String(s.target).padStart(2, "0")}` : ""}
                    </span>
                  )}
                </span>
                <textarea
                  value={s.notes}
                  onChange={(e) => s.set({ notes: e.target.value })}
                  rows={6}
                  placeholder="What should the voice say? Reference stations, energy, words to avoid?"
                />
              </label>

              <fieldset className={css.field}>
                <legend className={css.label}>Turnaround</legend>
                <div className={css.turn} role="radiogroup">
                  {TURNAROUNDS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={s.turnaround === t.id}
                      className={css.turnOpt}
                      onClick={() => s.set({ turnaround: t.id })}
                    >
                      <span className={css.turnLabel}>{t.label}</span>
                      <span className={css.turnNote}>{t.note}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className={css.field}>
                <span className={css.label}>Send drafts to</span>
                <input
                  type="email"
                  value={s.email}
                  onChange={(e) => s.set({ email: e.target.value })}
                  onBlur={() => setTouched(true)}
                  placeholder="you@station.com"
                  aria-invalid={touched && !emailOk}
                  required
                />
                {touched && !emailOk && <span className={css.error}>Enter an email so we can send drafts.</span>}
              </label>
            </div>

            {(sending || error) && (
              <div className={css.progress} data-error={error ? true : undefined} role="status">
                <span>{error ?? sending?.step}</span>
                {sending && (
                  <span className={css.progressBar}>
                    <span style={{ transform: `scaleX(${sending.p})` }} />
                  </span>
                )}
              </div>
            )}
            <div className={css.foot}>
              <a href="mailto:contact@radiocast.net">contact@radiocast.net</a>
              <button
                type="submit"
                className={css.primary}
                aria-disabled={!canSend || !!sending}
                data-disabled={!canSend || !!sending || undefined}
              >
                {sending ? "Sending…" : error ? "Try again" : "Send brief"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </div>
  );
}
