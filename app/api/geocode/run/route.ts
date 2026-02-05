import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { joinAddress } from "@/lib/normalize";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  const supabase = supabaseService();

  const url = new URL(req.url);
  const batch = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? "40") || 40));

  // NOTE: Nominatim has usage limits. We keep the batch reasonably small and add delays.
  const { data: dealers, error } = await supabase
    .from("dealers")
    .select("id,street,zip,city,country,lat,lng,geocode_status")
    .is("lat", null)
    .is("lng", null)
    .in("geocode_status", ["missing", "failed"])
    .limit(batch);

  if (error) return bad(error.message, 500);

  let okCount = 0;
  let failed = 0;

  for (const d of dealers ?? []) {
    const q = joinAddress(d.street, d.zip, d.city, d.country || "DE");
    if (!q) continue;

    try {
      const apiUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(apiUrl, {
        headers: {
          "user-agent": "vertriebsgebiet-app/1.0 (contact: admin)",
          accept: "application/json",
        },
      });
      const js = (await res.json().catch(() => [])) as any[];
      const hit = js?.[0];
      if (!hit?.lat || !hit?.lon) {
        failed++;
        await supabase
          .from("dealers")
          .update({ geocode_status: "failed", last_geocoded_at: new Date().toISOString() })
          .eq("id", d.id);
      } else {
        okCount++;
        await supabase
          .from("dealers")
          .update({
            lat: Number(hit.lat),
            lng: Number(hit.lon),
            geocode_status: "ok",
            last_geocoded_at: new Date().toISOString(),
          })
          .eq("id", d.id);
      }
    } catch {
      failed++;
      await supabase
        .from("dealers")
        .update({ geocode_status: "failed", last_geocoded_at: new Date().toISOString() })
        .eq("id", d.id);
    }

    // be nice to the API
    await sleep(900);
  }

  // remaining count (approx)
  const { count } = await supabase
    .from("dealers")
    .select("id", { count: "exact", head: true })
    .is("lat", null)
    .is("lng", null)
    .in("geocode_status", ["missing", "failed"]);

  return ok({
    batch,
    processed: (dealers ?? []).length,
    ok: okCount,
    failed,
    remaining: count ?? null,
  });
}
