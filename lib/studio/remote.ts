"use client";

import type { SessionData, SessionRow } from "@/lib/db/types";
import type { MediaItem } from "@/lib/db/media";

/** Browser-side calls to the app's API routes. The browser never holds Supabase keys. */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
  return data as T;
}

const EXT_MIME: Record<string, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  opus: "audio/ogg",
};

/** Browsers sometimes give files an empty type; storage buckets only accept audio/*. */
export function audioMime(name: string, type?: string) {
  if (type && type.startsWith("audio/")) return type;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return EXT_MIME[ext] ?? "audio/wav";
}

/**
 * Upload a file to a Supabase signed upload URL (same wire format as
 * storage-js `uploadToSignedUrl`), reporting progress 0–1.
 */
export function putSigned(url: string, blob: Blob, mime: string, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", blob.type === mime ? blob : new Blob([blob], { type: mime }));
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(uploadError(xhr), xhr.status)));
    xhr.onerror = () => reject(new ApiError("Upload failed — check your connection", 0));
    xhr.send(body);
  });
}

function uploadError(xhr: XMLHttpRequest) {
  try {
    const j = JSON.parse(xhr.responseText) as { message?: string; error?: string };
    return j.message || j.error || `Upload failed (${xhr.status})`;
  } catch {
    return `Upload failed (${xhr.status})`;
  }
}

export const sessionApi = {
  get: (id: string) => api<{ session: SessionRow; media: MediaItem[] }>(`/api/sessions/${id}`),
  save: (id: string, body: { name: string; data: SessionData; duration_s: number; target_s: number | null; clip_count: number }) =>
    api<{ ok: true; updated_at: string }>(`/api/sessions/${id}`, { method: "PATCH", json: body, keepalive: true }),
  create: (body: { template?: string; sample?: string; name?: string }) => api<{ id: string }>("/api/sessions", { method: "POST", json: body }),
};

export async function uploadAsset(
  meta: { id: string; sessionId: string | null; name: string; kind: string; type: string; duration: number; waveform: string },
  blob: Blob,
  fileName: string,
  onProgress?: (p: number) => void,
) {
  const mime = audioMime(fileName, blob.type);
  const { url } = await api<{ url: string }>("/api/assets/upload-url", {
    method: "POST",
    json: { ...meta, name: meta.name, size: blob.size, mime, fileName },
  });
  await putSigned(url, blob, mime, onProgress);
  await api(`/api/assets/${meta.id}/finalize`, { method: "POST" });
}

export const samplesApi = {
  list: () => api<{ samples: MediaItem[] }>("/api/samples"),
};

export async function fetchAudio(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(`Couldn’t download audio (${res.status})`, res.status);
  return res.blob();
}
