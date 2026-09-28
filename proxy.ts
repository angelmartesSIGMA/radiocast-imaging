import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

/**
 * HTTP Basic Auth for the whole site.
 *
 * Credentials come from BASIC_AUTH_USER and BASIC_AUTH_PASSWORD (set them in
 * Vercel → Project → Settings → Environment Variables). If they are missing,
 * a deployed build refuses to serve rather than silently going public; local
 * `next dev` stays open so you can work without them.
 */
export async function proxy(req: NextRequest) {
  const gate = basicAuth(req);
  if (gate) return gate;
  return adminGate(req);
}

/**
 * /admin and /api/admin also need the signed admin cookie (set by /admin/login).
 */
async function adminGate(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminPage = pathname === "/admin" || (pathname.startsWith("/admin/") && !pathname.startsWith("/admin/login"));
  const isAdminApi = pathname.startsWith("/api/admin");
  if (!isAdminPage && !isAdminApi) return NextResponse.next();
  const ok = await verifyAdminToken(req.cookies.get(ADMIN_COOKIE)?.value, process.env.ADMIN_SESSION_SECRET);
  if (ok) return NextResponse.next();
  if (isAdminApi) return NextResponse.json({ error: "Admin login required" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

/** Returns a response when the request must stop here, or null to continue. */
function basicAuth(req: NextRequest): NextResponse | null {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "development") return null;
    return new NextResponse("Basic auth is not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme?.toLowerCase() === "basic" && encoded) {
    let decoded = "";
    try {
      decoded = atob(encoded);
    } catch {
      /* malformed header → challenge */
    }
    const i = decoded.indexOf(":");
    if (i >= 0 && safeEqual(decoded.slice(0, i), user) && safeEqual(decoded.slice(i + 1), pass)) {
      return null;
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Radiocast Imaging", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });
}

/** Constant-time string compare (hashing first so lengths don't leak). */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Skip build assets and public images. The image optimizer fetches
 * /radiocast-logo.png server-side without credentials, so gating it breaks
 * the logo. Pages, API routes and audio all still go through the gate.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
