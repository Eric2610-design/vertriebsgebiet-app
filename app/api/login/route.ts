import { NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

function normEmail(s: string) {
  return String(s || "").trim().toLowerCase();
}

function parseList(envVal: string | undefined) {
  return (envVal || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = normEmail(body?.email);
  const password = String(body?.password || "");
  const next = String(body?.next || "/map");

  const expected = process.env.APP_PASSWORD || process.env.VT_PASSWORD || "";
  if (!expected) {
    return NextResponse.json({ error: "APP_PASSWORD fehlt (ENV)" }, { status: 500 });
  }
  if (!email || password !== expected) {
    return NextResponse.json({ error: "Falsche Zugangsdaten" }, { status: 401 });
  }

  // Determine role from DB (profiles) when available. This enables:
  // - superadmin-only actions (e.g. pictogram upload)
  // - stable admin checks (no hardcoded email lists needed)
  let role: string = "rep";
  try {
    const supabase = supabaseService();
    const { data } = await supabase.from("profiles").select("role").eq("email", email).maybeSingle();
    const r = String((data as any)?.role || "").toLowerCase();
    if (r) role = r;
  } catch {
    // ignore – fall back to env lists
  }

  // Fallback (if profiles not present / not populated)
  const adminEmails = parseList(process.env.VT_ADMIN_EMAILS);
  const superAdmins = parseList(process.env.VT_SUPERADMIN_EMAILS);
  if (superAdmins.includes(email)) role = "superadmin";
  else if (adminEmails.includes(email)) role = role === "superadmin" ? role : "admin";

  const isAdmin = role === "admin" || role === "superadmin";

  const res = NextResponse.json({ ok: true, next });

  // cookies: 30 days
  const maxAge = 60 * 60 * 24 * 30;
  res.cookies.set("vt_authed", "1", { path: "/", httpOnly: true, sameSite: "lax", maxAge });
  res.cookies.set("vt_email", email, { path: "/", httpOnly: true, sameSite: "lax", maxAge });
  res.cookies.set("vt_is_admin", isAdmin ? "1" : "0", { path: "/", httpOnly: true, sameSite: "lax", maxAge });
  res.cookies.set("vt_role", role, { path: "/", httpOnly: true, sameSite: "lax", maxAge });

  return res;
}
