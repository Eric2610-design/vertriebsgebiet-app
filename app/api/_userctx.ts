import { cookies } from "next/headers";
import { supabaseService } from "@/lib/supabase";

export type UserRole = "superadmin" | "admin" | "aussendienst" | "rep" | null;

export type AdRange = {
  country: "DE" | "AT";
  plz_from: number;
  plz_to: number;
};

export function isAdminRole(role: UserRole) {
  return role === "admin" || role === "superadmin";
}

export function normalizeCountry(c?: string | null): "DE" | "AT" {
  const x = (c ?? "DE").toUpperCase();
  return x === "AT" ? "AT" : "DE";
}

export function inRanges(dealerCountry: string | null | undefined, zipcodeInt: number | null | undefined, ranges: AdRange[]) {
  if (!zipcodeInt || ranges.length === 0) return false;
  const c = normalizeCountry(dealerCountry);
  return ranges.some((r) => r.country === c && zipcodeInt >= r.plz_from && zipcodeInt <= r.plz_to);
}

export async function getUserContext() {
  const email = (cookies().get("vt_email")?.value || "").trim().toLowerCase();
  if (!email) {
    return { email: "", role: null as UserRole, ranges: [] as AdRange[], profileId: null as string | null };
  }

  const supabase = supabaseService();

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("email", email)
    .maybeSingle();

  if (profErr || !prof) {
    return { email, role: null as UserRole, ranges: [] as AdRange[], profileId: null as string | null };
  }

  const role = (prof.role as UserRole) ?? null;
  const profileId = (prof.id as string) ?? null;

  if (!profileId || isAdminRole(role)) {
    return { email, role, ranges: [] as AdRange[], profileId };
  }

  const { data: ranges, error: rangesErr } = await supabase
    .from("ad_plz_ranges")
    .select("country,plz_from,plz_to")
    .eq("user_id", profileId);

  if (rangesErr) {
    return { email, role, ranges: [] as AdRange[], profileId };
  }

  return {
    email,
    role,
    profileId,
    ranges: (ranges ?? []).map((r: any) => ({
      country: normalizeCountry(r.country),
      plz_from: Number(r.plz_from),
      plz_to: Number(r.plz_to),
    })),
  };
}

export async function requireAdmin() {
  const ctx = await getUserContext();
  if (!isAdminRole(ctx.role)) throw new Error("forbidden");
  return ctx;
}

export async function requireDealerAccess(dealer: { country?: string | null; zipcode_int?: number | null } | null) {
  const ctx = await getUserContext();
  if (isAdminRole(ctx.role)) return ctx;
  if (ctx.role !== "aussendienst") throw new Error("forbidden");
  if (!dealer) throw new Error("not_found");
  if (!inRanges(dealer.country ?? "DE", dealer.zipcode_int ?? null, ctx.ranges)) throw new Error("forbidden");
  return ctx;
}
