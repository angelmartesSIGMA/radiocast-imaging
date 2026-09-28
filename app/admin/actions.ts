"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ADMIN_TTL_MS, safeEqualStr, signAdminToken } from "@/lib/admin-auth";

export async function adminLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/admin");
  const expected = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!expected || !secret) return { error: "Admin isn’t set up: add ADMIN_PASSWORD and ADMIN_SESSION_SECRET." };
  // Small fixed delay blunts password guessing.
  await new Promise((r) => setTimeout(r, 400));
  if (!safeEqualStr(password, expected)) return { error: "Wrong password" };
  (await cookies()).set(ADMIN_COOKIE, await signAdminToken(secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_TTL_MS / 1000,
  });
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}
