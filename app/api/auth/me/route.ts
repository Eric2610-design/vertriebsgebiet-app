import { ok } from "@/app/api/_util";
import { getCookie } from "@/app/api/_admin";

export async function GET(req: Request) {
  const email = getCookie(req, "vt_email") || null;
  const is_admin = getCookie(req, "vt_is_admin") === "1";
  const authed = getCookie(req, "vt_authed") === "1";
  return ok({ authed, email, is_admin });
}
