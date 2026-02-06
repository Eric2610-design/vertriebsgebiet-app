import { NextRequest, NextResponse } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // allow next internals / static / public files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // allow auth endpoints + login/callback pages
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/callback") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  const at = req.cookies.get("vt_at")?.value;
  const role = req.cookies.get("vt_role")?.value;
  if (!at) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Role gating (UI convenience; APIs validate again)
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperAdmin = role === "superadmin";

  if (pathname.startsWith("/admin/users") || pathname.startsWith("/api/admin/users")) {
    if (!isSuperAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/map";
      return NextResponse.redirect(url);
    }
  }

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/cleanup") ||
    pathname.startsWith("/ad")
  ) {
    if (!isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/map";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
