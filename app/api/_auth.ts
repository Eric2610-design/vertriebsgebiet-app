import { cookies } from "next/headers";
import { supabaseAnon, supabaseService } from "@/lib/supabase";

export type Role = "superadmin" | "admin" | "aussendienst";

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
};

export async function readAuthCookies() {
  const store = await cookies();
  const access_token = store.get("vt_at")?.value || "";
  const refresh_token = store.get("vt_rt")?.value || "";
  const role = (store.get("vt_role")?.value || "") as Role | "";
  const email = (store.get("vt_email")?.value || "").toLowerCase();
  return { access_token, refresh_token, role: role || null, email: email || null };
}

export function setAuthCookies(res: any, params: { access_token: string; refresh_token: string; role?: Role | null; email?: string | null }) {
  res.cookies.set("vt_at", params.access_token, COOKIE_OPTS);
  res.cookies.set("vt_rt", params.refresh_token, COOKIE_OPTS);
  if (params.role) res.cookies.set("vt_role", params.role, COOKIE_OPTS);
  if (params.email) res.cookies.set("vt_email", params.email.toLowerCase(), COOKIE_OPTS);
}

export function clearAuthCookies(res: any) {
  ["vt_at", "vt_rt", "vt_role", "vt_email"].forEach((k) => {
    res.cookies.set(k, "", { ...COOKIE_OPTS, maxAge: 0 });
  });
}

export async function getUserClientFromCookies() {
  const { access_token, refresh_token } = await readAuthCookies();
  const supabase = supabaseAnon();
  if (!access_token) return { supabase, user: null };
  // setSession requires both tokens; refresh token might be empty in some edge cases
  if (refresh_token) {
    await supabase.auth.setSession({ access_token, refresh_token });
  } else {
    // best-effort: set access token only
    // @ts-ignore
    supabase.auth.setAuth(access_token);
  }
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function requireUser() {
  const { supabase, user } = await getUserClientFromCookies();
  if (!user) throw new Error("unauthorized");
  return { supabase, user };
}

export async function getRoleForUser(userId: string): Promise<Role | null> {
  // We prefer reading via anon client under RLS, but for robustness we use service role.
  const svc = supabaseService();
  const { data } = await svc.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (data?.role || "") as Role | "";
  return role || null;
}

export async function requireRole(allowed: Role[]) {
  const { user } = await requireUser();
  const role = await getRoleForUser(user.id);
  if (!role || !allowed.includes(role)) throw new Error("forbidden");
  return { user, role };
}
