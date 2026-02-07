import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  const q = (url.searchParams.get("q") ?? "").trim();

  let query = supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,country_iso,lat,lng,merged_into,status,parent_dealer_id,branch_label,buying_group_key"
    )
    .or("lat.is.null,lng.is.null")
    .is("merged_into", null)
    .order("zip", { ascending: true, nullsFirst: false })
    .order("city", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (q.length >= 2) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) return bad(error.message, 500);

  return ok({ items: data ?? [], limit, offset });
}
