export const dynamic = "force-dynamic";

import * as XLSX from "xlsx";
import { supabaseService } from "@/lib/supabase";
import { bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { fetchAllPaged } from "@/lib/supabasePaging";
import { cleanDealerName } from "@/lib/normalize";

type DealerRow = {
  id: string;
  name: string;
  street: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  country_iso: string | null;
  status?: string | null;
  merged_into?: string | null;
  parent_dealer_id?: string | null;
  branch_label?: string | null;
  buying_group_key?: string | null;
  lat?: number | null;
  lng?: number | null;
  geocode_status?: any;
};

function countryOf(d: DealerRow): string | null {
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

    const rows = await fetchAllPaged<DealerRow>(
      (from, to) =>
        supabase
          .from("dealers")
          .select(
            "id,name,street,zip,city,country,country_iso,status,merged_into,parent_dealer_id,branch_label,buying_group_key,lat,lng,geocode_status"
          )
          .is("merged_into", null)
          .order("zip", { ascending: true, nullsFirst: false })
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 50000 }
    );

    // group by zip -> keep only zips that occur >=2
    const byZip = new Map<string, DealerRow[]>();
    for (const d of rows ?? []) {
      const c = countryOf(d);
      if (!c || c !== country) continue;
      const z = String(d.zip ?? "").trim();
      if (!z) continue;
      const arr = byZip.get(z) ?? [];
      arr.push(d);
      byZip.set(z, arr);
    }

    const dupZip = new Set(Array.from(byZip.entries()).filter(([, arr]) => arr.length >= 2).map(([z]) => z));

    const outRows = (rows ?? [])
      .filter((d) => {
        const c = countryOf(d);
        if (!c || c !== country) return false;
        const z = String(d.zip ?? "").trim();
        return z && dupZip.has(z);
      })
      .map((d) => {
        const z = String(d.zip ?? "").trim();
        const clean = cleanDealerName(d.name);
        return {
          zip: z,
          name_clean: clean,
          name_original: String(d.name ?? ""),
          street: d.street ?? "",
          city: d.city ?? "",
          country_iso: d.country_iso ?? "",
          country: d.country ?? "",
          dealer_id: d.id,
          status: d.status ?? "",
          buying_group_key: d.buying_group_key ?? "",
          parent_dealer_id: d.parent_dealer_id ?? "",
          branch_label: d.branch_label ?? "",
          lat: d.lat ?? "",
          lng: d.lng ?? "",
          geocode_status: d.geocode_status ?? "",
        };
      });

    // sort by zip then cleaned name
    outRows.sort((a: any, b: any) => (a.zip || "").localeCompare(b.zip || "") || (a.name_clean || "").localeCompare(b.name_clean || ""));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(outRows);
    XLSX.utils.book_append_sheet(wb, ws, `PLZ-Dubletten-${country}`);

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `plz-dubletten_${country.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(buf as any, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename=\"${filename}\"`,
      },
    });
  } catch (e: any) {
    const status = e?.status === 403 ? 403 : 500;
    return bad(e?.message ?? "Failed", status);
  }
}
