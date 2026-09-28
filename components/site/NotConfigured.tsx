import css from "./site.module.css";

/** Shown instead of data pages when the Supabase env vars are missing. */
export function NotConfigured() {
  return (
    <div className={css.empty} style={{ margin: "40px 0" }}>
      <strong>Supabase isn’t connected yet</strong>
      <span>
        Set <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>, run <code>supabase/migrations/0001_init.sql</code> in the SQL
        editor, then redeploy.
      </span>
    </div>
  );
}

export function NotConfiguredPage() {
  return (
    <div className="container" style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px" }}>
      <NotConfigured />
    </div>
  );
}
