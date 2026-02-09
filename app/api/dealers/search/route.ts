import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { getDealerScope, dealerInTerritory } from "@/app/api/_dealerScope";

export async function GET(req: Request) {
  const supabase = supabaseService();
  const scope = await getDealerScope();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (!q) return ok({ items: [] });

  // Case-insensitive search by name; keep it small for dropdowns.
  let query = supabase
    .from("dealers")
    .select(
      "id,name,street,zip,city,country,parent_dealer_id,branch_label,buying_group_key,dealer_manufacturers(manufacturer_key)"
    )
    .ilike("name", `%${q}%`)
    .not("status", "in", "(merged,merged_force,excluded)")
    .order("name", { ascending: true })
    .limit(25);

  let { data, error } = await query;

  if (error && /column .*status/i.test(error.message)) {
    const retry = await supabase
      .from("dealers")
      .select(
        "id,name,street,zip,city,country,parent_dealer_id,branch_label,buying_group_key,dealer_manufacturers(manufacturer_key)"
      )
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(25);

    data = retry.data;
    error = retry.error;
  }
  if (error) return bad(error.message, 500);

  let items = (data ?? []).map((d: any) => {
    const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
    // keep payload small
    const { dealer_manufacturers, ...rest } = d;
    return { ...rest, manufacturer_keys };
  });

  if (scope) {
    items = items.filter((d: any) => dealerInTerritory(d, scope.territories, scope.allowedCountries));
  }

  return ok({ items });
}
