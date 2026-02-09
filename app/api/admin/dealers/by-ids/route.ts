import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => String(x)).filter(Boolean) : [];
  if (!ids.length) {
    return new Response(JSON.stringify({ items: [] }), { headers: { "content-type": "application/json" } });
  }

  const supabase = supabaseService();
  const { data, error } = await supabase
    .from("dealers")
    .select("id,name,street,zip,city,country,lat,lng,geocode_status")
    .in("id", ids);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ items: data ?? [] }), {
    headers: { "content-type": "application/json" },
  });
}
