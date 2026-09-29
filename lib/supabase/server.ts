import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server only: the key bypasses RLS, so it must
 * never reach the browser. The browser only ever sees short-lived signed URLs.
 */
let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  const key = serviceKey();
  return !!supabaseUrl() && !!key && !keyProblem(key);
}

/** SUPABASE_SERVICE_ROLE_KEY, forgiving spaces and surrounding quotes. */
export function serviceKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
}

/** Why this can't be the service role key, or null if it looks right. */
export function keyProblem(key: string): string | null {
  if (key.startsWith("sb_secret_")) return null;
  if (key.startsWith("sb_publishable_")) return "This is the publishable key. Use the secret / SERVICE_ROLE_KEY.";
  const role = jwtRole(key);
  if (role === "service_role") return null;
  if (role) return `This key’s role is “${role}”. Use SERVICE_ROLE_KEY, not ANON_KEY.`;
  const parts = key.split(".").length;
  return `This isn’t a Supabase key: it should be a JWT starting with “eyJ” and made of 3 parts separated by dots, but this one ${
    parts === 1 ? "has no dots" : `has ${parts} parts`
  } (${key.length} characters, starts with “${key.slice(0, 4)}…”). Copy SERVICE_ROLE_KEY from the Supabase .env, not JWT_SECRET, and check it wasn’t cut off.`;
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
  const key = serviceKey();
  if (!url || !key) throw new NotConfigured();
  const problem = keyProblem(key);
  if (problem) throw new NotConfigured(`SUPABASE_SERVICE_ROLE_KEY: ${problem}`);
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
