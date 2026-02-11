import { z } from "zod";
import { supabaseService } from "@/lib/supabase";
import { ok, bad } from "@/app/api/_util";
import { cleanDealerName, normText } from "@/lib/normalize";

const DealerUpdateSchema = z.object({
  dealer: z.object({
    name: z.string().min(1),
    street: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    opening_hours: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    lat: z.number().nullable().optional(),
    lng: z.number().nullable().optional(),
    geocode_status: z.string().nullable().optional(),
    parent_dealer_id: z.string().uuid().nullable().optional(),
    branch_label: z.string().nullable().optional(),
  })
});

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const supabase = supabaseService();
  const { data: dealer, error } = await supabase
    .from("v_dealers_master")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return bad(error.message, 500);

  // Falls der Händler nicht in der Master-View ist (z.B. gemerged/ausgeschlossen),
  // geben wir einen Hinweis zurück, damit die UI ggf. zum Master umleiten kann.
  if (!dealer) {
    try {
      const { data: raw, error: rErr } = await supabase
        .from("dealers")
        .select("id,name,status,merged_into,parent_dealer_id,branch_label")
        .eq("id", params.id)
        .maybeSingle();
      if (rErr) return ok({ dealer: null });
      if (!raw) return ok({ dealer: null });

      const mergedInto = (raw as any)?.merged_into ? String((raw as any).merged_into) : null;
      if (mergedInto) {
        return ok({ dealer: null, redirect_to: mergedInto, reason: "merged" });
      }

      // Exists, but not visible in master view
      return ok({ dealer: null, reason: "filtered" });
    } catch {
      return ok({ dealer: null });
    }
  }

  let buying_group: any = null;
  if ((dealer as any).buying_group_key) {
    const { data: bg } = await supabase
      .from("buying_groups")
      .select("key,label,icon_data_url,icon_missing")
      .eq("key", (dealer as any).buying_group_key)
      .maybeSingle();
    buying_group = bg ?? null;
  }

  const { data: manufacturers } = await supabase
    .from("dealer_manufacturers")
    .select("manufacturer_key")
    .eq("dealer_id", params.id);

  const { data: sources } = await supabase
    .from("dealer_sources")
    .select("id,source,external_id,source_url,created_at")
    .eq("dealer_id", params.id)
    .order("source", { ascending: true });

  const { data: visits } = await supabase
    .from("visits")
    .select("id,note,created_at")
    .eq("dealer_id", params.id)
    .order("created_at", { ascending: false });

  const { data: contacts } = await supabase
    .from("dealer_contacts")
    .select("id,role,name,email,phone,created_at,updated_at")
    .eq("dealer_id", params.id)
    .order("role", { ascending: true })
    .order("name", { ascending: true });

  return ok({
    dealer,
    buying_group,
    manufacturers: (manufacturers ?? []).map((m: any) => ({ key: m.manufacturer_key })),
    // sources are kept server-side, but not shown in UI
    sources: sources ?? [],
    visits: visits ?? [],
    contacts: contacts ?? [],
  });
}


export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  try {
    const supabase = supabaseService();
    const body = DealerUpdateSchema.parse(await req.json());

    const dealerId = params.id;

    const name = cleanDealerName(body.dealer.name);
    const street = body.dealer.street?.trim() ?? null;
    const city = body.dealer.city?.trim() ?? null;
    const zip = body.dealer.zip?.trim() ?? null;

    // AD-/User-Eingaben sollen immer Vorrang haben:
    // Wir schreiben sie als Overrides (nicht direkt in dealers), damit künftige Uploads sie nicht überschreiben.
    const overrides: { dealer_id: string; field_name: string; field_value: string }[] = [];
    const pushOv = (field_name: string, value: any) => {
      if (value === undefined || value === null) return;
      const v = String(value).trim();
      if (!v) return;
      overrides.push({ dealer_id: dealerId, field_name, field_value: v });
    };

    pushOv("name", name);
    if (street) pushOv("street", street);
    if (zip) pushOv("zip", zip);
    if (city) pushOv("city", city);

    // UI nutzt aktuell body.dealer.country → wir speichern als country_iso (DE/AT/CH)
    if (body.dealer.country?.trim()) pushOv("country_iso", body.dealer.country.trim());

    if (body.dealer.phone?.trim()) pushOv("phone", body.dealer.phone.trim());
    if (body.dealer.email?.trim()) pushOv("email", body.dealer.email.trim());
    if (body.dealer.website?.trim()) pushOv("website", body.dealer.website.trim());
    if (body.dealer.opening_hours?.trim()) pushOv("opening_hours", body.dealer.opening_hours.trim());
    if (body.dealer.notes?.trim()) pushOv("notes", body.dealer.notes.trim());

    // Manuelle Geo-Eingabe: als Override + optional dealers.lat/lng setzen (damit es auch ohne View sichtbar ist)
    if (typeof body.dealer.lat === "number" && typeof body.dealer.lng === "number") {
      pushOv("lat", body.dealer.lat);
      pushOv("lng", body.dealer.lng);

      // Optional: auch am Dealer speichern (praktisch fürs Backend / Debug)
      const { error: geoErr } = await supabase
        .from("dealers")
        .update({ lat: body.dealer.lat, lng: body.dealer.lng, geocode_status: "manual" })
        .eq("id", dealerId);
      if (geoErr) return bad(geoErr.message, 500);
    }

    if (overrides.length) {
      const { error: oErr } = await supabase
        .from("dealer_field_overrides")
        .upsert(
          overrides.map((o) => ({ ...o, updated_at: new Date().toISOString() })),
          { onConflict: "dealer_id,field_name" }
        );
      if (oErr) return bad(oErr.message, 500);
    }

    // Struktur-Felder + sichtbare Basisfelder direkt auf dealers,
    // damit Änderungen SOFORT überall erscheinen (Karte, Listen, Views).
    const structural: any = {
      name,
      street,
      zip,
      city,
      country: body.dealer.country?.trim() ?? null,
      phone: body.dealer.phone?.trim() ?? null,
      email: body.dealer.email?.trim() ?? null,
      website: body.dealer.website?.trim() ?? null,
      opening_hours: body.dealer.opening_hours?.trim() ?? null,
      notes: body.dealer.notes?.trim() ?? null,

      parent_dealer_id: body.dealer.parent_dealer_id ?? null,
      branch_label: body.dealer.branch_label?.trim() ?? null,
      // Optional: norm_* weiterhin pflegen (hilft Matching/Debug)
      norm_name: normText(name),
      norm_street: normText(street ?? ""),
      norm_city: normText(city ?? ""),
      zipcode_int: zip ? parseInt(zip.replace(/\D/g, "").padStart(5, "0"), 10) || null : null,
      country_iso: body.dealer.country?.trim() ?? null,
    };

    // Manuelle Geo-Eingabe via Dealer-Form: direkt auf dealers schreiben.
    if (typeof body.dealer.lat === "number" && typeof body.dealer.lng === "number") {
      structural.lat = body.dealer.lat;
      structural.lng = body.dealer.lng;
      structural.geocode_status = "manual";
      structural.last_geocoded_at = new Date().toISOString();
    }

    const { error } = await supabase.from("dealers").update(structural).eq("id", dealerId);
    if (error) return bad(error.message, 500);

    return ok({ ok: true });
  } catch (e: any) {
    return bad(e?.message ?? "Bad request", 400);
  }
}

export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const params = await ctx.params;
  const supabase = supabaseService();
  const { error } = await supabase.from("dealers").delete().eq("id", params.id);
  if (error) return bad(error.message, 500);
  return ok({ ok: true });
}

