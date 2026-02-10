import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { requireAdmin } from "@/app/api/_admin";
import { fetchAllPaged } from "@/lib/supabasePaging";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const sort = (url.searchParams.get("sort") || "updated").trim(); // updated | zip | buying_group

    const supabase = supabaseService();
    // Dealers without coordinates (lat or lng missing)
    const build = () =>
      supabase
        .from("dealers")
        .select(
          "id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,buying_group_key,dealer_manufacturers(manufacturer_key),updated_at"
        )
        .or("lat.is.null,lng.is.null")
        .order(sort === "buying_group" ? "buying_group_key" : sort === "zip" ? "zip" : "updated_at", {
          ascending: sort === "zip" || sort === "buying_group",
          nullsFirst: false,
        })
        .order("zip", { ascending: true, nullsFirst: false })
        .order("city", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true });

    let data: any[] = [];
    try {
      data = await fetchAllPaged<any>(
        (from, to) => build().range(from, to),
        { pageSize: 1000, maxRows: 10000 }
      );
    } catch (e: any) {
      return bad(e?.message ?? "Failed to load", 500);
    }

    const mapped = (data ?? []).map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      const { dealer_manufacturers, ...rest } = d;
      return { ...rest, manufacturer_keys };
    });

    const items = mapped.filter((d: any) => {
      if (!q) return true;
      const hay = `${d.name ?? ""} ${d.street ?? ""} ${d.zip ?? ""} ${d.city ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

    return ok({ items });
  } catch (e: any) {
    const status = e?.status === 403 ? 403 : 500;
    return bad(e?.message ?? "Failed", status);
  }
}
