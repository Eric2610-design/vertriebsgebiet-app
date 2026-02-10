import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// This route is used by the UI to decide which navigation entries to show.
// It must NEVER be cached, and it must read cookies reliably in Next.js 15.
export const dynamic = "force-dynamic";

function normEmail(s: string | null | undefined) {
  return String(s || "").trim().toLowerCase();
}

export async function GET(req: Request) {
  // Prefer next/headers cookie store (works even when the raw cookie header is not exposed).
  const jar = await cookies();

  const email = normEmail(jar.get("vt_email")?.value) || null;
  const roleRaw = (jar.get("vt_role")?.value || "").toLowerCase();
  const legacyIsAdmin = jar.get("vt_is_admin")?.value === "1";
  const role = roleRaw || (legacyIsAdmin ? "admin" : "");
  const authed = jar.get("vt_authed")?.value === "1";
  const is_admin = role === "admin" || role === "superadmin";

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  const payload: any = {
    authed,
    email: email || null,
    role: role || null,
    is_admin,
    user: email ? { email } : null,
  };

  if (debug) {
    // Helpful diagnostics without leaking sensitive tokens.
    payload.debug = {
      has_cookie_header: Boolean(req.headers.get("cookie")),
      cookie_names: [
        "vt_authed",
        "vt_email",
        "vt_is_admin",
        "vt_role",
      ].filter((k) => Boolean(jar.get(k)?.value)),
    };
  }

  return NextResponse.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
