import * as XLSX from "xlsx";
import { supabaseService } from "@/lib/supabase";
import { bad } from "@/app/api/_util";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    if (!ids.length) return bad("Keine Händler-IDs übergeben", 400);

    const supabase = supabaseService();

    // Export aus Master-View (falls du noch keine v_dealers_master_ui hast, nimm v_dealers_master)
    const { data, error } = await supabase
      .from("v_dealers_master")
      .select(
        "id,name,street,zip,city,country_iso,phone,email,website,opening_hours,lat,lng,geocode_status,buying_group_key,sources,source_count"
      )
      .in("id", ids);

    if (error) return bad(error.message, 500);

    const rows = (data ?? []).map((d: any) => ({
      id: d.id,
      name: d.name,
      street: d.street,
      zip: d.zip,
      city: d.city,
      country_iso: d.country_iso,
      phone: d.phone,
      email: d.email,
      website: d.website,
      opening_hours: d.opening_hours,
      lat: d.lat,
      lng: d.lng,
      geocode_status: d.geocode_status,
      buying_group_key: d.buying_group_key,
      sources: Array.isArray(d.sources) ? d.sources.join(",") : d.sources,
      source_count: d.source_count,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dealers");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new Response(buf, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="dealers_export.xlsx"`,
      },
    });
  } catch (e: any) {
    return bad(e?.message ?? "Export failed", 500);
  }
}
