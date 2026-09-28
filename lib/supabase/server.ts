import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server only: the key bypasses RLS, so it must
 * never reach the browser. The browser only ever sees short-lived signed URLs.
 */
let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl() || !key) return false;
  const role = jwtRole(key);
  return !role || role === "service_role";
}

/** SUPABASE_URL, forgiving the usual paste mistakes (spaces, trailing slash, /rest/v1 suffix). */
export function supabaseUrl() {
  return (process.env.SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|storage|auth)\/v1$/, "");
}

export function db(): SupabaseClient {
  if (client) return client;
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new NotConfigured();
  const role = jwtRole(key);
  if (role && role !== "service_role")
    throw new NotConfigured(`SUPABASE_SERVICE_ROLE_KEY is the “${role}” key. Use SERVICE_ROLE_KEY, not ANON_KEY.`);
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}

export class NotConfigured extends Error {
  constructor(message = "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.") {
    super(message);
  }
}

/** The `role` claim of a Supabase JWT key (null for non-JWT keys such as sb_secret_…). */
export function jwtRole(key: string): string | null {
  try {
    return (JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()) as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export const BUCKETS = { userAudio: "user-audio", samples: "samples", briefs: "briefs" } as const;

/** Signed download URL (default 1 hour). */
export async function signedUrl(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await db().storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/** Signed upload URL: the browser PUTs the file straight to Storage. */
export async function signedUpload(bucket: string, path: string) {
  const { data, error } = await db().storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error) throw error;
  return { url: data.signedUrl, token: data.token, path: data.path };
}
