import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

function isPublicPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/favicon")) return true;
  if (pathname.startsWith("/markers")) return true;
  if (pathname.startsWith("/brands")) return true;
  if (pathname.startsWith("/robots.txt")) return true;
  if (pathname.startsWith("/sitemap")) return true;
  if (PUBLIC_FILE.test(pathname)) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths
  if (isPublicPath(pathname)) return NextResponse.next();
  if (pathname === "/login") return NextResponse.next();
  if (pathname.startsWith("/api/login") || pathname.startsWith("/api/logout")) return NextResponse.next();

  const authed = req.cookies.get("vt_authed")?.value === "1";

  // Block unauthenticated
  if (!authed) {
    // API calls: return 401 JSON
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
