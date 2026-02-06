import { ok } from "@/app/api/_util";
import { getCookie } from "@/app/api/_admin";

export async function GET(req: Request) {
  const email = getCookie(req, "vt_email") || null;
  const role = (getCookie(req, "vt_role") || (getCookie(req, "vt_is_admin") === "1" ? "admin" : "")).toLowerCase();
  const authed = getCookie(req, "vt_authed") === "1";
  // Keep legacy field for old clients.
  const is_admin = role === "admin" || role === "superadmin";
  return ok({ authed, email, role: role || null, is_admin, user: email ? { email } : null });
}
