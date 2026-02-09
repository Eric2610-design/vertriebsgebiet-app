import * as XLSX from "xlsx";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getDealerScope, dealerInTerritory } from "@/app/api/_dealerScope";

// Export a set of dealer ids to an .xlsx file.
// Used for the "Händler im Kartenausschnitt" list.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) return bad("Keine Händler-IDs übergeben", 400);

    const supabase = supabaseService();
    const scope = await getDealerScope();
    const { data, error } = await supabase
      .from("dealers")
      .select(
        `
          id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,notes,buying_group_key,
          dealer_manufacturers!left(manufacturer_key)
        `
      )
      .in("id", ids);

    if (error) return bad(error.message, 500);

    const scoped = scope ? (data ?? []).filter((d: any) => dealerInTerritory(d, scope.territories, scope.allowedCountries)) : (data ?? []);

    const rows = scoped.map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key).join(",");
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
