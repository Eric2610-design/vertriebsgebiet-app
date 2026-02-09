import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parent_id = (url.searchParams.get("parent_id") ?? "").trim();
  if (!parent_id) return ok({ items: [] });

  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,branch_label,parent_dealer_id,buying_group_key,dealer_manufacturers(manufacturer_key)"
    )
    .eq("parent_dealer_id", parent_id)
    .order("name", { ascending: true })
    .limit(500);

  if (error) return bad(error.message, 500);
  const items = (data ?? []).map((d: any) => {
    const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
    const { dealer_manufacturers, ...rest } = d;
    return { ...rest, manufacturer_keys };
  });

  return ok({ items });
}
