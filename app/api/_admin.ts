import { cookies } from "next/headers";

export async function isAdmin() {
  const c = await cookies();
  return c.get("vt_is_admin")?.value === "1";
}

export async function requireAdmin() {
  const ok = await isAdmin();
  if (!ok) {
    const err: any = new Error("admin_only");
    err.status = 403;
    throw err;
  }
}

