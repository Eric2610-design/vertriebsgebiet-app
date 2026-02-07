import { supabaseService } from "@/lib/supabase";
import { requireAdmin } from "@/app/api/_admin";
import { joinAddress } from "@/lib/normalize";

export async function POST(req: Request) {
  await requireAdmin();

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) {
    return new Response(JSON.stringify({ error: "missing_id" }), { status: 400 });
  }

  const supabase = supabaseService();
  const { data: d, error } = await supabase
    .from("dealers")
    .select("id,street,zip,city,country")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!d) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }

  const q = joinAddress(d.street, d.zip, d.city, d.country || "DE");
  if (!q) {
    return new Response(JSON.stringify({ error: "missing_address" }), { status: 400 });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "user-agent": "dealer-tool/0.1 (contact: local)" } });
    const js = await res.json();
    const best = Array.isArray(js) && js.length ? js[0] : null;
    if (!best?.lat || !best?.lon) {
      await supabase.from("dealers").update({ geocode_status: "failed" }).eq("id", id);
      return new Response(JSON.stringify({ ok: false, status: "failed" }), {
        headers: { "content-type": "application/json" },
      });
    }

    await supabase
      .from("dealers")
      .update({
        lat: Number(best.lat),
        lng: Number(best.lon),
        geocode_status: "ok",
        last_geocoded_at: new Date().toISOString(),
      })
      .eq("id", id);

    return new Response(JSON.stringify({ ok: true, lat: Number(best.lat), lng: Number(best.lon) }), {
      headers: { "content-type": "application/json" },
    });
  } catch {
    await supabase.from("dealers").update({ geocode_status: "failed" }).eq("id", id);
    return new Response(JSON.stringify({ error: "geocode_failed" }), { status: 500 });
  }
}
