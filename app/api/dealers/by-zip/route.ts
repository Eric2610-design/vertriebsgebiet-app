import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getDealerScope, dealerInTerritory } from "@/app/api/_dealerScope";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const scope = await getDealerScope();
  const url = new URL(req.url);
  const zip = (url.searchParams.get("zip") ?? "").trim();

  if (!zip) return ok({ items: [] });

  const { data, error } = await supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,parent_dealer_id,branch_label,buying_group_key,dealer_manufacturers(manufacturer_key)"
    )
    .eq("zip", zip)
    .order("name", { ascending: true })
    .limit(250);

  if (error) return bad(error.message, 500);

  let items = (data ?? []).map((d: any) => {
    const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
    const { dealer_manufacturers, ...rest } = d;
    return { ...rest, manufacturer_keys };
  });

  if (scope) {
    items = items.filter((d: any) => dealerInTerritory(d, scope.territories, scope.allowedCountries));
  }

  return ok({ items });
}
