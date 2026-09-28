import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Server only: the key bypasses RLS, so it must
 * never reach the browser. The browser only ever sees short-lived signed URLs.
 */
let client: SupabaseClient | null = null;

export function supabaseConfigured() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new NotConfigured();
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}

export class NotConfigured extends Error {
  constructor() {
    super("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
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
