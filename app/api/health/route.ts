import { json } from "@/lib/api";
import { checkSetup } from "@/lib/supabase/diagnose";

export const dynamic = "force-dynamic";

/** Setup check (behind Basic Auth): env vars, key role, tables, buckets. */
export async function GET() {
  const checks = await checkSetup();
  const env = {
    BASIC_AUTH: !!(process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD),
    ADMIN_PASSWORD: !!process.env.ADMIN_PASSWORD,
    ADMIN_SESSION_SECRET: (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 16,
  };
  const ok = checks.every((c) => c.ok);
  return json({ ok, checks, env }, ok ? 200 : 503);
}
