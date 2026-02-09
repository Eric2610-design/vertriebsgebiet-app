import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { joinAddress } from "@/lib/normalize";
import { requireAdmin } from "@/app/api/_admin";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST() {
  await requireAdmin();
  const supabase = supabaseService();

  const { data: dealers, error } = await supabase
    .from("dealers")
    .select("id,street,zip,city,country,lat,lng,geocode_status")
    .is("lat", null)
    .is("lng", null)
    .in("geocode_status", ["missing", "failed"])
    .limit(40);

  if (error) return bad(error.message, 500);

  let okCount = 0;
  let failed = 0;

  for (const d of dealers ?? []) {
    const q = joinAddress(d.street, d.zip, d.city, d.country || "DE");
    if (!q) continue;

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "user-agent": "dealer-tool/0.1 (contact: local)" } });
      const js = await res.json();
      const best = Array.isArray(js) && js.length ? js[0] : null;
      if (!best?.lat || !best?.lon) {
        await supabase.from("dealers").update({ geocode_status: "failed" }).eq("id", d.id);
        failed++;
      } else {
        await supabase.from("dealers").update({
          lat: Number(best.lat),
          lng: Number(best.lon),
          geocode_status: "ok",
          last_geocoded_at: new Date().toISOString(),
        }).eq("id", d.id);
        okCount++;
      }
    } catch {
      await supabase.from("dealers").update({ geocode_status: "failed" }).eq("id", d.id);
      failed++;
    }

    // Respect Nominatim rate limit
    await sleep(1100);
  }

  return ok({ ok: okCount, failed });
}
