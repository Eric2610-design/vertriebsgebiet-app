import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 50);

  if (!id) return bad("Missing id", 400);

  const { data: tRow, error: tErr } = await supabase
    .from("dealers")
    .select("id,country_iso")
    .eq("id", id)
    .maybeSingle();
  if (tErr) return bad(tErr.message, 500);
  if (!tRow) return bad("Dealer not found", 404);

  const countryIso = String(tRow?.country_iso ?? "").trim();
  if (!countryIso) return ok({ items: [] });

  let query = supabase
    .from("dealers")
    .select("id,name,street,zip,city,country,country_iso,lat,lng")
    .eq("country_iso", countryIso)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("zip", { ascending: true, nullsFirst: false })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .limit(limit);

  if (q.length >= 2) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);

  return ok({ items: data ?? [] });
}
