import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vt_authed", "0", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  res.cookies.set("vt_email", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  res.cookies.set("vt_is_admin", "0", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  res.cookies.set("vt_role", "", { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 });
  return res;
}
