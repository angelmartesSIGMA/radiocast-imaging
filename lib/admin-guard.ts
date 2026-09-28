import "server-only";
import { cookies } from "next/headers";
import { fail } from "@/lib/api";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

/** Defence in depth for /api/admin routes (proxy.ts already gates them). */
export async function adminOr401(): Promise<Response | null> {
  const ok = await verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET);
  return ok ? null : fail("Admin login required", 401);
}
