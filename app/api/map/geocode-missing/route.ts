import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServer } from "../../../../lib/supabase/server";
import { createSupabaseAdmin } from "../../../../lib/supabase/admin";

const BodySchema = z.object({
  workspaceId: z.string().uuid(),
  limit: z.number().int().min(1).max(25).optional(),
  territoryOnly: z.boolean().optional(),
});

function territoryOk(zipcode: string | null): boolean {
  if (!zipcode) return false;
  const p2 = zipcode.slice(0, 2);
  const n = parseInt(p2, 10);
  if (Number.isNaN(n)) return false;
  return (n >= 35 && n <= 36) || (n >= 53 && n <= 57) || (n >= 60 && n <= 69);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: Request) {
  try {
    const supabase = createSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const body = BodySchema.parse(await req.json());
    const limit = body.limit ?? 15;
    const territoryOnly = body.territoryOnly ?? true;

    const admin = createSupabaseAdmin();
    const db = admin.schema("app");

    const { data: mem } = await db
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", body.workspaceId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!mem) return NextResponse.json({ error: "Kein Zugriff auf Workspace." }, { status: 403 });

    // fehlende Koordinaten holen
    const { data: locs, error: locErr } = await db
      .from("dealer_locations")
      .select("id, street, zipcode, city, country, lat, lng")
      .eq("workspace_id", body.workspaceId)
      .eq("is_primary", true)
      .or("lat.is.null,lng.is.null")
      .limit(200);

    if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });

    let candidates = (locs ?? []).filter((l: any) => {
      const zip = (l.zipcode ?? null) as string | null;
      if (territoryOnly && !territoryOk(zip)) return false;
      const street = String(l.street ?? "").trim();
      const city = String(l.city ?? "").trim();
      const z = String(l.zipcode ?? "").trim();
      return !!(city && z); // minimal
    });

    candidates = candidates.slice(0, limit);

    let updated = 0;
    const problems: any[] = [];

    for (const l of candidates as any[]) {
      const street = String(l.street ?? "").trim();
      const city = String(l.city ?? "").trim();
      const zipcode = String(l.zipcode ?? "").trim();
      const country = String(l.country ?? "DE").trim();

      const params = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        countrycodes: country.toLowerCase() === "de" ? "de" : "",
        city,
        postalcode: zipcode,
      });

      if (street) params.set("street", street);

      const u = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

      try {
        const res = await fetch(u, {
          headers: {
            "User-Agent": "vertriebsgebiet-app/1.0 (geocode; contact: admin)",
            "Accept": "application/json",
          },
        });

        if (!res.ok) {
          problems.push({ id: l.id, error: `HTTP ${res.status}` });
          await sleep(1100);
          continue;
        }

        const json: any[] = await res.json();
        const hit = json?.[0];
        if (!hit?.lat || !hit?.lon) {
          problems.push({ id: l.id, error: "no result" });
          await sleep(1100);
          continue;
        }

        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          problems.push({ id: l.id, error: "invalid coords" });
          await sleep(1100);
          continue;
        }

        const { error: upErr } = await db
          .from("dealer_locations")
          .update({
            lat,
            lng,
            geocoded_at: new Date().toISOString(),
            geocode_provider: "nominatim",
          })
          .eq("id", l.id);

        if (!upErr) updated += 1;
        else problems.push({ id: l.id, error: upErr.message });

        // Nominatim freundlich: ca. 1 req/sec
        await sleep(1100);
      } catch (e: any) {
        problems.push({ id: l.id, error: e?.message ?? "fetch failed" });
        await sleep(1100);
      }
    }

    // remaining (optional)
    const { count: remaining } = await db
      .from("dealer_locations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", body.workspaceId)
      .eq("is_primary", true)
      .or("lat.is.null,lng.is.null");

    return NextResponse.json({ updated, remaining: remaining ?? null, problems });
  } catch (e: any) {
    const msg = e?.issues ? JSON.stringify(e.issues) : (e?.message ?? "Geocode failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
