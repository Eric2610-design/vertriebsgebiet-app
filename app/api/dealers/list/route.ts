export const dynamic = "force-dynamic";

import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { fetchAllPaged } from "@/lib/supabasePaging";

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  opening_hours: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: any;
  created_at: string;
  updated_at: string;
  buying_group_key?: string | null;
  status?: string | null;
  merged_into?: string | null;
};

async function countDealers(supabase: any, opts: { useStatus: boolean; useMergedInto: boolean }) {
  let q = supabase.from("dealers").select("id", { count: "exact", head: true });
  if (opts.useMergedInto) q = q.is("merged_into", null);
  if (opts.useStatus) q = q.or("status.is.null,status.not.in.(merged,merged_force,excluded)");
  const { count, error } = await q;
  if (error) throw error;
  return count ?? null;
}

async function fetchDealers(supabase: any, limit: number, opts: { useStatus: boolean; useMergedInto: boolean }) {
  return fetchAllPaged<DealerRow>(
    (from, to) => {
      let q = supabase
        .from("dealers")
        .select(
          "id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,created_at,updated_at,buying_group_key,status,merged_into"
        );

      if (opts.useMergedInto) q = q.is("merged_into", null);
      if (opts.useStatus) q = q.or("status.is.null,status.not.in.(merged,merged_force,excluded)");

      // Stable ordering is critical when paging.
      q = q.order("name", { ascending: true }).order("id", { ascending: true }).range(from, to);
      return q;
    },
    { pageSize: 1000, maxRows: limit }
  );
}

export async function GET(req: Request) {
  try {
    const supabase = supabaseService();
    const url = new URL(req.url);
    const limit = Math.min(20000, Math.max(1, Number(url.searchParams.get("limit") ?? "20000")));

    // Some schemas may not have all columns (status/merged_into). We fall back gracefully.
    const variants: Array<{ useStatus: boolean; useMergedInto: boolean }> = [
      { useStatus: true, useMergedInto: true },
      { useStatus: true, useMergedInto: false },
      { useStatus: false, useMergedInto: true },
      { useStatus: false, useMergedInto: false },
    ];

    let all: DealerRow[] = [];
    let total: number | null = null;
    let lastErr: any = null;

    for (const v of variants) {
      try {
        // Total count (for admin/diagnostics). If it fails due to missing columns we try a simpler variant.
        total = await countDealers(supabase, v).catch(() => null);
        all = await fetchDealers(supabase, limit, v);
        lastErr = null;
        break;
      } catch (e: any) {
        lastErr = e;
        continue;
      }
    }

    if (lastErr) return bad(lastErr?.message ?? "Failed to load dealers", 500);

    // Load manufacturers for these dealers.
    // NOTE: PostgREST can return "Bad Request" when `.in()` contains too many IDs.
    // Therefore we fetch manufacturers in chunks.
    const ids = all.map((d: any) => d.id).filter(Boolean);
    const manuByDealer = new Map<string, string[]>();
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: manuRows, error: mErr } = await supabase
        .from("dealer_manufacturers")
        .select("dealer_id,manufacturer_key")
        .in("dealer_id", chunk);
      if (mErr) return bad(mErr.message, 500);
      for (const r of manuRows ?? []) {
        const dealerId = String((r as any).dealer_id);
        const arr = manuByDealer.get(dealerId) ?? [];
        arr.push(String((r as any).manufacturer_key));
        manuByDealer.set(dealerId, arr);
      }
    }

    const items = all.map((d: any) => {
      const manufacturer_keys = manuByDealer.get(d.id) ?? [];
      const has_flyer = manufacturer_keys.includes("flyer");
      return { ...d, manufacturer_keys, has_flyer };
    });

    return ok({ items, total, returned: items.length });
  } catch (e: any) {
    return bad(e?.message ?? "Failed to load dealers", 500);
  }
}
