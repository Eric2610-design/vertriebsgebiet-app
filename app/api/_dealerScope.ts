// app/api/_dealerScope.ts
// Helper: determine which dealers the current viewer is allowed to see.
//
// Rules (requested):
// - AT Außendienstler: only dealers with country=AT
// - DE Außendienstler: only dealers with country=DE (legacy: also allow NULL/empty as DE)
// - Admin/Superadmin: no restriction
//
// Additionally, we apply the user's configured PLZ-territories (plz2 ranges).

import { cookies } from "next/headers";

import { supabaseService } from "@/lib/supabase";
import { isAdmin } from "@/app/api/_admin";

export type DealerScopeTerritory = {
  country: string;
  plz2_from: number;
  plz2_to: number;
};

export type DealerScope = {
  email: string | null;
  territories: DealerScopeTerritory[];
  allowedCountries: string[];
};

function normEmail(v: string | undefined | null) {
  return String(v || "").trim().toLowerCase();
}

function normCountry(v: string | undefined | null) {
  return String(v || "").trim().toUpperCase();
}

export function plz2(zip?: string | null): number | null {
  if (!zip) return null;
  const m = String(zip).match(/(\d{2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns NULL for admins (no restriction). Otherwise returns a scope.
 */
export async function getDealerScope(): Promise<DealerScope | null> {
  if (await isAdmin()) return null;

  const jar = await cookies();
  const authed = jar.get("vt_authed")?.value === "1";
  if (!authed) return { email: null, territories: [], allowedCountries: [] };

  const email = normEmail(jar.get("vt_email")?.value) || null;
  if (!email) return { email: null, territories: [], allowedCountries: [] };

  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("territories")
    .select("country,plz2_from,plz2_to")
    .eq("profile_email", email);

  if (error) {
    // Fail closed for reps: return empty scope
    return { email, territories: [], allowedCountries: [] };
  }

  const territories: DealerScopeTerritory[] = (data ?? []).map((t: any) => ({
    country: normCountry(t.country) || "DE",
    plz2_from: Number(t.plz2_from ?? 0),
    plz2_to: Number(t.plz2_to ?? 99),
  }));

  const allowedCountries = Array.from(new Set(territories.map((t) => t.country).filter(Boolean)));

  // If a rep has no territories configured, default to DE only (as requested).
  const finalAllowed = allowedCountries.length ? allowedCountries : ["DE"];

  return { email, territories, allowedCountries: finalAllowed };
}

export function dealerCountryAllowed(dealerCountry: string | null | undefined, allowedCountries: string[]) {
  const c = normCountry(dealerCountry);
  const allow = (allowedCountries || []).map(normCountry).filter(Boolean);
  if (!allow.length) return false;

  // Legacy behavior: many existing DE dealers are NULL/empty.
  if (allow.length === 1 && allow[0] === "DE") {
    return c === "" || c === "DE";
  }

  return allow.includes(c);
}

export function dealerInTerritory(
  dealer: { zip?: string | null; country?: string | null },
  territories: DealerScopeTerritory[],
  allowedCountries: string[]
) {
  if (!dealerCountryAllowed(dealer.country ?? null, allowedCountries)) return false;
  if (!territories.length) {
    // Country-only restriction
    return true;
  }

  const z = plz2(dealer.zip ?? null);
  if (z == null) return false;

  const dCountry = normCountry(dealer.country);
  for (const t of territories) {
    // For DE territories, treat NULL/empty dealer country as DE
    const countryOk = t.country === "DE" ? (dCountry === "" || dCountry === "DE") : dCountry === t.country;
    if (!countryOk) continue;
    if (z >= t.plz2_from && z <= t.plz2_to) return true;
  }
  return false;
}
