import { checkSetup, explain } from "@/lib/supabase/diagnose";
import css from "./site.module.css";

/**
 * Shown instead of a data page when Supabase is missing or a query failed.
 * Runs the setup checks so the page says exactly what to fix, instead of a
 * generic server error.
 */
export async function NotConfigured({ error }: { error?: unknown }) {
  const checks = await checkSetup().catch(() => []);
  const failing = checks.filter((c) => !c.ok);
  return (
    <div className={css.setup}>
      <strong>{failing.length || error ? "Supabase isn’t set up correctly" : "Supabase isn’t connected yet"}</strong>
      {error !== undefined && !failing.length && <p className={css.setupErr}>{explain(error)}</p>}
      <ul>
        {checks.map((c) => (
          <li key={c.label} data-ok={c.ok || undefined}>
            <span aria-hidden>{c.ok ? "✓" : "✕"}</span>
            <div>
              {c.label}
              {c.detail && !c.ok && <small>{c.detail}</small>}
            </div>
          </li>
        ))}
      </ul>
      <p className={css.setupFoot}>
        Fix it in Vercel → Settings → Environment Variables (then redeploy) or in the Supabase SQL editor, then reload. Full check as JSON:{" "}
        <a href="/api/health">/api/health</a>
      </p>
    </div>
  );
}

export function NotConfiguredPage({ error }: { error?: unknown }) {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "80px 24px" }}>
      <NotConfigured error={error} />
    </div>
  );
}
