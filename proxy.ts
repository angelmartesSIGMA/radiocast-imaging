import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic Auth for the whole site.
 *
 * Credentials come from BASIC_AUTH_USER and BASIC_AUTH_PASSWORD (set them in
 * Vercel → Project → Settings → Environment Variables). If they are missing,
 * a deployed build refuses to serve rather than silently going public; local
 * `next dev` stays open so you can work without them.
 */
export function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
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
      return NextResponse.next();
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
