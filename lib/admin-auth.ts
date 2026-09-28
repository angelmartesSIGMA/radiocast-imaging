/**
 * Admin session cookie: `<expiry ms>.<HMAC-SHA256(expiry)>`, signed with
 * ADMIN_SESSION_SECRET. Uses Web Crypto so it works in proxy.ts and server actions.
 */
export const ADMIN_COOKIE = "rc_admin";
export const ADMIN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const enc = new TextEncoder();

async function hmac(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compare two strings without leaking where they differ. */
export function safeEqualStr(a: string, b: string) {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function signAdminToken(secret: string, ttl = ADMIN_TTL_MS) {
  const exp = String(Date.now() + ttl);
  return `${exp}.${await hmac(secret, exp)}`;
}

export async function verifyAdminToken(token: string | undefined, secret: string | undefined) {
  if (!token || !secret) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqualStr(sig, await hmac(secret, exp));
}
