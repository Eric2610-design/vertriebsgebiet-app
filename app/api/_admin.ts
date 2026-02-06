// app/api/_admin.ts
export function getCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  if (!raw) return undefined;

  // simple cookie parsing
  const parts = raw.split(";").map((p) => p.trim());
  for (const p of parts) {
    const idx = p.indexOf("=");
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === name) return decodeURIComponent(v);
  }
  return undefined;
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
