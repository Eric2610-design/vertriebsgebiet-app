import { cookies } from "next/headers";

export function isAdmin() {
  return cookies().get("vt_is_admin")?.value === "1";
}

export function requireAdmin() {
  if (!isAdmin()) {
    const err: any = new Error("admin_only");
    err.status = 403;
    throw err;
  }
}
