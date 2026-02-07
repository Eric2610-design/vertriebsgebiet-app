import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  const supabase = supabaseService();
  const { data: groups, error } = await supabase
    .from("buying_groups")
    .select("key,label,icon_data_url,icon_missing")
    .order("label", { ascending: true });

  if (error) return bad(error.message, 500);

  const keys = (groups ?? []).map((g: any) => g.key);
  let dealers: any[] = [];
  if (keys.length) {
    const dRes = await supabase
      .from("dealers")
      .select("id,name,street,zip,city,country,buying_group_key,dealer_manufacturers(manufacturer_key)")
      .in("buying_group_key", keys)
      .order("name", { ascending: true });
    if (dRes.error) return bad(dRes.error.message, 500);
    dealers = (dRes.data ?? []).map((d: any) => {
      const manufacturer_keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
      const { dealer_manufacturers, ...rest } = d;
      return { ...rest, manufacturer_keys };
    });
  }

  const byKey: Record<string, any[]> = {};
  for (const d of dealers) {
    const k = d.buying_group_key;
    if (!k) continue;
    (byKey[k] ||= []).push(d);
  }

  return ok({ items: (groups ?? []).map((g: any) => ({ ...g, dealers: byKey[g.key] || [] })) });
}
