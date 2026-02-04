import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";

export async function GET() {
  const supabase = supabaseService();

  // get dealers + has_flyer
  const { data, error } = await supabase
    .from("dealers")
    .select(`
      id,name,street,zip,city,country,phone,email,website,opening_hours,lat,lng,geocode_status,notes,created_at,updated_at,
      dealer_manufacturers!left(manufacturer_key)
    `)
    .order("name", { ascending: true })
    .limit(10000);

  if (error) return bad(error.message, 500);

  const items = (data ?? []).map((d: any) => {
    const keys = (d.dealer_manufacturers ?? []).map((x: any) => x.manufacturer_key);
    const has_flyer = keys.includes("flyer");
    delete d.dealer_manufacturers;
    return { ...d, has_flyer };
  });

  return ok({ items });
}
