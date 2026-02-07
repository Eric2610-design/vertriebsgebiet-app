// app/api/_admin.ts
// Central admin/superadmin check for API routes.
// Uses next/headers cookies() (Next.js 15+ may return a Promise), so everything is async.

import { cookies } from "next/headers";

export type VtRole = "rep" | "aussendienst" | "admin" | "superadmin" | "";

export async function getVtCookie(name: string): Promise<string | undefined> {
  const c = await cookies();
  return c.get(name)?.value;
}

export async function getVtRole(): Promise<VtRole> {
  const role = (await getVtCookie("vt_role")) ?? "";
  return String(role).toLowerCase() as VtRole;
}

export async function isAdmin(): Promise<boolean> {
  // Legacy support: older builds used vt_is_admin
  const legacy = (await getVtCookie("vt_is_admin")) === "1";
  const role = await getVtRole();
  return legacy || role === "admin" || role === "superadmin";
}

/**
 * Throws an Error("admin_only") with status=403 if the current request is not admin.
 * API routes should call: `await requireAdmin();`
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) {
    const err: any = new Error("admin_only");
    err.status = 403;
    throw err;
  }
}
