import { requireAdmin } from "@/app/api/_admin";
import { supabaseService } from "@/lib/supabase";
import { coordsMatchCountry } from "@/lib/geo/countryBounds";

type Update = { id: string; lat: number; lng: number };

export async function POST(req: Request) {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const updates: Update[] = Array.isArray(body?.updates)
    ? body.updates
        .map((u: any) => ({ id: String(u?.id ?? "").trim(), lat: Number(u?.lat), lng: Number(u?.lng) }))
        .filter((u: Update) => u.id && Number.isFinite(u.lat) && Number.isFinite(u.lng))
    : [];

  if (!updates.length) {
    return new Response(JSON.stringify({ ok: true, updated: 0, skipped: 0, invalid_country: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = supabaseService();

  // Load country of dealers
  const ids = updates.map((u) => u.id);
  const { data: dealers, error: dErr } = await supabase.from("dealers").select("id,country").in("id", ids);
  if (dErr) {
    return new Response(JSON.stringify({ error: dErr.message }), { status: 500 });
  }
  const countryById = new Map<string, string | null>();
  for (const d of dealers ?? []) countryById.set((d as any).id, (d as any).country ?? null);

  const invalid_country: { id: string; country: string | null; lat: number; lng: number }[] = [];
  const not_found: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const u of updates) {
    if (!countryById.has(u.id)) {
      not_found.push(u.id);
      skipped++;
      continue;
    }
    const country = countryById.get(u.id) ?? null;
    const check = coordsMatchCountry(country, u.lat, u.lng);
    if (!check.ok) {
      invalid_country.push({ id: u.id, country, lat: u.lat, lng: u.lng });
      skipped++;
      continue;
    }

    const { error } = await supabase
      .from("dealers")
      .update({ lat: u.lat, lng: u.lng, geocode_status: "manual", last_geocoded_at: new Date().toISOString() } as any)
      .eq("id", u.id);
    if (error) {
      skipped++;
      continue;
    }
    updated++;
  }

  return new Response(JSON.stringify({ ok: true, updated, skipped, invalid_country, not_found }), {
    headers: { "content-type": "application/json" },
  });
}
