import { NextRequest, NextResponse } from "next/server";

function tryParseAuthCookie(raw: string): any | null {
  // raw kann JSON, URL-encoded JSON oder base64 JSON sein
  try {
    return JSON.parse(raw);
  } catch {}
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {}
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {}
  return null;
}

function getAccessToken(req: NextRequest): string | null {
  const all = req.cookies.getAll();

  // 1) Manche Setups setzen direkt sb-access-token
  const direct = all.find((c) => c.name === "sb-access-token")?.value;
  if (direct) return direct;

  // 2) Üblich: sb-<project-ref>-auth-token
  const authCookie = all.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  )?.value;

  if (!authCookie) return null;

  const parsed = tryParseAuthCookie(authCookie);
  if (!parsed) return null;

  // manchmal Array, manchmal Objekt
  const obj = Array.isArray(parsed) ? parsed[0] : parsed;

  return obj?.access_token ?? null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Alles außerhalb /app nicht anfassen
  // (und /api, /_next, assets sowieso nie blocken)
  if (
    !pathname.startsWith("/app") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  const token = getAccessToken(req);

  // Wenn kein Token -> ab zur Login-Seite
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Nur /app/* schützen
export const config = {
  matcher: ["/app/:path*"],
};
