import { supabaseService } from "@/lib/supabase";
import { requireAdmin } from "@/app/api/_admin";
import { fetchAllPaged } from "@/lib/supabasePaging";

function toCsvValue(v: any) {
  const s = String(v ?? "");
  // escape quotes
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();

  const supabase = supabaseService();
  let data: any[] = [];
  try {
    data = await fetchAllPaged<any>(
      (from, to) =>
        supabase
          .from("dealers")
          .select("id,name,street,zip,city,country,lat,lng,geocode_status")
          .or("lat.is.null,lng.is.null")
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("id", { ascending: true })
          .range(from, to),
      { pageSize: 1000, maxRows: 10000 }
    );
  } catch (e: any) {
    return new Response(`error;${e?.message ?? "Failed"}`, { status: 500 });
  }

  const filtered = (data ?? []).filter((d: any) => {
    if (!q) return true;
    const hay = `${d.name ?? ""} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  // Semicolon CSV for German Excel; include sep header.
  const header = [
    "id",
    "name",
    "street",
    "zip",
    "city",
    "country",
    "lat",
    "lng",
    "geocode_status",
  ];

  const lines: string[] = [];
  lines.push("sep=;");
  lines.push(header.join(";"));

  for (const d of filtered) {
    const row = [
      d.id,
      d.name,
      d.street,
      d.zip,
      d.city,
      d.country,
      d.lat,
      d.lng,
      d.geocode_status,
    ].map(toCsvValue);
    lines.push(row.join(";"));
  }

  // Add UTF-8 BOM so Excel opens correctly
  const csv = "\ufeff" + lines.join("\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="haendler_ohne_geodaten.csv"`,
      "cache-control": "no-store",
    },
  });
}
