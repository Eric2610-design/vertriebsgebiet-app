// app/api/_admin.ts
// Admin check without next/headers cookies() (fixes typing issues where cookies() is Promise)

export function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  const re = new RegExp(`(?:^|;\s*)${name}=([^;]*)`);
  const m = raw.match(re);
  return m ? decodeURIComponent(m[1]) : undefined;
}

export function isAdminRequest(req: Request): boolean {
  return getCookie(req, "vt_is_admin") === "1";
}

export function requireAdmin(req: Request): void {
  if (!isAdminRequest(req)) {
    const err: any = new Error("admin_only");
    err.status = 403;
    throw err;
  }
}
