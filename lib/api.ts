import "server-only";
import { NextResponse } from "next/server";
import { explain } from "@/lib/supabase/diagnose";
import { NotConfigured } from "@/lib/supabase/server";

export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (message: string, status = 400) => json({ error: message }, status);

/** Wrap a route handler so config and database errors become clean JSON responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof NotConfigured) return fail(e.message, 503);
      const msg = explain(e);
      console.error("[api]", msg, e);
      return fail(msg, 500);
    }
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Allowed audio file extensions for uploads. */
export function audioExt(name: string, mime?: string | null): string {
  const m = name.toLowerCase().match(/\.(wav|mp3|aiff?|m4a|ogg|oga|flac|aac|webm|opus)$/);
  if (m) return m[1];
  if (mime?.includes("webm")) return "webm";
  if (mime?.includes("ogg")) return "ogg";
  if (mime?.includes("mp4") || mime?.includes("aac")) return "m4a";
  if (mime?.includes("mpeg")) return "mp3";
  return "wav";
}
