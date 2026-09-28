import "server-only";
import { BUCKETS, db, jwtRole, supabaseUrl } from "./server";

export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

const FATAL = /^(Can’t reach|Supabase rejected|SUPABASE_URL answered|The gateway)/;
const TABLES = ["sessions", "assets", "samples", "briefs", "brief_events", "brief_files"] as const;

/** Turn a Supabase/fetch error into a sentence that says what to change. */
export function explain(err: unknown): string {
  const e = err as { message?: string; code?: string; cause?: { code?: string; message?: string } } | null;
  const msg = e?.message ?? String(err);
  const cause = e?.cause?.code ?? e?.cause?.message ?? "";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate|UND_ERR/i.test(msg + cause))
    return `Can’t reach SUPABASE_URL from the server (${cause || msg}). It must be the public HTTPS address of your Supabase gateway (Kong), with a valid certificate.`;
  if (/Invalid API key|JWS|JWT|invalid signature|No API key/i.test(msg))
    return `Supabase rejected the key (${msg}). SUPABASE_SERVICE_ROLE_KEY must be the SERVICE_ROLE_KEY from the same Supabase stack.`;
  if (e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|Could not find the table|schema cache/i.test(msg))
    return `Tables are missing (${msg}). Run supabase/migrations/0001_init.sql in the Supabase SQL editor.`;
  if (/row-level security/i.test(msg))
    return `Blocked by row-level security (${msg}). That usually means the anon key was used — SUPABASE_SERVICE_ROLE_KEY must be the service role key.`;
  if (/Bad Gateway|HTTP 50[234]|upstream/i.test(msg))
    return `The gateway at SUPABASE_URL is up but a Supabase service behind it isn’t (${msg}). Check that the rest/storage containers are running.`;
  if (/Bucket not found/i.test(msg)) return `Storage buckets are missing. Run supabase/migrations/0001_init.sql in the Supabase SQL editor.`;
  if (/Unexpected token|<!DOCTYPE|not valid JSON/i.test(msg))
    return `SUPABASE_URL answered with a web page, not the API (${msg}). Point it at the Kong gateway (usually port 8000 or its HTTPS domain), not Supabase Studio.`;
  return msg;
}

/** Step-by-step check of the Supabase setup; stops at the first check everything else depends on. */
export async function checkSetup(): Promise<Check[]> {
  const out: Check[] = [];
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  out.push({ label: "SUPABASE_URL is set", ok: !!url, detail: url ? url : "Add it in Vercel → Settings → Environment Variables, then redeploy." });
  out.push({ label: "SUPABASE_SERVICE_ROLE_KEY is set", ok: !!key, detail: key ? undefined : "Add it in Vercel → Settings → Environment Variables, then redeploy." });
  if (!url || !key) return out;

  if (!/^https?:\/\//.test(url)) {
    out.push({ label: "SUPABASE_URL is a full URL", ok: false, detail: "It must start with https://" });
    return out;
  }
  const role = jwtRole(key);
  if (role && role !== "service_role") {
    out.push({ label: "Key is the service role key", ok: false, detail: `This key’s role is “${role}”. Use SERVICE_ROLE_KEY, not ANON_KEY.` });
    return out;
  }
  out.push({ label: "Key is the service role key", ok: true });

  // Reachability + tables
  let reached = true;
  for (const t of TABLES) {
    let detail: string | undefined;
    try {
      // limit(0) rather than a HEAD request, so errors come back with a message.
      const { error, status } = await db().from(t).select("*").limit(0);
      if (error) detail = explain(error.message || error.code ? error : { message: `HTTP ${status}` });
    } catch (e) {
      detail = explain(e);
    }
    // Connection-level problems fail every table the same way; report once.
    if (detail && FATAL.test(detail)) {
      out.push({ label: "Reach the Supabase API", ok: false, detail });
      reached = false;
      break;
    }
    out.push({ label: `Table ${t}`, ok: !detail, detail });
  }
  if (!reached) return out;

  try {
    const { data, error } = await db().storage.listBuckets();
    if (error) out.push({ label: "Storage", ok: false, detail: explain(error) });
    else
      for (const b of Object.values(BUCKETS)) {
        const found = data.some((x) => x.id === b);
        out.push({ label: `Bucket ${b}`, ok: found, detail: found ? undefined : "Missing — run supabase/migrations/0001_init.sql." });
      }
  } catch (e) {
    out.push({ label: "Storage", ok: false, detail: explain(e) });
  }
  return out;
}
