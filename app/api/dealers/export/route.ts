import * as XLSX from "xlsx";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

// Export a set of dealer ids to an .xlsx file.
// Used for the "Händler im Kartenausschnitt" list.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) return bad("Keine Händler-IDs übergeben", 400);

    const supabase = supabaseService();
    const { data, error } = await supabase
      .from("v_dealers_master")
      .select(`id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,notes,buying_group_key,sources,source_count`)
      .in("id", ids);

    if (error) return bad(error.message, 500);


// Load manufacturers for export (views cannot embed relationships).
const manuByDealer = new Map<string, string[]>();
if (ids.length) {
  const { data: manuRows, error: mErr } = await supabase
    .from("dealer_manufacturers")
    .select("dealer_id,manufacturer_key")
    .in("dealer_id", ids);
  if (mErr) return bad(mErr.message, 500);
  for (const r of manuRows ?? []) {
    const arr = manuByDealer.get((r as any).dealer_id) ?? [];
    arr.push((r as any).manufacturer_key);
    manuByDealer.set((r as any).dealer_id, arr);
  }
}


    const rows = (data ?? []).map((d: any) => {
      const manufacturer_keys = (manuByDealer.get(d.id) ?? []).join(",");
      return {
        id: d.id,
        name: d.name,
        street: d.street,
        zip: d.zip,
        city: d.city,
        country: d.country,
        phone: d.phone,
        email: d.email,
        website: d.website,
        opening_hours: d.opening_hours,
        lat: d.lat,
        lng: d.lng,
        geocode_status: d.geocode_status,
        buying_group_key: d.buying_group_key,
        manufacturer_keys,
        notes: d.notes,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dealers");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="dealers_export.xlsx"`,
      },
    });
  } catch (e: any) {
    return bad(e?.message ?? "Export failed", 500);
  }
}
