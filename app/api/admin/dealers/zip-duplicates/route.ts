export const dynamic = "force-dynamic";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { fetchAllPaged } from "@/lib/supabasePaging";

type DealerMini = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  country_iso: string | null;
  status?: string | null;
  merged_into?: string | null;
};

function countryOf(d: DealerMini): string | null {
  const c = String(d.country_iso ?? d.country ?? "").trim().toUpperCase();
  return c || null;
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const supabase = supabaseService();
    const url = new URL(req.url);
    const country = String(url.searchParams.get("country") ?? "DE")
      .trim()
      .toUpperCase();
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? "200")));

    const rows = await fetchAllPaged<DealerMini>(
      (from, to) =>
        supabase
          .from("dealers")
          .select("id,name,street,zip,city,country,country_iso,status,merged_into")
          .is("merged_into", null)
          .order("zip", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 50000 }
    );

    const byZip = new Map<string, DealerMini[]>();
    for (const d of rows ?? []) {
      const c = countryOf(d);
      if (!c || c !== country) continue;
      const z = String(d.zip ?? "").trim();
      if (!z) continue;
      const arr = byZip.get(z) ?? [];
      arr.push(d);
      byZip.set(z, arr);
    }

    const duplicates = Array.from(byZip.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([zip, arr]) => ({ zip, count: arr.length }))
      .sort((a, b) => b.count - a.count || a.zip.localeCompare(b.zip));

    return ok({
      country,
      total_scanned: rows.length,
      duplicate_zips: duplicates.length,
      zips: duplicates.slice(0, limit),
    });
  } catch (e: any) {
    const status = e?.status === 403 ? 403 : 500;
    return bad(e?.message ?? "Failed", status);
  }
}
