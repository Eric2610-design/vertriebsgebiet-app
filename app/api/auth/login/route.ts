import { NextResponse } from "next/server";

function bad(msg: string, status = 401) {
  return new NextResponse(msg, { status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const users = [
    { email: (process.env.VT_USER_1_EMAIL ?? "").trim().toLowerCase(), password: process.env.VT_USER_1_PASSWORD ?? "" },
    { email: (process.env.VT_USER_2_EMAIL ?? "").trim().toLowerCase(), password: process.env.VT_USER_2_PASSWORD ?? "" },
  ].filter((u) => u.email && u.password);

  if (users.length === 0) return bad("Server ist noch nicht konfiguriert (VT_USER_1_* fehlt).", 500);

  const ok = users.some((u) => u.email === email && u.password === password);
  if (!ok) return bad("E‑Mail oder Passwort falsch.");

  // token shared for middleware check
  const token = process.env.VT_AUTH_TOKEN ?? "";
  if (!token) return bad("Server ist noch nicht konfiguriert (VT_AUTH_TOKEN fehlt).", 500);

  const res = NextResponse.json({ ok: true });
  res.cookies.set("vt_auth", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });

  // For Zwischenlösung: we persist the typed email to identify the rep/admin.
  // This is replaced later by proper Supabase Auth.
  res.cookies.set("vt_email", email, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
