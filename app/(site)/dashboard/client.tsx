"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import s from "@/components/site/site.module.css";
import { LEGACY_KEY } from "@/lib/studio/legacy";
import { deleteAsset, deleteSession, duplicateSession, importLegacy, renameSession } from "./actions";
import css from "./dashboard.module.css";

export function SessionCard({ id, name, meta, updated, over }: { id: string; name: string; meta: string; updated: string; over: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setErr(null);
      try {
        await fn();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  return (
    <div className={css.session} data-pending={pending || undefined} ref={ref}>
      <Link href={`/studio/${id}`} className={css.sessionLink} aria-label={`Open ${name}`} />
      <div className={css.sessionTop}>
        <span className={css.sessionIcon}>
          <Icon name="music" size={15} />
        </span>
        <button type="button" className={css.more} aria-label="Session actions" onClick={() => setMenu(!menu)}>
          ⋯
        </button>
        {menu && (
          <div className={css.menu} role="menu">
            <button type="button" role="menuitem" onClick={() => (setMenu(false), setEditing(true))}>
              Rename
            </button>
            <button type="button" role="menuitem" onClick={() => (setMenu(false), run(async () => router.push(`/studio/${await duplicateSession(id)}`)))}>
              Duplicate
            </button>
            <button
              type="button"
              role="menuitem"
              data-danger
              onClick={() => {
                setMenu(false);
                if (confirm(`Delete “${name}”?`)) run(() => deleteSession(id));
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <input
          className={css.rename}
          defaultValue={name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={(e) => {
            const v = e.currentTarget.value;
            setEditing(false);
            if (v.trim() && v !== name) run(() => renameSession(id, v));
          }}
        />
      ) : (
        <p className={css.sessionName}>{name}</p>
      )}
      <p className={css.sessionMeta} data-over={over || undefined}>
        {meta}
      </p>
      <p className={css.sessionUpdated}>Edited {updated}</p>
      {err && <p className={s.error}>{err}</p>}
    </div>
  );
}

export function NewSessionMenu({ templates }: { templates: { id: string; name: string; blurb: string }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div className={css.newWrap} ref={ref}>
      <button type="button" className={s.btnPrimary} onClick={() => setOpen(!open)} aria-expanded={open}>
        <Icon name="plus" size={14} strokeWidth={2.4} />
        New session
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className={css.newMenu} role="menu">
          {templates.map((t) => (
            <Link key={t.id} href={`/studio?template=${t.id}`} role="menuitem" prefetch={false}>
              <span className={css.newName}>{t.name}</span>
              <span className={css.newBlurb}>{t.blurb}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Offers to move a session saved by the old, browser-only studio into the database. */
export function LegacyImport() {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) setData(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);
  if (!data) return null;
  const dismiss = () => {
    localStorage.removeItem(LEGACY_KEY);
    setData(null);
  };
  return (
    <div className={s.banner}>
      <span>
        We found a session saved in this browser before cloud saving existed{typeof data.name === "string" ? ` (“${data.name}”)` : ""}.
        {err && <span className={s.error}> {err}</span>}
      </span>
      <span style={{ display: "flex", gap: 8 }}>
        <button type="button" className={`${s.btnGhost} ${s.small}`} onClick={dismiss}>
          Dismiss
        </button>
        <button
          type="button"
          className={`${s.btnPrimary} ${s.small}`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                const id = await importLegacy(data);
                localStorage.removeItem(LEGACY_KEY);
                router.push(`/studio/${id}`);
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Import failed");
              }
            })
          }
        >
          {pending ? "Importing…" : "Import it"}
        </button>
      </span>
    </div>
  );
}

export function AssetDelete({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`${s.btnGhost} ${s.small}`}
      disabled={pending}
      onClick={() => confirm(`Delete “${name}”? Sessions using it will lose this audio.`) && start(() => deleteAsset(id))}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
